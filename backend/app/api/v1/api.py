from fastapi import APIRouter

from app.api.v1.routes import analysis, health, notifications, satellites, tle

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(tle.router, prefix="/tle", tags=["tle"])
api_router.include_router(satellites.router, prefix="/satellites", tags=["satellites"])
api_router.include_router(analysis.router, prefix="/analysis", tags=["analysis"])
api_router.include_router(notifications.router, prefix="/notifications", tags=["notifications"])
