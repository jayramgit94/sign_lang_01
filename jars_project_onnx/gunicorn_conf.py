"""Gunicorn config — run eventlet.monkey_patch() before anything else."""

import eventlet

eventlet.monkey_patch()

bind = "0.0.0.0:10000"
worker_class = "eventlet"
workers = 1
