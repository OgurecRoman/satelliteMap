from __future__ import annotations

import logging

from apscheduler.schedulers.background import BackgroundScheduler

from app.core.config import get_settings
from app.db.session import SessionLocal
from app.services.notification_service import NotificationService

logger = logging.getLogger(__name__)


def subscription_check_job() -> None:
    db = SessionLocal()
    try:
        processed = NotificationService(db).evaluate_active_subscriptions()
        logger.info("Processed %s subscriptions in background job", processed)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Background subscription evaluation failed: %s", exc)
    finally:
        db.close()


def build_scheduler() -> BackgroundScheduler | None:
    settings = get_settings()
    if not settings.scheduler_enabled:
        return None
    scheduler = BackgroundScheduler(timezone="UTC")
    scheduler.add_job(
        subscription_check_job,
        trigger="interval",
        minutes=settings.scheduler_interval_minutes,
        id="subscription-check",
        replace_existing=True,
    )
    return scheduler
