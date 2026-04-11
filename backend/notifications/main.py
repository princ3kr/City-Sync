"""
CitySync — Notification Service
Sends WhatsApp/SMS via Twilio or logs to console in mock mode.
Consumes status.updates Redis Stream.
"""
import asyncio
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from shared.config import settings
from shared.logging_config import configure_logging, get_logger
from shared.redis_client import read_events, ack_event, create_consumer_group, Streams

configure_logging(settings.log_level)
log = get_logger("notifications")

CONSUMER_GROUP = "notifications"
CONSUMER_NAME = "notifier-1"


async def send_notification(citizen_token: str, message: str, ticket_id: str):
    """
    Send notification to citizen via WhatsApp or SMS.
    MOCK_NOTIFICATIONS=true → log to console.
    """
    if settings.mock_notifications:
        log.info(
            "mock_notification_sent",
            citizen_token=citizen_token[:8] + "...",
            ticket_id=ticket_id,
            message=message,
        )
        print(f"\n📱 [NOTIFICATION] Ticket {ticket_id}")
        print(f"   To: citizen ...{citizen_token[-8:]}")
        print(f"   Message: {message}\n")
        return

    # Real Twilio integration
    try:
        from twilio.rest import Client
        client = Client(settings.twilio_account_sid, settings.twilio_auth_token)

        # In production: resolve citizen_token → phone via secure lookup
        # For hackathon: skip actual SMS (no phone number stored)
        log.info("twilio_notification_skipped", reason="Token-to-phone resolution not implemented in hackathon")
    except Exception as e:
        log.error("notification_send_failed", error=str(e), ticket_id=ticket_id)


async def process_status_update(msg_id: str, data: dict):
    """Process a status update event and send citizen notification."""
    citizen_token = data.get("citizen_token", "")
    ticket_id = data.get("ticket_id", "")
    message = data.get("message", "Your complaint has been updated.")
    status = data.get("status", "")
    action = data.get("action", "")

    if not citizen_token or citizen_token == "anonymous":
        return

    await send_notification(citizen_token, message, ticket_id)


async def main():
    log.info("notification_service_starting")
    await create_consumer_group(Streams.STATUS_UPDATES, CONSUMER_GROUP, start_id="0")

    while True:
        try:
            events = await read_events(Streams.STATUS_UPDATES, CONSUMER_GROUP, CONSUMER_NAME)
            for msg_id, data in events:
                await process_status_update(msg_id, data)
                await ack_event(Streams.STATUS_UPDATES, CONSUMER_GROUP, msg_id)
        except Exception as e:
            log.exception("notification_consumer_error", error=str(e))
            await asyncio.sleep(1)


if __name__ == "__main__":
    asyncio.run(main())
