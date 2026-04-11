"""
CitySync — Submission Gateway (Layer 1 + 2)
Accepts citizen complaint submissions, rate-limits, assigns ticket IDs,
publishes to Redis Stream, and returns HTTP 202 in ~140ms.
All AI processing is async — citizen is unblocked immediately.
"""
import base64
import hashlib
import time
import uuid
from datetime import datetime, timezone
from typing import Optional

import socketio
from fastapi import FastAPI, Depends, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from shared.config import settings
from shared.logging_config import configure_logging, get_logger, set_trace_id, set_ticket_id
from shared.auth import create_token, get_current_user
from shared.privacy import hmac_tokenize, strip_exif
from shared.redis_client import publish_event, get_redis, Streams, get_top_categories
from shared.schemas import SubmitComplaintRequest, SubmitComplaintResponse, TicketListResponse
from gateway.rate_limiter import check_rate_limit

configure_logging(settings.log_level)
log = get_logger("gateway")

# ── FastAPI app ───────────────────────────────────────────────────────────────
app = FastAPI(
    title="CitySync Gateway",
    description="Citizen complaint submission gateway",
    version="1.0.0",
    docs_url="/docs",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Socket.io for real-time push ──────────────────────────────────────────────
sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins="*",
    logger=False,
    engineio_logger=False,
)
socket_app = socketio.ASGIApp(sio, other_asgi_app=app)


@sio.event
async def connect(sid, environ):
    log.info("websocket_connected", sid=sid)


@sio.event
async def disconnect(sid):
    log.info("websocket_disconnected", sid=sid)


@sio.event
async def subscribe_ward(sid, data):
    """Subscribe client to a ward room for real-time updates."""
    ward_id = data.get("ward_id")
    if ward_id:
        await sio.enter_room(sid, f"ward:{ward_id}")
        log.info("client_subscribed_ward", sid=sid, ward_id=ward_id)


@sio.event
async def subscribe_ticket(sid, data):
    """Subscribe client to a specific ticket room."""
    ticket_id = data.get("ticket_id")
    if ticket_id:
        await sio.enter_room(sid, f"ticket:{ticket_id}")


# ── Helper: generate ticket ID ────────────────────────────────────────────────
def generate_ticket_id() -> str:
    """TKT-XXXXXXXXXX format — 10 alphanumeric chars."""
    suffix = uuid.uuid4().hex[:10].upper()
    return f"TKT-{suffix}"


# ── Startup ───────────────────────────────────────────────────────────────────
@app.on_event("startup")
async def startup():
    from shared.redis_client import create_consumer_group, Streams
    # Ensure consumer groups exist for all streams
    for stream in [
        Streams.RAW_SUBMISSIONS, Streams.CLASSIFIED_COMPLAINTS,
        Streams.PRIORITY_BOOST, Streams.STATUS_UPDATES,
    ]:
        await create_consumer_group(stream, "citysync", start_id="$")
    log.info("gateway_started", port=settings.gateway_port)


# ── Routes ────────────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    r = await get_redis()
    redis_ok = await r.ping()
    return {
        "status": "ok",
        "service": "citysync-gateway",
        "redis": "ok" if redis_ok else "error",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.post("/api/submit", response_model=SubmitComplaintResponse, status_code=202)
async def submit_complaint(
    request: Request,
    payload: SubmitComplaintRequest,
    user: dict = Depends(get_current_user),
):
    """
    Citizen complaint submission endpoint.
    Returns 202 immediately (~140ms). All AI processing is async.
    """
    t_start = time.perf_counter()
    trace_id = set_trace_id()

    # ── 1. Extract citizen identity → HMAC token ─────────────────────────────
    # Use JWT sub, or fall back to IP address for anonymous citizens
    raw_identity = user.get("sub") or request.client.host
    citizen_token = hmac_tokenize(raw_identity)

    # ── 2. Rate limit check ───────────────────────────────────────────────────
    try:
        await check_rate_limit(citizen_token)
    except HTTPException:
        r = await get_redis()
        await r.incr("citysync:metrics:rate_limit_hits")
        raise

    # ── 3. Assign ticket ID ────────────────────────────────────────────────────
    ticket_id = generate_ticket_id()
    set_ticket_id(ticket_id)
    log.info("complaint_received", ticket_id=ticket_id, trace_id=trace_id)

    # ── 4. Process image (strip EXIF, validate hash) ──────────────────────────
    image_key = None
    extracted_gps = None

    if payload.image_base64:
        try:
            image_bytes = base64.b64decode(payload.image_base64)

            # Validate SHA-256 hash if provided
            if payload.sha256_hash:
                actual_hash = hashlib.sha256(image_bytes).hexdigest()
                if actual_hash != payload.sha256_hash:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Image SHA-256 hash mismatch — possible tampering",
                    )

            # Strip EXIF, extract GPS coordinates
            clean_bytes, extracted_gps = strip_exif(image_bytes)

            # Upload to MinIO
            from shared.minio_client import upload_photo
            image_key = upload_photo(ticket_id, "before", clean_bytes)
            log.info("image_uploaded", ticket_id=ticket_id, image_key=image_key)
        except Exception as e:
            log.warning("image_processing_failed", ticket_id=ticket_id, error=str(e))
            # Don't fail submission — process without image

    # ── 5. Determine GPS coordinates ──────────────────────────────────────────
    # Priority: explicit payload GPS > EXIF GPS > None (geocoder will resolve from description)
    lat = payload.latitude or (extracted_gps["lat"] if extracted_gps else None)
    lng = payload.longitude or (extracted_gps["lng"] if extracted_gps else None)

    # ── 6. Issue new bearer token for this citizen session ────────────────────
    bearer_token = create_token(citizen_token, role="citizen", extra={"ticket_ref": ticket_id})

    # ── 7. Publish to Redis Stream raw.submissions ───────────────────────────
    event_data = {
        "ticket_id": ticket_id,
        "trace_id": trace_id,
        "citizen_token": citizen_token,
        "description": payload.description,
        "language": payload.language,
        "raw_lat": str(lat) if lat else "",
        "raw_lng": str(lng) if lng else "",
        "image_key": image_key or "",
        "submitted_at": datetime.now(timezone.utc).isoformat(),
    }

    await publish_event(Streams.RAW_SUBMISSIONS, event_data)
    log.info("event_published", stream=Streams.RAW_SUBMISSIONS, ticket_id=ticket_id)

    # ── 8. Track metrics ──────────────────────────────────────────────────────
    r = await get_redis()
    await r.incr("citysync:metrics:request_count")
    latency_ms = (time.perf_counter() - t_start) * 1000
    await r.lpush("citysync:metrics:latencies", round(latency_ms))
    await r.ltrim("citysync:metrics:latencies", 0, 999)  # keep last 1000

    log.info("complaint_accepted", ticket_id=ticket_id, latency_ms=round(latency_ms, 1))

    return SubmitComplaintResponse(
        ticket_id=ticket_id,
        status="Processing",
        message="Complaint received. Our AI is classifying and routing it now.",
        bearer_token=bearer_token,
        estimated_processing_ms=400,
    )


@app.get("/api/tickets/{ticket_id}")
async def get_ticket(
    ticket_id: str,
    user: dict = Depends(get_current_user),
):
    """Get ticket status — response fields filtered by caller role."""
    from sqlalchemy import select, func, cast, Float
    from shared.database import get_db
    from shared.models import Ticket
    from shared.auth import filter_ticket_fields

    async with get_db() as session:
        # Extract lat/lng from PostGIS fuzzed_gps column
        query = select(
            Ticket,
            func.ST_Y(func.ST_GeomFromWKB(Ticket.fuzzed_gps)).cast(Float).label("lat"),
            func.ST_X(func.ST_GeomFromWKB(Ticket.fuzzed_gps)).cast(Float).label("lng"),
        ).where(Ticket.id == ticket_id)
        result = await session.execute(query)
        row = result.first()
        if not row:
            raise HTTPException(status_code=404, detail=f"Ticket {ticket_id} not found")
        ticket, lat, lng = row

    role = user.get("role", "public")
    ticket_dict = {
        "ticket_id": ticket.id,
        "category": ticket.category,
        "severity": ticket.severity,
        "severity_tier": ticket.severity_tier,
        "priority_score": ticket.priority_score,
        "status": ticket.status,
        "description": ticket.description,
        "ward_id": ticket.ward_id,
        "submitted_at": ticket.submitted_at.isoformat() if ticket.submitted_at else None,
        "updated_at": ticket.updated_at.isoformat() if ticket.updated_at else None,
        "upvote_count": ticket.upvote_count,
        "citizen_token": ticket.citizen_token,
        "raw_lat": lat,
        "raw_lng": lng,
    }
    return filter_ticket_fields(ticket_dict, role)


@app.get("/api/tickets")
async def list_tickets(
    ward_id: Optional[str] = None,
    status: Optional[str] = None,
    category: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    user: dict = Depends(get_current_user),
):
    """List tickets with optional filters. Results filtered by caller role."""
    from sqlalchemy import select, func, cast, Float
    from shared.database import get_db
    from shared.models import Ticket
    from shared.auth import filter_ticket_fields

    page_size = min(page_size, 100)
    offset = (page - 1) * page_size

    async with get_db() as session:
        # Extract lat/lng from PostGIS fuzzed_gps column
        query = select(
            Ticket,
            func.ST_Y(func.ST_GeomFromWKB(Ticket.fuzzed_gps)).cast(Float).label("lat"),
            func.ST_X(func.ST_GeomFromWKB(Ticket.fuzzed_gps)).cast(Float).label("lng"),
        )
        if ward_id:
            query = query.where(Ticket.ward_id == ward_id)
        if status:
            query = query.where(Ticket.status == status)
        if category:
            query = query.where(Ticket.category == category)
        query = query.order_by(Ticket.priority_score.desc()).offset(offset).limit(page_size)
        result = await session.execute(query)
        rows = result.all()

    role = user.get("role", "public")
    filtered = []
    for t, lat, lng in rows:
        td = {
            "ticket_id": t.id,
            "category": t.category,
            "severity": t.severity,
            "severity_tier": t.severity_tier,
            "priority_score": t.priority_score,
            "status": t.status,
            "description": t.description,
            "ward_id": t.ward_id,
            "submitted_at": t.submitted_at.isoformat() if t.submitted_at else None,
            "updated_at": t.updated_at.isoformat() if t.updated_at else None,
            "upvote_count": t.upvote_count,
            "citizen_token": t.citizen_token,
            "raw_lat": lat,
            "raw_lng": lng,
        }
        filtered.append(filter_ticket_fields(td, role))

    return {"tickets": filtered, "page": page, "page_size": page_size, "total": len(filtered)}


@app.post("/api/upvote")
async def upvote_ticket(
    ticket_id: str,
    user: dict = Depends(get_current_user),
):
    """Citizen 'me too' upvote — one per citizen per ticket."""
    from shared.database import get_db
    from shared.models import Ticket, TicketUpvote
    from shared.auth import create_token
    import sqlalchemy.exc

    citizen_token = user.get("sub", "anonymous")

    async with get_db() as session:
        ticket = await session.get(Ticket, ticket_id)
        if not ticket:
            raise HTTPException(status_code=404, detail="Ticket not found")
        try:
            upvote = TicketUpvote(ticket_id=ticket_id, citizen_token=citizen_token)
            session.add(upvote)
            ticket.upvote_count = (ticket.upvote_count or 0) + 1
            await session.commit()
        except sqlalchemy.exc.IntegrityError:
            raise HTTPException(status_code=409, detail="You have already upvoted this ticket")

    # Fire priority boost event
    await publish_event(Streams.PRIORITY_BOOST, {
        "ticket_id": ticket_id, "reason": "upvote", "upvote_count": str(ticket.upvote_count)
    })

    return {"message": "Upvote recorded", "ticket_id": ticket_id, "upvote_count": ticket.upvote_count}


@app.patch("/api/tickets/{ticket_id}/assign")
async def assign_field_worker(
    ticket_id: str,
    payload: dict,
    user: dict = Depends(get_current_user),
):
    """Officer assigns a field worker and optionally overrides category/severity."""
    from shared.database import get_db
    from shared.models import Ticket

    role = user.get("role", "public")
    if role not in ("officer", "admin", "commissioner", "supervisor", "field_worker"):
        raise HTTPException(status_code=403, detail="Officer role required")

    assigned_to = payload.get("assigned_to", "").strip()
    category    = payload.get("category", "").strip()
    severity    = payload.get("severity")
    notes       = payload.get("notes", "").strip()

    if not assigned_to:
        raise HTTPException(status_code=422, detail="assigned_to is required")

    async with get_db() as session:
        ticket = await session.get(Ticket, ticket_id)
        if not ticket:
            raise HTTPException(status_code=404, detail="Ticket not found")

        ticket.status = "In Progress"
        if category:
            ticket.category = category
        if severity is not None:
            ticket.severity = int(severity)
        # Store assigned_to in description suffix (no separate column yet)
        existing_desc = ticket.description or ""
        if notes:
            ticket.description = f"{existing_desc}\n\n[Officer Notes] {notes}\n[Assigned to] {assigned_to}"
        else:
            ticket.description = f"{existing_desc}\n\n[Assigned to] {assigned_to}"

        await session.commit()

    # Emit real-time update
    from shared.auth import filter_ticket_fields
    ticket_dict = {
        "ticket_id": ticket.id, "status": ticket.status,
        "category": ticket.category, "severity": ticket.severity,
        "ward_id": ticket.ward_id or "",
    }
    await emit_ticket_update(ticket_id, ticket.ward_id or "all", {
        "type": "ticket.update", "data": ticket_dict
    })

    return {
        "message": f"Ticket assigned to {assigned_to}",
        "ticket_id": ticket_id,
        "status": "In Progress",
        "assigned_to": assigned_to,
    }


@app.get("/api/metrics")
async def get_metrics():
    """Gateway metrics — polled by admin dashboard every 5 seconds."""
    r = await get_redis()

    request_count = int(await r.get("citysync:metrics:request_count") or 0)
    rate_limit_hits = int(await r.get("citysync:metrics:rate_limit_hits") or 0)

    latencies = await r.lrange("citysync:metrics:latencies", 0, -1)

    p95 = 0.0
    if latencies:
        sorted_l = sorted([float(x) for x in latencies])
        idx = int(len(sorted_l) * 0.95)
        p95 = sorted_l[min(idx, len(sorted_l) - 1)]

    top_categories = await get_top_categories(10)

    return {
        "service": "gateway",
        "request_count": request_count,
        "rate_limit_hits": rate_limit_hits,
        "p95_latency_ms": round(p95, 1),
        "error_rate": 0.0,  # TODO: track errors
        "top_categories": [{"key": k, "count": int(v)} for k, v in top_categories],
    }


@app.get("/api/frequency/leaderboard")
async def get_frequency_leaderboard():
    """Top 10 complaint category+ward combinations by volume."""
    top = await get_top_categories(10)
    results = []
    for item, score in top:
        parts = item.split(":")
        results.append({
            "category": parts[0] if len(parts) > 0 else item,
            "ward_id": parts[1] if len(parts) > 1 else "unknown",
            "count": int(score),
        })
    return {"leaderboard": results}


@app.get("/api/demo-tokens")
async def get_demo_tokens():
    """Demo tokens for hackathon testing. Remove in production."""
    from shared.auth import DEMO_TOKENS, create_token
    import secrets as s
    citizen_token = create_token(hmac_tokenize(s.token_hex(8)), role="citizen")
    return {
        "note": "For demo/testing only — remove in production",
        "citizen": citizen_token,
        **DEMO_TOKENS,
    }


# ── Socket.io emit helpers (called by other services) ─────────────────────────
async def emit_ticket_update(ticket_id: str, ward_id: str, data: dict):
    """Emit status update to both the ticket room and ward room."""
    await sio.emit("ticket.update", data, room=f"ticket:{ticket_id}")
    if ward_id:
        await sio.emit("ticket.update", data, room=f"ward:{ward_id}")


# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "gateway.main:socket_app",
        host="0.0.0.0",
        port=settings.gateway_port,
        reload=True,
    )
