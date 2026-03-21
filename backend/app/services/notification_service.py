from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from app.models.notification_subscription import NotificationSubscription
from app.repositories.notification_repository import NotificationRepository
from app.schemas.analysis import PointPassRequest, RegionPassRequest, SatelliteFilters
from app.schemas.notification import NotificationSubscriptionCreateRequest, NotificationSubscriptionResponse
from app.services.analysis_service import AnalysisService
from app.utils.region import region_payload
from app.utils.time import utc_now


class NotificationService:
    def __init__(self, session: Session):
        self.session = session
        self.repo = NotificationRepository(session)
        self.analysis_service = AnalysisService(session)

    def create_subscription(self, request: NotificationSubscriptionCreateRequest) -> NotificationSubscriptionResponse:
        filters_json = request.filters.model_dump(exclude_none=True) if request.filters else None
        region_type = None
        region_json = None
        if request.region is not None:
            region_type, region_json = region_payload(request.region)

        subscription = NotificationSubscription(
            name=request.name,
            target_type=request.target_type,
            satellite_id=request.satellite_id,
            point_lat=request.point_lat,
            point_lon=request.point_lon,
            region_type=region_type,
            region_payload=region_json,
            filters_json=filters_json,
            contact_email=request.contact_email,
            note=request.note,
            horizon_hours=request.horizon_hours,
            step_seconds=request.step_seconds,
            is_active=True,
        )
        self.repo.create(subscription)
        self.session.commit()
        self.session.refresh(subscription)
        return NotificationSubscriptionResponse.model_validate(subscription, from_attributes=True)

    def list_subscriptions(self) -> list[NotificationSubscriptionResponse]:
        return [
            NotificationSubscriptionResponse.model_validate(item, from_attributes=True)
            for item in self.repo.list_all()
        ]

    def evaluate_active_subscriptions(self) -> int:
        active = self.repo.list_active()
        now = utc_now()
        processed = 0
        for subscription in active:
            filters = SatelliteFilters(**(subscription.filters_json or {}))
            if subscription.target_type == "point":
                request = PointPassRequest(
                    lat=subscription.point_lat,
                    lon=subscription.point_lon,
                    from_time=now,
                    horizon_hours=subscription.horizon_hours,
                    step_seconds=subscription.step_seconds,
                    filters=filters,
                )
                result = self.analysis_service.passes_over_point(request)
                if subscription.satellite_id is not None:
                    result.matches = [m for m in result.matches if m.satellite.id == subscription.satellite_id]
                subscription.next_event_time = result.matches[0].next_pass.enter_time if result.matches else None
            elif subscription.target_type == "region" and subscription.region_payload is not None:
                region_request = RegionPassRequest(
                    region=subscription.region_payload,
                    from_time=now,
                    horizon_hours=subscription.horizon_hours,
                    step_seconds=subscription.step_seconds,
                    filters=filters,
                )
                result = self.analysis_service.passes_over_region(region_request)
                if subscription.satellite_id is not None:
                    result.matches = [m for m in result.matches if m.satellite.id == subscription.satellite_id]
                subscription.next_event_time = result.matches[0].windows[0].enter_time if result.matches else None
            subscription.last_checked_at = now
            self.session.add(subscription)
            processed += 1
        self.session.commit()
        return processed
