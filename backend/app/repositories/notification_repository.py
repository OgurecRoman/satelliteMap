from __future__ import annotations

from sqlalchemy import asc, select
from sqlalchemy.orm import Session

from app.models.notification_subscription import NotificationSubscription


class NotificationRepository:
    def __init__(self, session: Session):
        self.session = session

    def create(self, subscription: NotificationSubscription) -> NotificationSubscription:
        self.session.add(subscription)
        self.session.flush()
        return subscription

    def list_all(self) -> list[NotificationSubscription]:
        stmt = select(NotificationSubscription).order_by(asc(NotificationSubscription.id))
        return list(self.session.execute(stmt).scalars().all())

    def list_active(self) -> list[NotificationSubscription]:
        stmt = (
            select(NotificationSubscription)
            .where(NotificationSubscription.is_active.is_(True))
            .order_by(asc(NotificationSubscription.id))
        )
        return list(self.session.execute(stmt).scalars().all())
