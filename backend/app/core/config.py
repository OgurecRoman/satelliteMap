from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Satellite Pass Monitoring API"
    app_version: str = "1.0.0"
    environment: str = "local"
    api_v1_prefix: str = "/api/v1"
    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/satmon"
    cors_origins: list[str] = Field(default_factory=lambda: [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ])
    scheduler_enabled: bool = True
    scheduler_interval_minutes: int = 15
    position_cache_size: int = 4096
    default_horizon_hours: int = 24
    default_step_seconds: int = 120
    visibility_polygon_points: int = 72
    seed_file_path: str = str(Path(__file__).resolve().parents[1] / "seed" / "satellites_seed.json")

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: str | list[str]) -> list[str]:
        if isinstance(value, list):
            return value
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        raise ValueError("Invalid CORS origins value")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
