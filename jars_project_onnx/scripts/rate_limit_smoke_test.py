"""Smoke test for landmark rate limiter.

Run: python scripts/rate_limit_smoke_test.py
"""
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import server


def run():
    sid = "test-sid"
    # Burst until limit reached
    allowed = 0
    for _ in range(server.MAX_LANDMARKS_PER_10S + 2):
        if server._check_landmark_rate_limit(sid):
            allowed += 1
        else:
            break

    assert allowed == server.MAX_LANDMARKS_PER_10S

    retry_ms = server._get_landmark_retry_after_ms(sid)
    assert retry_ms >= server.LANDMARK_MIN_INTERVAL_MS

    # Wait for window to pass and ensure it allows again
    time.sleep(server.LANDMARK_WINDOW_SECONDS + 0.1)
    assert server._check_landmark_rate_limit(sid) is True

    print("Rate limit smoke test passed.")


if __name__ == "__main__":
    run()
