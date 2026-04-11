"""
CitySync — Frequency Monitor
Redis ZINCRBY sorted set for real-time complaint frequency tracking.
3 lines of core logic — replaces a full Kafka Streams topology.
"""
from shared.logging_config import get_logger
from shared.redis_client import increment_category_freq, get_top_categories

log = get_logger("frequency")


async def track_complaint(category: str, ward_id: str) -> float:
    """
    ZINCRBY citysync:freq:category:ward 1 {category}:{ward_id}
    Returns the new score (total count for this category+ward).
    """
    new_score = await increment_category_freq(category, ward_id or "unknown")
    log.debug("frequency_incremented", category=category, ward_id=ward_id, new_score=new_score)
    return new_score


async def get_hotspots(n: int = 10) -> list[dict]:
    """
    ZREVRANGE — top N category+ward combinations by complaint volume.
    Used by admin dashboard hotspot map.
    """
    top = await get_top_categories(n)
    results = []
    for member, score in top:
        parts = member.split(":")
        results.append({
            "category": parts[0] if parts else member,
            "ward_id": parts[1] if len(parts) > 1 else "unknown",
            "count": int(score),
            "key": member,
        })
    return results
