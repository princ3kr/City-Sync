"""
CitySync — Priority Scorer
Explicit formula from the architecture doc:
score = (severity × 2.5) + (cluster_size × 4) + (upvote_count × 2)
      + time_age_boost + weather_boost + trust_modifier

Tiers: Critical ≥85, High 60-84, Medium 35-59, Low <35
"""
import time
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import text

from shared.config import settings
from shared.database import get_db
from shared.logging_config import get_logger
from shared.schemas import PriorityResult

log = get_logger("priority")

# ── Tier thresholds ────────────────────────────────────────────────────────────
TIERS = [
    (85.0, "Critical"),
    (60.0, "High"),
    (35.0, "Medium"),
    (0.0, "Low"),
]


def get_tier(score: float) -> str:
    for threshold, tier in TIERS:
        if score >= threshold:
            return tier
    return "Low"


# ── Weather boost (mock — real integration would call Open-Meteo) ─────────────
async def get_weather_boost(lat: Optional[float], lng: Optional[float], category: str) -> float:
    """
    +10 if current weather is rain AND category is Flooding or Drainage.
    Uses Open-Meteo free API in production. Mock always returns 0 for hackathon.
    """
    if settings.mock_ai:
        # Mock: simulate rain weather for flooding categories occasionally
        import random
        if category in ("Flooding", "Drainage") and random.random() < 0.3:
            return 10.0
        return 0.0

    if not lat or not lng:
        return 0.0

    try:
        import httpx
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(
                "https://api.open-meteo.com/v1/forecast",
                params={
                    "latitude": lat, "longitude": lng,
                    "current": "weather_code",
                    "forecast_days": 1,
                },
            )
            data = resp.json()
            weather_code = data["current"]["weather_code"]
            # WMO codes 51-67, 71-77, 80-99 = precipitation
            is_raining = weather_code in range(51, 100)
            if is_raining and category in ("Flooding", "Drainage"):
                return 10.0
    except Exception as e:
        log.warning("weather_api_failed", error=str(e))

    return 0.0


# ── Citizen trust modifier ─────────────────────────────────────────────────────
async def get_trust_modifier(citizen_token: str) -> float:
    """
    Fetch citizen trust score (0.0–1.0) from DB.
    Contributes ±5 points: (trust_score - 0.5) × 10 → range -5 to +5.
    New citizens start at 0.5 (neutral).
    """
    # Trust score storage is a future feature — default 0.5 (neutral) for hackathon
    trust_score = 0.5
    modifier = (trust_score - 0.5) * 10.0  # -5 to +5
    return modifier


# ── Time age boost ─────────────────────────────────────────────────────────────
def get_time_age_boost(submitted_at: datetime) -> float:
    """
    +0.5 per hour the ticket has been unactioned.
    Prevents stale tickets from being buried.
    """
    now = datetime.now(timezone.utc)
    if submitted_at.tzinfo is None:
        submitted_at = submitted_at.replace(tzinfo=timezone.utc)
    hours_old = (now - submitted_at).total_seconds() / 3600.0
    return min(hours_old * 0.5, 20.0)  # cap at 20 points (40 hours)


# Municipal urgency baseline (0–100 scale) — Flooding/Drainage rank above routine road defects.
CATEGORY_BASE_WEIGHT: dict[str, float] = {
    "Live Wire": 28.0,
    "Building Hazard": 24.0,
    "Flooding": 22.0,
    "Drainage": 16.0,
    "Water Supply": 12.0,
    "Garbage": 8.0,
    "Street Light": 6.0,
    "Pothole": 5.0,
    "Noise": 4.0,
    "Other": 3.0,
}


async def _fetch_topk_peer_lines(
    ticket_id: str,
    category: str,
    ward_id: Optional[str],
    k: int = 8,
) -> tuple[list[float], str]:
    """Top-K open tickets by score for peer comparison (same ward if possible)."""
    lines: list[str] = []
    scores: list[float] = []
    try:
        async with get_db() as session:
            if ward_id:
                q = text("""
                    SELECT id::text, priority_score, category,
                        COALESCE(LEFT(description, 220), '') AS excerpt
                    FROM tickets
                    WHERE id != :tid AND ward_id = :ward AND status NOT IN ('Resolved', 'Rejected')
                      AND priority_score IS NOT NULL
                    ORDER BY priority_score DESC
                    LIMIT :lim
                """)
                result = await session.execute(
                    q, {"tid": ticket_id, "ward": ward_id, "lim": k}
                )
                rows = result.fetchall()
                if len(rows) < 3:
                    raise ValueError("not_enough_ward_peers")
            else:
                raise ValueError("no_ward")
    except Exception:
        async with get_db() as session:
            q = text("""
                SELECT id::text, priority_score, category,
                    COALESCE(LEFT(description, 220), '') AS excerpt
                FROM tickets
                WHERE id != :tid AND status NOT IN ('Resolved', 'Rejected')
                  AND priority_score IS NOT NULL
                ORDER BY priority_score DESC
                LIMIT :lim
            """)
            result = await session.execute(q, {"tid": ticket_id, "lim": k})
            rows = result.fetchall()

    for r in rows:
        scores.append(float(r[1] or 0))
        ex = (r[3] or "").replace("\n", " ").strip()
        lines.append(f"- {r[2]} | score={float(r[1] or 0):.1f} | {ex[:180]}")

    return scores, "\n".join(lines) if lines else "(no peer history yet)"


def _mock_score_from_peers(
    category: str,
    severity: int,
    cluster_size: int,
    upvote_count: int,
    peer_scores: list[float],
    description: str,
) -> float:
    """Deterministic score: architecture formula + category urgency + peer ordering."""
    cat_w = CATEGORY_BASE_WEIGHT.get(category, 3.0)
    core = (
        (severity * 2.5)
        + (cluster_size * 4.0)
        + (upvote_count * 2.0)
        + cat_w
    )
    desc = (description or "").lower()
    if category in ("Flooding", "Drainage") and any(
        w in desc for w in ("flood", "submerg", "waterlog", "drown", "overflow", "ओवरफ्लो")
    ):
        core += 6.0
    if category == "Pothole" and any(w in desc for w in ("deep", "accident", "injur", "गहरा")):
        core += 4.0

    if peer_scores:
        peer_scores = sorted([s for s in peer_scores if s > 0], reverse=True)
        median = peer_scores[len(peer_scores) // 2]
        hi = peer_scores[0]
        # Nudge relative to active queue so new tickets slot sensibly among peers
        if core < median - 8:
            core = median - 4 + (severity - 5) * 0.5
        if core > hi + 12:
            core = hi + 8
    return float(min(max(core, 0.0), 100.0))


async def get_llm_priority(
    ticket_id: str,
    new_ticket_data: dict,
    ward_id: Optional[str] = None,
) -> float:
    from openai import AsyncOpenAI
    import json

    category = new_ticket_data["category"]
    description = new_ticket_data.get("description") or ""

    peer_scores, peer_block = await _fetch_topk_peer_lines(
        ticket_id, category, ward_id, k=8
    )

    if settings.mock_ai:
        return _mock_score_from_peers(
            category=category,
            severity=int(new_ticket_data.get("severity", 5)),
            cluster_size=int(new_ticket_data.get("cluster_size", 1)),
            upvote_count=int(new_ticket_data.get("upvote_count", 0)),
            peer_scores=peer_scores,
            description=description,
        )

    try:
        context_str = "Top open tickets in the city/ward (priority reference):\n" + peer_block

        client = AsyncOpenAI(
            api_key=settings.groq_api_key,
            base_url="https://api.groq.com/openai/v1"
        )
        
        prompt = f"""
You assign priority scores (0.0 to 100.0) to municipal complaints.
Context:
{context_str}

New Ticket:
- Category: {new_ticket_data['category']}
- Severity (1-10): {new_ticket_data['severity']}
- Cluster Size (duplicates): {new_ticket_data['cluster_size']}
- Upvotes: {new_ticket_data['upvote_count']}
- Hours Unactioned: {new_ticket_data['age_hours']:.1f}
- Citizen description (trimmed): {(description or '')[:600]}

Compare the new complaint to the peer list: if it is more urgent than most peers, score above their median; if less urgent, score below. Flooding with public-safety wording should generally outrank routine potholes at similar severity.

Return strictly valid JSON: {{"score": float}}
"""
        response = await client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": "You are an AI priority engine. Output strict JSON."},
                {"role": "user", "content": prompt},
            ],
            response_format={"type": "json_object"},
            temperature=0.1,
            max_tokens=50,
        )
        data = json.loads(response.choices[0].message.content)
        return float(data.get("score", 35.0))
    except Exception as e:
        log.error("llm_priority_failed", error=str(e), ticket_id=ticket_id)
        return _mock_score_from_peers(
            category=category,
            severity=int(new_ticket_data.get("severity", 5)),
            cluster_size=int(new_ticket_data.get("cluster_size", 1)),
            upvote_count=int(new_ticket_data.get("upvote_count", 0)),
            peer_scores=peer_scores,
            description=description,
        )


# ── Main priority scorer ───────────────────────────────────────────────────────
async def calculate_priority(
    ticket_id: str,
    severity: int,
    cluster_size: int,
    upvote_count: int,
    submitted_at: datetime,
    category: str,
    citizen_token: str,
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    description: Optional[str] = None,
    ward_id: Optional[str] = None,
) -> PriorityResult:
    """
    Compute priority score using LLM over Groq.
    """
    # ── Formula components (kept for breakdown/modifiers) ────────────────────
    age_boost = get_time_age_boost(submitted_at)
    weather_boost = await get_weather_boost(lat, lng, category)
    trust_modifier = await get_trust_modifier(citizen_token)
    
    # Run the core elements through the LLM
    now = datetime.now(timezone.utc)
    if submitted_at.tzinfo is None:
        submitted_at = submitted_at.replace(tzinfo=timezone.utc)
    hours_old = (now - submitted_at).total_seconds() / 3600.0

    base_score = await get_llm_priority(
        ticket_id,
        {
            "category": category,
            "severity": severity,
            "cluster_size": cluster_size,
            "upvote_count": upvote_count,
            "age_hours": hours_old,
            "description": description or "",
        },
        ward_id=ward_id,
    )

    # Apply modifiers and explicit decimal boost for merging
    cluster_bonus = min(2.5, (cluster_size - 1) * 0.5)  # +0.5 per merged duplicate
    total = base_score + age_boost + weather_boost + trust_modifier + cluster_bonus
    total = max(0.0, total)  # floor at 0
    tier = get_tier(total)

    breakdown = {
        "base_llm": round(base_score, 1),
        "weather_boost": round(weather_boost, 1),
        "trust_modifier": round(trust_modifier, 1),
        "cluster_bonus": round(cluster_bonus, 2),
        "total": round(total, 2),
    }

    log.info("priority_scored_llm", ticket_id=ticket_id, score=round(total, 2), tier=tier, **breakdown)

    # ── Write to DB ───────────────────────────────────────────────────────────
    try:
        async with get_db() as session:
            await session.execute(
                text("""
                    UPDATE tickets
                    SET priority_score = :score, severity_tier = :tier, updated_at = NOW()
                    WHERE id = :ticket_id
                """),
                {"score": float(round(total, 2)), "tier": tier, "ticket_id": ticket_id},
            )
    except Exception as e:
        log.error("priority_db_write_failed", error=str(e), ticket_id=ticket_id)

    # ── Update Redis sorted set ───────────────────────────────────────────────
    try:
        from shared.redis_client import get_redis
        r = await get_redis()
        ward_key = f"citysync:priority:ward:all"
        await r.zadd(ward_key, {ticket_id: round(total, 2)})
    except Exception as e:
        log.warning("redis_zadd_failed", error=str(e))

    return PriorityResult(score=round(total, 2), tier=tier, breakdown=breakdown)


async def recalculate_on_boost(ticket_id: str, reason: str):
    """Re-run priority calculation for a ticket after a boost event."""
    from shared.models import Ticket
    from sqlalchemy import select

    async with get_db() as session:
        ticket = await session.get(Ticket, ticket_id)
        if not ticket:
            log.warning("priority_boost_ticket_not_found", ticket_id=ticket_id)
            return

        # Get cluster size
        cluster_size = 1
        if ticket.cluster_id:
            result = await session.execute(
                text("SELECT member_count FROM ticket_clusters WHERE id = :id"),
                {"id": ticket.cluster_id},
            )
            row = result.fetchone()
            if row:
                cluster_size = row[0]

        return await calculate_priority(
            ticket_id=ticket_id,
            severity=ticket.severity or 5,
            cluster_size=cluster_size,
            upvote_count=ticket.upvote_count or 0,
            submitted_at=ticket.submitted_at,
            category=ticket.category or "Other",
            citizen_token=ticket.citizen_token,
            description=ticket.description,
            ward_id=ticket.ward_id,
        )
