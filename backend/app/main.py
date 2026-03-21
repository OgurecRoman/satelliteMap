from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1.api import api_router
from app.core.config import get_settings
from app.core.exceptions import AppError
from app.db.init_db import init_db
from app.services.background_tasks import build_scheduler


def create_app() -> FastAPI:
    settings = get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        init_db()
        scheduler = build_scheduler()
        if scheduler is not None:
            scheduler.start()
        app.state.scheduler = scheduler
        yield
        if scheduler is not None and scheduler.running:
            scheduler.shutdown(wait=False)

    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        description="Production-like MVP backend for TLE-driven satellite monitoring and pass analysis.",
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(AppError)
    async def app_error_handler(_, exc: AppError):
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

    app.include_router(api_router, prefix=settings.api_v1_prefix)

    @app.get("/health", tags=["health"], summary="Root health check")
    def root_health():
        return {"status": "ok"}

    return app


app = create_app()
