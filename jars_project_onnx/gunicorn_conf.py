"""Gunicorn config — run eventlet.monkey_patch() before anything else."""

import eventlet

eventlet.monkey_patch()

import os

bind = f"0.0.0.0:{os.getenv('PORT', '5000')}"
worker_class = "eventlet"
workers = 1
