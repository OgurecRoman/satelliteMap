TLE_TEXT = """ISS (ZARYA)
1 25544U 98067A   24153.51782528  .00016717  00000+0  30134-3 0  9995
2 25544  51.6393  72.8097 0004370 286.7535 160.6846 15.50099017454546
"""


def test_seed_and_list_tle(client):
    seed_response = client.post("/api/v1/tle/seed")
    assert seed_response.status_code == 200
    payload = seed_response.json()
    assert payload["created_tle_records"] >= 1

    list_response = client.get("/api/v1/tle")
    assert list_response.status_code == 200
    items = list_response.json()
    assert len(items) >= 1
    assert "satellite_name" in items[0]


def test_upload_tle(client):
    response = client.post(
        "/api/v1/tle/upload",
        files={"file": ("sample.tle", TLE_TEXT, "text/plain")},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["created_tle_records"] >= 1
