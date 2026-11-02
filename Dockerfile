FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
RUN useradd --create-home appuser && mkdir -p /data && chown -R appuser:appuser /app /data
USER appuser
EXPOSE 8004
CMD ["gunicorn", "--bind", "0.0.0.0:8004", "--workers", "2", "--threads", "4", "app.main:app"]
