# Production image for Render — Python 3.11, gevent worker, pinned deps.
FROM python:3.11-slim-bookworm

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements-render.txt .
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements-render.txt

COPY . .

ENV HOST=0.0.0.0
ENV SOCKETIO_ASYNC_MODE=gevent
ENV PYTHONUNBUFFERED=1

EXPOSE 10000

CMD ["gunicorn", "-c", "gunicorn_conf.py", "server:app"]
