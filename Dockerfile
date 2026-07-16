FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY requirements.txt ./requirements.txt
RUN python -m pip install --no-cache-dir -r requirements.txt

COPY src ./src
COPY config ./config
COPY prompts ./prompts
COPY schemas ./schemas
COPY pdf-evidence ./pdf-evidence

RUN mkdir -p input/pdf input/youtube output/books output/videos \
    output/graphipy_ready output/motion cache library/youtube

ENTRYPOINT ["python", "-m", "src.cli"]
