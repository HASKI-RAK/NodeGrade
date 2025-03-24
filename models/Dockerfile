# docker build . -t sentencetransformer
FROM python:3.9

WORKDIR /app

COPY ./requirements.txt /app/requirements.txt

EXPOSE 8002

RUN pip install --no-cache-dir --upgrade -r /app/requirements.txt

COPY ./model_worker.py /app/model_worker.py
COPY ./.flaskenv /app/.flaskenv

CMD ["python", "-m", "flask", "run", "--host=0.0.0.0", "--port=8002"]
