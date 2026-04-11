"""
CitySync — Role-based access control via Python decorators.
Replaces OPA for hackathon — readable, zero setup.
"""
import functools
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from shared.config import settings

security = HTTPBearer(auto_error=False)

# ── Role hierarchy ────────────────────────────────────────────────────────────
ROLE_HIERARCHY = {
    "citizen": 0,
    "field_worker": 1,
    "officer": 2,
    "supervisor": 3,
    "admin": 4,
    "commissioner": 5,
}

# ── Token creation ─────────────────────────────────────────────────────────────
def create_token(subject: str, role: str = "citizen", extra: dict | None = None) -> str:
    """Create a JWT token for a citizen or officer."""
    now = datetime.now(timezone.utc)
    payload = {
        "sub": subject,
        "role": role,
        "iat": now,
        "exp": now + timedelta(minutes=settings.jwt_expire_minutes),
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


# ── Token parsing ──────────────────────────────────────────────────────────────
def decode_token(token: str) -> dict:
    """Decode and validate a JWT. Raises HTTPException on failure."""
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm],
        )
        return payload
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or expired token: {e}",
        )


# ── FastAPI dependencies ──────────────────────────────────────────────────────
async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> dict:
    """
    FastAPI dependency — extracts caller identity.
    Returns a dict with 'sub' (citizen token) and 'role'.
    Allows unauthenticated access but marks role as 'public'.
    """
    if not credentials:
        return {"sub": "anonymous", "role": "public"}
    return decode_token(credentials.credentials)


def require_role(minimum_role: str):
    """
    Decorator factory — enforces minimum role on a FastAPI route.

    Usage:
        @router.get("/admin/stats")
        @require_role("admin")
        async def get_stats(user: dict = Depends(get_current_user)):
            ...
    """
    min_level = ROLE_HIERARCHY.get(minimum_role, 99)

    def decorator(func):
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            # Extract 'user' from kwargs (set by Depends(get_current_user))
            user = kwargs.get("user") or kwargs.get("current_user")
            if not user:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Authentication required",
                )
            caller_role = user.get("role", "public")
            caller_level = ROLE_HIERARCHY.get(caller_role, -1)
            if caller_level < min_level:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Role '{minimum_role}' or higher required (you are '{caller_role}')",
                )
            return await func(*args, **kwargs)
        return wrapper
    return decorator


# ── Field-level response filtering ────────────────────────────────────────────
def filter_ticket_fields(ticket_dict: dict, role: str) -> dict:
    """
    Remove or fuzz fields based on caller role.
    Officers see less fuzz than public; admins see slightly less.
    Fuzzing is deterministic — seeded from ticket_id so markers never jitter.
    """
    import hashlib
    from shared.privacy import fuzz_for_role

    filtered = dict(ticket_dict)

    # Remove PII regardless of role — citizen_token is never exposed
    filtered.pop("citizen_token", None)

    # Handle GPS based on role
    raw_lat = filtered.pop("raw_lat", None)
    raw_lng = filtered.pop("raw_lng", None)

    if raw_lat and raw_lng:
        # Derive a stable integer seed from ticket_id + role so the same ticket
        # always gets the same fuzz offset — no marker jitter on re-fetch
        ticket_id = filtered.get("ticket_id", "")
        seed_bytes = hashlib.sha256(f"{ticket_id}:{role}".encode()).digest()
        seed = int.from_bytes(seed_bytes[:8], "big")

        fuzzed_lat, fuzzed_lng = fuzz_for_role(raw_lat, raw_lng, role, seed=seed)
        filtered["location"] = {
            "lat": round(fuzzed_lat, 5),
            "lng": round(fuzzed_lng, 5),
            "fuzz_level": role,
        }

    # Public cannot see description (privacy — could reveal exact address)
    if role == "public":
        filtered.pop("description", None)
        filtered.pop("image_key", None)

    return filtered


# ── Demo tokens (hackathon only) ──────────────────────────────────────────────
DEMO_TOKENS = {
    "officer": create_token("officer_demo_001", role="officer"),
    "admin": create_token("admin_demo_001", role="admin"),
    "commissioner": create_token("commissioner_demo_001", role="commissioner"),
    "field_worker": create_token("field_worker_demo_001", role="field_worker"),
}
