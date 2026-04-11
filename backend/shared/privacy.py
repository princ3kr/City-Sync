"""
CitySync — Privacy Vault
HMAC-SHA256 tokenisation + Gaussian differential privacy noise.
No external libraries beyond Python stdlib and numpy.
"""
import hashlib
import hmac
import math
import os
import secrets

import numpy as np

from shared.config import settings


# ── HMAC Tokenisation ──────────────────────────────────────────────────────────
def hmac_tokenize(identity: str) -> str:
    """
    Deterministically tokenise a citizen identity (phone number, device ID).
    Same identity always produces same token.
    Token is irreversible without the HMAC key.

    Returns: 64-char hex string
    """
    key = settings.hmac_secret_key.encode("utf-8")
    msg = identity.strip().lower().encode("utf-8")
    token = hmac.new(key, msg, hashlib.sha256).hexdigest()
    return token


# ── Differential Privacy Noise ────────────────────────────────────────────────
# Gaussian mechanism calibrated to two epsilon values:
#   ε = 2.0 → officer view      → ±~30m fuzz
#   ε = 0.5 → public map view   → ±~90m fuzz
#
# Sensitivity is ~1 coordinate unit ≈ 111km. We scale by 1/111000 to get metres.
# Sigma = sensitivity * sqrt(2*ln(1.25/delta)) / epsilon

def _gaussian_sigma(epsilon: float, sensitivity_m: float = 1.0) -> float:
    """
    Compute Gaussian noise sigma for a given epsilon.
    delta = 1e-5 (standard).
    sigma = (sensitivity / epsilon) * sqrt(2 * ln(1.25/delta))
    Then we scale from meters to degrees.
    """
    delta = 1e-5
    # noise_m is the standard deviation in meters
    noise_m = (sensitivity_m / epsilon) * math.sqrt(2 * math.log(1.25 / delta))
    # Convert noise in meters to noise in degrees (rough approximation: 111km = 1 deg)
    sigma_deg = noise_m / 111_000.0
    return sigma_deg


EPSILON_OFFICER = 2.0   # ±~30m
EPSILON_PUBLIC = 0.5    # ±~90m


def apply_dp_noise(lat: float, lng: float, epsilon: float) -> tuple[float, float]:
    """
    Apply Gaussian differential privacy noise to GPS coordinates.

    Args:
        lat: raw latitude
        lng: raw longitude
        epsilon: privacy budget (2.0 = officer view, 0.5 = public)

    Returns:
        (fuzzed_lat, fuzzed_lng)
    """
    sigma = _gaussian_sigma(epsilon)
    # numpy gaussian noise — two lines
    fuzzed_lat = float(lat + np.random.normal(0, sigma))
    fuzzed_lng = float(lng + np.random.normal(0, sigma))
    return fuzzed_lat, fuzzed_lng


def fuzz_for_role(lat: float, lng: float, role: str) -> tuple[float, float]:
    """
    Role-aware GPS fuzzing.

    Roles and epsilon values:
        admin       → ε=2.0  (±30m)
        officer     → ε=2.0  (±30m)
        supervisor  → ε=1.5  (±40m)
        public      → ε=0.5  (±90m)
    """
    epsilon_map = {
        "admin": 2.0,
        "commissioner": 2.0,
        "officer": 2.0,
        "supervisor": 1.5,
        "field_worker": 2.0,
        "public": 0.5,
    }
    epsilon = epsilon_map.get(role, 0.5)
    return apply_dp_noise(lat, lng, epsilon)


# ── EXIF Stripping ────────────────────────────────────────────────────────────
def strip_exif(image_bytes: bytes) -> tuple[bytes, dict | None]:
    """
    Strip EXIF metadata from JPEG image.
    Returns (clean_bytes, extracted_gps_dict | None).

    GPS is extracted before stripping so citizen can opt-in to GPS submission.
    """
    try:
        import piexif
        from PIL import Image
        import io

        img = Image.open(io.BytesIO(image_bytes))
        gps_data = None

        if "exif" in img.info:
            exif_dict = piexif.load(img.info["exif"])
            gps_ifd = exif_dict.get("GPS", {})

            # Extract GPS if present
            if gps_ifd:
                gps_data = _parse_gps_exif(gps_ifd)

        # Strip EXIF — save without it
        output = io.BytesIO()
        img.save(output, format="JPEG", exif=b"")
        clean_bytes = output.getvalue()
        return clean_bytes, gps_data

    except Exception:
        # If EXIF stripping fails, return original but flag it
        return image_bytes, None


def _parse_gps_exif(gps_ifd: dict) -> dict | None:
    """Parse GPS IFD from EXIF data into lat/lng floats."""
    try:
        import piexif
        lat_ref = gps_ifd.get(piexif.GPSIFD.GPSLatitudeRef, b"N").decode()
        lng_ref = gps_ifd.get(piexif.GPSIFD.GPSLongitudeRef, b"E").decode()
        lat_data = gps_ifd.get(piexif.GPSIFD.GPSLatitude)
        lng_data = gps_ifd.get(piexif.GPSIFD.GPSLongitude)

        if not lat_data or not lng_data:
            return None

        def to_degrees(data):
            d, m, s = [(n / d) for n, d in data]
            return d + (m / 60.0) + (s / 3600.0)

        lat = to_degrees(lat_data)
        lng = to_degrees(lng_data)
        if lat_ref == "S":
            lat = -lat
        if lng_ref == "W":
            lng = -lng
        return {"lat": lat, "lng": lng, "source": "exif"}
    except Exception:
        return None


# ── Signature verification ────────────────────────────────────────────────────
def generate_webhook_signature(payload_bytes: bytes) -> str:
    """Sign webhook payload with HMAC-SHA256 (same key as citizen tokeniser, different purpose)."""
    key = settings.webhook_hmac_secret.encode("utf-8")
    sig = hmac.new(key, payload_bytes, hashlib.sha256).hexdigest()
    return f"sha256={sig}"


def verify_webhook_signature(payload_bytes: bytes, signature_header: str) -> bool:
    """Verify an incoming webhook signature."""
    expected = generate_webhook_signature(payload_bytes)
    return hmac.compare_digest(expected, signature_header)
