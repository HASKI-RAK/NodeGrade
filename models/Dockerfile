# docker build . -t sentencetransformer
FROM python:3.9-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HF_HOME=/models-cache

COPY ./requirements.docker.txt /app/requirements.txt

EXPOSE 8002

# The Docker-specific requirements use the CPU wheel so Docker Desktop does
# not need GPU support.
RUN pip install --no-cache-dir --upgrade -r /app/requirements.txt

COPY ./model_worker.py /app/model_worker.py

CMD ["python", "/app/model_worker.py"]
