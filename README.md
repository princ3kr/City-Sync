## Quick Start (Any OS)

The fastest way to get started is using **Docker**. This sets up all databases, backend services, and the frontend in a single network.

### 1. One-command startup (Recommended)
```powershell
# Copy the example environment file if you haven't already
cp .env.example .env

# Start everything
docker-compose up --build
```

Alternatively, use the PowerShell helper:
```powershell
.\start.ps1
# Then press 'y' to use the Docker option
```

### 2. Service URLs
Once started, the platform is available at:

| Service | URL | Notes |
|---------|-----|-------|
| Citizen PWA | http://localhost:5173 | The main entry point for citizens |
| Gateway API | http://localhost:8000/docs | Swagger docs for the main API |
| Routing API | http://localhost:8001/docs | Tracking and webhook routing |
| Verification API | http://localhost:8002/docs | Verification portal docs |
| Department Portal | http://localhost:3000 | The officer/department dashboard |
| MinIO Console | http://localhost:9001 | S3-compatible storage explorer |

### 3. Sharing with Teammates
- **Environment**: Do **not** commit your `.env` file. A `.env.example` is provided for teammates to use.
- **Docker**: The project is fully containerized. Teammates only need Docker installed to run the entire project.
- **Ignore List**: `.gitignore` is pre-configured to keep the repo clean.


## Service URLs

| Service | URL | Notes |
|---------|-----|-------|
| Citizen PWA | http://localhost:5173 | React + Vite |
| Gateway API | http://localhost:8000/docs | FastAPI + Socket.io |
| Routing API | http://localhost:8001/docs | FastAPI |
| Verification API | http://localhost:8002/docs | FastAPI |
| Department Portal | http://localhost:3000 | Express + Live Dashboard |
| MinIO Console | http://localhost:9001 | `citysync_minio` / `citysync_minio_secret` |
| PostgreSQL | localhost:5432 | `citysync` / `citysync_secret` |
| Redis | localhost:6379 | |

## Architecture — 7 Layers

```
L1   Citizen Interface    → React PWA, WhatsApp/SMS (Twilio), GPS + Photo
L2   Event Streaming      → Redis Streams (raw.submissions, classified.complaints, ...)
L3   AI Processing        → gpt-4o-mini (mock) + PostGIS + Dedup Cluster + Priority Scorer
L3.5 Routing              → FastAPI routing table + HMAC webhook + Celery retry
L4   Privacy Vault        → HMAC-SHA256 tokenization + Gaussian DP noise (ε=2.0/0.5)
L5   Persistence          → PostgreSQL 16+PostGIS + MinIO + Redis sorted sets
L5.5 Verification Engine  → gpt-4o vision (mock) + PG trigger enforcement
L6   Presentation         → React+Vite + Mapbox GL JS + Socket.io
```

## Priority Formula

```
score = (severity × 2.5) + (cluster_size × 4) + (upvote_count × 2)
      + time_age_boost + weather_boost + trust_modifier

Tiers: Critical ≥85 | High 60-84 | Medium 35-59 | Low <35
```

## Two-Step Verification

No officer or admin can mark a ticket Resolved without:
1. **Step 1**: Field worker uploads after-photo → AI compares before/after (≥0.80 confidence)
2. **Step 2**: Citizen confirms YES/NO within 72 hours

A PostgreSQL trigger **rejects** any `UPDATE tickets SET status='Resolved'` that doesn't include a valid `resolution_log_id` FK.

## Mock Mode

Set `MOCK_AI=true` in `.env` (default) to run without API keys:
- Classifier → keyword-based intent/category matching
- Vision verifier → deterministic mock scores
- Notifications → console-logged
- Email → console-logged

Set `MOCK_AI=false` and add `OPENAI_API_KEY` for real AI classification.

## Database Schema

| Table | Purpose |
|-------|---------|
| `tickets` | Core entity with PG trigger on Resolved write |
| `ticket_clusters` | PostGIS cluster centroids for 50m dedup |
| `department_routes` | Category+ward → department O(1) routing |
| `severity_overrides` | Emergency bypass (Live Wire → Electricity Emergency) |
| `verification_submissions` | Step 1 + Step 2 photo records |
| `resolution_log` | Immutable resolution audit trail |
| `webhook_log` | Every outbound webhook attempt |
| `model_calls` | AI model call log (replaces MLflow) |

## Privacy

- Citizen identity → HMAC-SHA256 tokenized (irreversible without key)
- GPS coordinates → Gaussian DP noise: officers ε=2.0 (±30m), public ε=0.5 (±90m)
- Raw GPS used only for dedup cluster check, never written to DB
- Photos → AES-256 in MinIO, 10-min pre-signed URLs, 90-day TTL auto-delete
- Webhook payloads → no PII, fuzzed GPS only
