from datetime import datetime, timedelta, timezone


def test_satellite_list_and_card(client):
    satellites = client.get("/api/v1/satellites")
    assert satellites.status_code == 200
    payload = satellites.json()
    assert payload["total"] >= 1
    first_id = payload["items"][0]["id"]

    card = client.get(f"/api/v1/satellites/{first_id}")
    assert card.status_code == 200
    data = card.json()
    assert data["id"] == first_id
    assert data["current_position"]["geodetic"] is not None


def test_positions(client):
    response = client.get("/api/v1/satellites/positions?format=geodetic")
    assert response.status_code == 200
    items = response.json()
    assert len(items) >= 1
    assert items[0]["geodetic"] is not None


def test_next_pass(client):
    satellites = client.get("/api/v1/satellites").json()["items"]
    first_id = satellites[0]["id"]
    response = client.get(
        f"/api/v1/satellites/{first_id}/next-pass",
        params={"lat": 55.75, "lon": 37.62, "horizon_hours": 24, "step_seconds": 300},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["satellite_id"] == first_id
    assert data["query_point"]["lat"] == 55.75


def test_track(client):
    first_id = client.get("/api/v1/satellites").json()["items"][0]["id"]
    start = datetime.now(timezone.utc).replace(microsecond=0)
    end = start + timedelta(hours=1)
    response = client.get(
        f"/api/v1/satellites/{first_id}/track",
        params={
            "start_time": start.isoformat(),
            "end_time": end.isoformat(),
            "step_seconds": 600,
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data["points"]) >= 2
