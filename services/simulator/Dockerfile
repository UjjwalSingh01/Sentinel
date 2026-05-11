FROM python:3.12-slim AS builder

WORKDIR /build
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

FROM python:3.12-slim

RUN groupadd -r sentinel && useradd -r -g sentinel -s /bin/false sentinel

WORKDIR /app
COPY --from=builder /install /usr/local
COPY src/ ./src/

USER sentinel

CMD ["python", "-m", "src.main"]
