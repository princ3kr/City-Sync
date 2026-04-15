"""
CitySync — Application Configuration
Loads all settings from environment variables / .env file.
"""
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field, AliasChoices


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ── Database ──────────────────────────────────────────────────────────────
    database_url: str = Field(
        "postgresql+asyncpg://citysync:citysync_secret@localhost:5432/citysync"
    )
    database_url_sync: str = Field(
        "postgresql://citysync:citysync_secret@localhost:5432/citysync"
    )

    # ── Redis ─────────────────────────────────────────────────────────────────
    redis_url: str = Field("redis://localhost:6379/0")

    # ── Media / Photos ────────────────────────────────────────────────────────
    # Set ENABLE_PHOTOS=false for cheap/free demos (skips MinIO/R2 entirely).
    enable_photos: bool = Field(True)

    # ── MinIO ─────────────────────────────────────────────────────────────────
    minio_endpoint: str = Field("localhost:9000")
    minio_access_key: str = Field("citysync_minio")
    minio_secret_key: str = Field("citysync_minio_secret")
    minio_bucket: str = Field("citysync")
    minio_secure: bool = Field(False)

    # ── OpenAI ────────────────────────────────────────────────────────────────
    openai_api_key: str = Field("sk-mock")
    mock_ai: bool = Field(True)

    # ── Mapbox ────────────────────────────────────────────────────────────────
    mapbox_token: str = Field("")
    mock_map: bool = Field(True)

    # ── Twilio ────────────────────────────────────────────────────────────────
    twilio_account_sid: str = Field("")
    twilio_auth_token: str = Field("")
    twilio_from_number: str = Field("")
    twilio_phone_number: str = Field("")
    twilio_whatsapp_number: str = Field("whatsapp:+14155238886")
    mock_notifications: bool = Field(True)

    # ── SendGrid ──────────────────────────────────────────────────────────────
    sendgrid_api_key: str = Field("")
    sendgrid_from_email: str = Field("alerts@citysync.in")
    mock_email: bool = Field(True)

    # ── Privacy / Security ────────────────────────────────────────────────────
    hmac_secret_key: str = Field("citysync-default-hmac-secret-change-in-prod")
    jwt_secret_key: str = Field("citysync-default-jwt-secret-change-in-prod")
    jwt_algorithm: str = Field("HS256")
    jwt_expire_minutes: int = Field(1440)

    # ── Webhook signing ───────────────────────────────────────────────────────
    webhook_hmac_secret: str = Field("citysync-webhook-signing-secret")

    # ── App ───────────────────────────────────────────────────────────────────
    app_env: str = Field("development")
    log_level: str = Field("INFO")
    cors_origins: str = Field("http://localhost:5173,http://localhost:3000")

    # ── Demo / Unsafe endpoints ────────────────────────────────────────────────
    # Keep disabled in production unless explicitly enabled.
    enable_demo_tokens: bool = Field(False)

    # ── Bootstrapping ─────────────────────────────────────────────────────────
    # On free platforms (Render), pre-deploy hooks might be unavailable.
    # Enabling this runs init/seed in the background at startup, without blocking
    # the HTTP port bind.
    bootstrap_db_on_startup: bool = Field(False)

    # ── Ports ─────────────────────────────────────────────────────────────────
    # Render injects PORT; locally we use GATEWAY_PORT (or default 8000).
    gateway_port: int = Field(8000, validation_alias=AliasChoices("GATEWAY_PORT", "PORT"))
    routing_port: int = Field(8001)
    verification_port: int = Field(8002)
    dept_portal_port: int = Field(3000)
    dept_portal_url: str = Field("http://localhost:3000/webhook")

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",")]


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
