#!/usr/bin/env bash
set -euo pipefail
export SOCKETIO_ASYNC_MODE="${SOCKETIO_ASYNC_MODE:-gevent}"
exec gunicorn -c gunicorn_conf.py server:app
