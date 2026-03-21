from __future__ import annotations

import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

TEST_DB_PATH = Path(__file__).resolve().parent / "test.db"
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB_PATH}"
os.environ["SCHEDULER_ENABLED"] = "false"

from app.core.config import get_settings  # noqa: E402

get_settings.cache_clear()

from app.main import create_app  # noqa: E402


@pytest.fixture(scope="session")
def client():
    if TEST_DB_PATH.exists():
        TEST_DB_PATH.unlink()
    app = create_app()
    with TestClient(app) as test_client:
        seed_response = test_client.post("/api/v1/tle/seed")
        assert seed_response.status_code == 200, seed_response.text
        yield test_client
    if TEST_DB_PATH.exists():
        TEST_DB_PATH.unlink()
