"""
Secure Groq API wrapper for sentence correction.

Provides:
- Input sanitization
- Lightweight in-memory rate limiting
- Timeout-bound API calls
- Safe fallback response shape
"""

import json
import os
import re
import threading
import time
import urllib.error
import urllib.request

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"

RATE_LIMIT_WINDOW_SECONDS = 60
MAX_REQUESTS_PER_WINDOW = 10
REQUEST_TIMEOUT_SECONDS = 10
_MAX_INPUT_LENGTH = 500
_MAX_OUTPUT_LENGTH = 500

_rate_lock = threading.Lock()
_rate_limit_map = {}


def _sanitize_text(text: str) -> str:
    if not isinstance(text, str):
        raise ValueError("Input must be a string")

    sanitized = text.strip()
    if len(sanitized) > _MAX_INPUT_LENGTH:
        sanitized = sanitized[:_MAX_INPUT_LENGTH]

    sanitized = re.sub(r"[\w\.-]+@[\w\.-]+\.\w+", "[EMAIL]", sanitized)
    sanitized = re.sub(r"(\+?\d{1,3}[-.\s]?)?\d{3}[-.\s]?\d{3}[-.\s]?\d{4}", "[PHONE]", sanitized)
    sanitized = re.sub(r"\b(?:\d{1,3}\.){3}\d{1,3}\b", "[IP]", sanitized)
    sanitized = re.sub(r"https?://[^\s]+", "[URL]", sanitized)
    sanitized = re.sub(r"(?:token|key|secret|api|auth)[\w\-]*:?\s*[\w\-.]{20,}", "[REDACTED]", sanitized, flags=re.IGNORECASE)
    sanitized = re.sub(r"[^\w\s\.,!?\'\"-]", "", sanitized)
    sanitized = re.sub(r"\s+", " ", sanitized).strip()

    if not sanitized:
        raise ValueError("Input became empty after sanitization")

    return sanitized


def _check_rate_limit(user_id: str = "anonymous"):
    now = time.time()
    key = f"groq_{user_id}"

    with _rate_lock:
        entry = _rate_limit_map.get(key)
        if not entry:
            entry = {"count": 0, "window_start": now}
            _rate_limit_map[key] = entry

        if now - entry["window_start"] > RATE_LIMIT_WINDOW_SECONDS:
            entry["count"] = 0
            entry["window_start"] = now

        entry["count"] += 1
        if entry["count"] > MAX_REQUESTS_PER_WINDOW:
            retry_after = int((entry["window_start"] + RATE_LIMIT_WINDOW_SECONDS) - now)
            raise RuntimeError(
                f"Rate limit exceeded. Retry after {max(retry_after, 1)}s."
            )

        return {
            "used": entry["count"],
            "remaining": max(0, MAX_REQUESTS_PER_WINDOW - entry["count"]),
        }


def _post_groq(payload: dict) -> dict:
    request_body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        GROQ_API_URL,
        data=request_body,
        headers={
            "Authorization": f"Bearer {GROQ_API_KEY}",
            "Content-Type": "application/json",
            "User-Agent": "ApnaMeet-SignLang/1.0",
        },
        method="POST",
    )

    with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT_SECONDS) as resp:
        raw = resp.read().decode("utf-8")
    return json.loads(raw)


def correct_sentence_with_groq(word_sequence: str, user_id: str = "anonymous") -> dict:
    """
    Returns:
      {
        "success": bool,
        "corrected": str,
        "error": str | None,
        "rate_limit": {"used": int, "remaining": int} | None
      }
    """
    if not GROQ_API_KEY:
        return {
            "success": False,
            "corrected": word_sequence,
            "error": "GROQ_API_KEY is not configured.",
            "rate_limit": None,
        }

    try:
        safe_words = _sanitize_text(word_sequence)
        rate_limit = _check_rate_limit(user_id)

        payload = {
            "model": GROQ_MODEL,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "Convert sign language word sequences into natural English "
                        "sentences. Correct grammar but preserve meaning. "
                        "Reply with ONLY the sentence, no extra text."
                    ),
                },
                {"role": "user", "content": f"Words:\n{safe_words}"},
            ],
            "temperature": 0.3,
            "max_tokens": 200,
        }

        response_data = _post_groq(payload)
        corrected = (
            response_data.get("choices", [{}])[0]
            .get("message", {})
            .get("content", "")
            .strip()
        )

        if not corrected:
            raise RuntimeError("Invalid Groq response")

        corrected = corrected[:_MAX_OUTPUT_LENGTH]
        corrected = re.sub(r"[^\w\s\.,!?\'\"-]", "", corrected).strip()

        return {
            "success": True,
            "corrected": corrected or safe_words,
            "error": None,
            "rate_limit": rate_limit,
        }
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError):
        return {
            "success": False,
            "corrected": word_sequence,
            "error": "Grammar correction temporarily unavailable.",
            "rate_limit": None,
        }
    except Exception as exc:
        message = str(exc)
        if "Rate limit exceeded" in message:
            return {
                "success": False,
                "corrected": word_sequence,
                "error": "Too many requests. Please try again later.",
                "rate_limit": None,
            }

        return {
            "success": False,
            "corrected": word_sequence,
            "error": "Grammar correction temporarily unavailable.",
            "rate_limit": None,
        }
