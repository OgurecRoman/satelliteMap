from datetime import datetime, timezone


def test_passes_over_point(client):
    payload = {
        "lat": 55.75,
        "lon": 37.62,
        "from_time": datetime.now(timezone.utc).isoformat(),
        "horizon_hours": 24,
        "step_seconds": 600,
        "filters": {"orbit_type": "LEO"},
    }
    response = client.post("/api/v1/analysis/passes-over-point", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["point"]["lat"] == 55.75
    assert "matches" in data


def test_passes_over_region(client):
    payload = {
        "region": {
            "type": "bbox",
            "min_lat": 50.0,
            "min_lon": 30.0,
            "max_lat": 60.0,
            "max_lon": 40.0,
        },
        "from_time": datetime.now(timezone.utc).isoformat(),
        "horizon_hours": 24,
        "step_seconds": 900,
        "filters": {"purpose": "Earth observation"},
    }
    response = client.post("/api/v1/analysis/passes-over-region", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["region_type"] == "bbox"
    assert "matches" in data


def test_grouping_and_compare_groups(client):
    grouping = client.get("/api/v1/analysis/grouping?field=operator")
    assert grouping.status_code == 200
    grouping_data = grouping.json()
    assert grouping_data["field"] == "operator"
    assert len(grouping_data["groups"]) >= 1

    compare_payload = {
        "groups": [
            {"name": "NOAA", "filters": {"operator": "NOAA"}},
            {"name": "Earth observation", "filters": {"purpose": "Earth observation"}},
        ]
    }
    compare = client.post("/api/v1/analysis/compare-groups", json=compare_payload)
    assert compare.status_code == 200
    compare_data = compare.json()
    assert len(compare_data["groups"]) == 2


def test_point_analysis_rejects_too_many_calculations(client):
    payload = {
        "lat": 55.75,
        "lon": 37.62,
        "from_time": datetime.now(timezone.utc).isoformat(),
        "horizon_hours": 168,
        "step_seconds": 10,
    }
    response = client.post("/api/v1/analysis/passes-over-point", json=payload)
    assert response.status_code == 400
    assert "Слишком много расчётов" in response.json()["detail"]


def test_point_analysis_rejects_invalid_coordinates(client):
    payload = {
        "lat": 999,
        "lon": 37.62,
        "from_time": datetime.now(timezone.utc).isoformat(),
        "horizon_hours": 6,
        "step_seconds": 600,
    }
    response = client.post("/api/v1/analysis/passes-over-point", json=payload)
    assert response.status_code == 422


def test_compare_groups_rejects_too_long_name(client):
    payload = {
        "groups": [
            {"name": "A" * 41, "filters": {"operator": "NOAA"}},
        ]
    }
    response = client.post("/api/v1/analysis/compare-groups", json=payload)
    assert response.status_code == 422
