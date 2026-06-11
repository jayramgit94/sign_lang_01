"""Gunicorn config — gevent worker for Flask-SocketIO (gunicorn 26+ compatible)."""

from gevent import monkey

monkey.patch_all()

import os

bind = f"0.0.0.0:{os.getenv('PORT', '5000')}"
worker_class = "gevent"
workers = 1
timeout = 120
keepalive = 5
