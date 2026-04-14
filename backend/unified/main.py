"""
CitySync — Unified backend (demo/monolith)

Runs:
- Gateway (FastAPI + Socket.IO) on settings.gateway_port
- AI pipeline consumer loop (raw.submissions + priority.boost)
- Routing consumer loop (classified.complaints + routing table refresh)
- Notifications consumer loop (status.updates + resolution.confirmed)

Also exposes:
- Verification API mounted under /verification
- Routing API mounted under /routing

This is intended for cheap/free demo hosting where multiple containers are not feasible.
"""

import asyncio
from contextlib import asynccontextmanager

from shared.config import settings
from shared.logging_config import configure_logging, get_logger

# Import services (these modules initialize their FastAPI apps on import)
import gateway.main as gateway_service
import verification.main as verification_service
import routing.main as routing_service
import ai_pipeline.main as ai_pipeline_service
import notifications.main as notifications_service


configure_logging(settings.log_level)
log = get_logger("unified")


def _spawn_with_restart(name: str, coro_fn):
    async def runner():
        backoff_s = 1
        while True:
            try:
                log.info("background_task_starting", task=name)
                await coro_fn()
                log.warning("background_task_exited", task=name)
            except Exception as e:
                log.exception("background_task_crashed", task=name, error=str(e))
            await asyncio.sleep(backoff_s)
            backoff_s = min(backoff_s * 2, 30)

    return asyncio.create_task(runner(), name=f"citysync:{name}")


@asynccontextmanager
async def lifespan(app):
    # Mount extra APIs (avoid route collisions like /health by prefix-mounting)
    # These are safe to mount repeatedly (idempotent-ish) but we do it once at startup.
    if not any(getattr(r, "path", None) == "/verification" for r in gateway_service.app.routes):
        gateway_service.app.mount("/verification", verification_service.app)
    if not any(getattr(r, "path", None) == "/routing" for r in gateway_service.app.routes):
        gateway_service.app.mount("/routing", routing_service.app)

    tasks = [
        _spawn_with_restart("ai_pipeline", ai_pipeline_service.main),
        _spawn_with_restart("routing", routing_service.main),
        _spawn_with_restart("notifications", notifications_service.main),
    ]

    log.info(
        "unified_started",
        gateway_port=settings.gateway_port,
        mounted_verification="/verification",
        mounted_routing="/routing",
    )
    try:
        yield
    finally:
        for t in tasks:
            t.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)


# Reuse gateway's ASGI composition (Socket.IO + FastAPI)
# We wrap gateway's underlying FastAPI app with a lifespan that starts background consumers.
gateway_service.app.router.lifespan_context = lifespan  # type: ignore[attr-defined]
asgi_app = gateway_service.socket_app


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "unified.main:asgi_app",
        host="0.0.0.0",
        port=settings.gateway_port,
        reload=(settings.app_env != "production"),
    )

