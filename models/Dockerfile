# docker build . -t sentencetransformer
FROM python:3.9-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HF_HOME=/models-cache

COPY ./requirements.txt /app/requirements.txt

EXPOSE 8002

# requirements.txt is the single source of Python deps (no separate docker file).
RUN pip install --no-cache-dir --upgrade -r /app/requirements.txt

COPY ./model_worker.py /app/model_worker.py

CMD ["python", "/app/model_worker.py"]
