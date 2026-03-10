"""
Sentence Builder — Buffers sign language words and uses Groq API for grammar correction.

Flow:
  Camera → Sign Model → Predicted Word + Confidence
  → Word Buffer → Pause Detection (2 sec) → Groq API → Corrected Sentence

Usage:
  builder = SentenceBuilder(on_sentence=callback_fn)
  builder.add_word("HELLO", 0.92)
  builder.add_word("I", 0.85)
  # ... after 2 seconds of silence, calls callback_fn with corrected sentence
"""

import json
import os
import time
import threading
import logging
import urllib.request
import urllib.error

logger = logging.getLogger(__name__)

# ── Groq API Setup ──────────────────────────────────────────────
# Groq API: https://api.groq.com/openai/v1/chat/completions
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")

SYSTEM_PROMPT = (
    "You convert sign language word sequences into natural English sentences. "
    "Keep the meaning but correct the grammar. "
    "Reply with ONLY the corrected sentence, nothing else."
)

# ── Configuration ───────────────────────────────────────────────
CONFIDENCE_THRESHOLD = 0.8
PAUSE_DURATION = 2.0  # seconds of silence = end of sentence
MIN_WORDS_FOR_API = 2  # don't call API for single words


def call_groq_api(words: str) -> str:
    """
    Send word sequence to Groq API for grammar correction.
    Uses urllib (stdlib) — no external dependencies needed.

    Args:
        words: Space-separated sign language words (e.g. "I GO MARKET TOMORROW")

    Returns:
        Corrected English sentence, or original words if API fails.
    """
    if not GROQ_API_KEY:
        logger.warning("[SentenceBuilder] GROQ_API_KEY not set — returning raw words")
        return words

    try:
        payload = json.dumps(
            {
                "model": GROQ_MODEL,
                "messages": [
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": f"Words:\n{words}"},
                ],
                "temperature": 0.3,
                "max_tokens": 200,
            }
        ).encode("utf-8")

        req = urllib.request.Request(
            GROQ_API_URL,
            data=payload,
            headers={
                "Authorization": f"Bearer {GROQ_API_KEY}",
                "Content-Type": "application/json",
                "User-Agent": "ApnaMeet-SignLang/1.0",
            },
            method="POST",
        )

        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))

        corrected = data["choices"][0]["message"]["content"].strip()
        logger.info("[SentenceBuilder] Groq: '%s' → '%s'", words, corrected)
        return corrected

    except Exception as e:
        logger.error("[SentenceBuilder] Groq API error: %s", e)
        return words  # Fallback: return raw words


class SentenceBuilder:
    """
    Buffers predicted sign language words and detects sentence boundaries
    via pause detection. When a pause is detected, sends accumulated words
    to Grok API for grammar correction.

    Args:
        on_sentence: Callback function(raw_words: str, corrected: str) called
                     when a sentence is completed and corrected.
        confidence_threshold: Minimum confidence to accept a word (default 0.8).
        pause_duration: Seconds of silence to trigger sentence end (default 2.0).
    """

    def __init__(
        self,
        on_sentence=None,
        confidence_threshold=CONFIDENCE_THRESHOLD,
        pause_duration=PAUSE_DURATION,
    ):
        self._buffer: list[str] = []
        self._last_word_time: float = 0.0
        self._last_word: str = ""
        self._confidence_threshold = confidence_threshold
        self._pause_duration = pause_duration
        self._on_sentence = on_sentence
        self._timer: threading.Timer | None = None
        self._lock = threading.Lock()

    def add_word(self, word: str, confidence: float) -> bool:
        """
        Add a predicted word to the buffer if it meets criteria.

        Args:
            word: Predicted sign label (e.g. "HELLO")
            confidence: Model confidence score (0.0 - 1.0)

        Returns:
            True if word was accepted into buffer, False if filtered out.
        """
        # Filter: confidence too low
        if confidence < self._confidence_threshold:
            return False

        # Filter: duplicate of last word (avoid stuttering)
        normalized = word.strip().upper()
        if not normalized:
            return False

        with self._lock:
            if normalized == self._last_word:
                # Still same sign — just reset the pause timer
                self._reset_timer()
                return False

            # Accept word
            self._buffer.append(normalized)
            self._last_word = normalized
            self._last_word_time = time.time()

            logger.info(
                "[SentenceBuilder] Buffered: %s (%.0f%%) — buffer: %s",
                normalized,
                confidence * 100,
                self._buffer,
            )

            # Reset pause detection timer
            self._reset_timer()
            return True

    def _reset_timer(self):
        """Reset the pause detection timer."""
        if self._timer:
            self._timer.cancel()

        self._timer = threading.Timer(self._pause_duration, self._on_pause)
        self._timer.daemon = True
        self._timer.start()

    def _on_pause(self):
        """Called when no new word is detected for pause_duration seconds."""
        with self._lock:
            if not self._buffer:
                return

            raw_words = " ".join(self._buffer)
            word_count = len(self._buffer)

            # Reset buffer immediately
            self._buffer.clear()
            self._last_word = ""

        logger.info("[SentenceBuilder] Pause detected — processing: '%s'", raw_words)

        # For single words, skip API call
        if word_count < MIN_WORDS_FOR_API:
            corrected = raw_words
        else:
            corrected = call_groq_api(raw_words)

        # Deliver result
        if self._on_sentence:
            self._on_sentence(raw_words, corrected)
        else:
            print(f"\n{'='*50}")
            print(f"  Raw words:  {raw_words}")
            print(f"  Corrected:  {corrected}")
            print(f"{'='*50}\n")

    def detect_pause(self) -> bool:
        """
        Check if enough time has passed since last word to constitute a pause.
        (The timer handles this automatically, but this can be polled manually.)
        """
        if not self._buffer or self._last_word_time == 0:
            return False
        return (time.time() - self._last_word_time) >= self._pause_duration

    def flush(self):
        """Force-process whatever is in the buffer right now."""
        if self._timer:
            self._timer.cancel()
        self._on_pause()

    def reset(self):
        """Clear buffer without processing."""
        with self._lock:
            if self._timer:
                self._timer.cancel()
            self._buffer.clear()
            self._last_word = ""
            self._last_word_time = 0.0
