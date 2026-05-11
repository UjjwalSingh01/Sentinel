# Sentinel

Real-time infrastructure monitoring and AI-powered incident response platform.

## Quick Start

```bash
# Copy environment variables
cp .env.example .env

# (Optional) Add your Gemini API key to .env for AI analysis features
# GEMINI_API_KEY=your-key-here

# Start all services
docker compose up -d

# Open the dashboard
open http://localhost
```

## Demo Credentials

| Email               | Password     | Role     |
|---------------------|-------------|----------|
| admin@sentinel.io   | sentinel123 | Admin    |
| alice@sentinel.io   | sentinel123 | Engineer |
| bob@sentinel.io     | sentinel123 | Engineer |
| carol@sentinel.io   | sentinel123 | Viewer   |

## Architecture

- **Simulator** — Generates realistic metrics for 5 servers every 3 seconds
- **Ingestion Service** — Validates and publishes metrics to Redpanda
- **Stream Processor** — Consumes metrics, stores in TimescaleDB, evaluates alert rules
- **API Service** — GraphQL API (Strawberry), JWT auth, SSE streaming, Gemini AI integration
- **Frontend** — React + TypeScript + TailwindCSS + Recharts with real-time updates via SSE

## Tech Stack

| Layer          | Technology                                    |
|----------------|----------------------------------------------|
| Frontend       | React, TypeScript, Vite, TailwindCSS, Recharts |
| API            | FastAPI, Strawberry GraphQL, SSE              |
| Processing     | FastAPI, aiokafka, asyncpg                    |
| Message Broker | Redpanda (Kafka-compatible)                   |
| Time-Series DB | TimescaleDB (PostgreSQL extension)            |
| Cache/PubSub   | Redis                                         |
| AI             | Google Gemini API                             |
| Infrastructure | Docker, Docker Compose, Nginx                 |
| CI/CD          | GitHub Actions                                |

## Services

| Service    | Internal Port | Description                        |
|-----------|--------------|-------------------------------------|
| nginx     | 80           | Reverse proxy (exposed)             |
| api       | 8000         | GraphQL + REST + SSE                |
| ingestion | 8001         | Metric ingestion                    |
| processor | 8002         | Stream processing + alerting        |
| simulator | -            | Metric data generator               |

## Development

```bash
# View logs for a specific service
docker compose logs -f api

# Restart a specific service
docker compose restart processor

# Stop everything
docker compose down

# Stop and remove volumes (reset data)
docker compose down -v
```
