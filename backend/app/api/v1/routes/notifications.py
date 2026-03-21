from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.notification import NotificationSubscriptionCreateRequest, NotificationSubscriptionResponse
from app.services.notification_service import NotificationService

router = APIRouter()


@router.post("/subscriptions", response_model=NotificationSubscriptionResponse, summary="Create notification subscription")
def create_subscription(payload: NotificationSubscriptionCreateRequest, db: Session = Depends(get_db)):
    return NotificationService(db).create_subscription(payload)


@router.get("/subscriptions", response_model=list[NotificationSubscriptionResponse], summary="List notification subscriptions")
def list_subscriptions(db: Session = Depends(get_db)):
    return NotificationService(db).list_subscriptions()
