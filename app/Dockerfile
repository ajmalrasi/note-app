FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 DAYNOTE_DATA=/data
WORKDIR /app
COPY requirements.lock /app/requirements.lock
RUN pip install --no-cache-dir -r requirements.lock && useradd --uid 10001 --create-home daynote
COPY server.py /app/server.py
COPY static /app/static
USER 10001:10001
EXPOSE 8240
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8240/healthz', timeout=3).read()"
CMD ["uvicorn", "server:create_app", "--factory", "--host", "0.0.0.0", "--port", "8240", "--workers", "1", "--no-proxy-headers", "--no-access-log"]
