"""
CitySync — Spatial Validator
PostGIS point-in-polygon ward lookup + Nominatim geocoder fallback.
R-tree spatial index → O(log n) lookup over all ward boundaries.
"""
import asyncio
from typing import Optional

import httpx
from sqlalchemy import text

from shared.config import settings
from shared.database import get_db
from shared.logging_config import get_logger

log = get_logger("spatial")

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
NOMINATIM_TIMEOUT_S = 5.0


async def get_ward_for_point(lat: float, lng: float) -> Optional[str]:
    """
    PostGIS ST_Contains point-in-polygon query to find ward_id.
    Uses R-tree index on wards.boundary for fast lookup.

    Returns ward_id string or None if point is outside all ward boundaries.
    """
    async with get_db() as session:
        result = await session.execute(
            text("""
                SELECT id, name FROM wards
                WHERE ST_Contains(
                    boundary::geometry,
                    ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)
                )
                LIMIT 1
            """),
            {"lat": lat, "lng": lng},
        )
        row = result.fetchone()
        if row:
            log.info("ward_found", ward_id=row[0], ward_name=row[1], lat=lat, lng=lng)
            return row[0]

    log.warning("no_ward_found", lat=lat, lng=lng)
    # Fall back to nearest ward if point-in-polygon fails
    return await get_nearest_ward(lat, lng)


async def get_nearest_ward(lat: float, lng: float) -> Optional[str]:
    """
    Find the nearest ward centroid (fallback when point is outside all boundaries).
    Uses PostGIS ST_Distance on geography type.
    """
    async with get_db() as session:
        result = await session.execute(
            text("""
                SELECT id, name,
                    ST_Distance(
                        boundary::geography,
                        ST_SetSRID(ST_MakePoint(:lng, :lat), 4326)::geography
                    ) AS dist
                FROM wards
                WHERE boundary IS NOT NULL
                ORDER BY dist ASC
                LIMIT 1
            """),
            {"lat": lat, "lng": lng},
        )
        row = result.fetchone()
        if row:
            log.info("nearest_ward_fallback", ward_id=row[0], distance_m=round(row[2], 1))
            return row[0]
    return None


async def geocode_location_mention(location_mention: str, city_hint: str = "Mumbai") -> Optional[tuple[float, float]]:
    """
    Nominatim (OpenStreetMap) geocoder for text-based location descriptions.
    Replaces Mapbox Places API — no address strings leave your infrastructure.
    Free, self-hostable.

    Returns (lat, lng) or None if not found.
    """
    if not location_mention:
        return None

    # Append city hint to improve Indian place name resolution
    query = f"{location_mention}, {city_hint}, India"

    try:
        async with httpx.AsyncClient(timeout=NOMINATIM_TIMEOUT_S) as client:
            response = await client.get(
                NOMINATIM_URL,
                params={
                    "q": query,
                    "format": "json",
                    "limit": 1,
                    "countrycodes": "in",
                },
                headers={"User-Agent": "CitySync/1.0 (civic-complaint-platform)"},
            )
            response.raise_for_status()
            results = response.json()

            if results:
                lat = float(results[0]["lat"])
                lng = float(results[0]["lon"])
                log.info("nominatim_geocoded", query=query, lat=lat, lng=lng)
                return lat, lng

    except (httpx.TimeoutException, httpx.HTTPError) as e:
        log.warning("nominatim_geocoding_failed", query=query, error=str(e))

    return None


async def resolve_coordinates(
    raw_lat: Optional[float],
    raw_lng: Optional[float],
    location_mention: Optional[str],
) -> tuple[Optional[float], Optional[float], str]:
    """
    Determine the best coordinates for a complaint.

    Strategy:
    1. If payload GPS is valid → use it
    2. If no GPS but location_mention → geocode via Nominatim
    3. If geocoding fails → return None (ward lookup will fail gracefully)

    Returns: (lat, lng, source) where source is 'gps' | 'nominatim' | 'none'
    """
    # Validate bounds (Indian subcontinent rough bounds)
    INDIA_LAT = (6.0, 37.0)
    INDIA_LNG = (68.0, 97.5)

    if raw_lat and raw_lng:
        if INDIA_LAT[0] <= raw_lat <= INDIA_LAT[1] and INDIA_LNG[0] <= raw_lng <= INDIA_LNG[1]:
            return raw_lat, raw_lng, "gps"
        else:
            log.warning("gps_outside_india_bounds", lat=raw_lat, lng=raw_lng)

    if location_mention:
        coords = await geocode_location_mention(location_mention)
        if coords:
            return coords[0], coords[1], "nominatim"

    return None, None, "none"
