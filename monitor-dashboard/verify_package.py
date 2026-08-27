"""Offline smoke test that does not require production data."""

from fastapi.testclient import TestClient

import server


client = TestClient(server.app)
period = "start_date=2026-07-13&end_date=2026-08-12"


def get(path: str):
    response = client.get(path)
    response.raise_for_status()
    return response.json()


cards_payload = get(f"/api/kpi-cards?{period}")
assert isinstance(cards_payload, dict) and isinstance(cards_payload.get("cards"), list)
cards = cards_payload["cards"]
assert len(cards) == 6
assert all("data_status" in card and "current_value" in card for card in cards)

brands = get(f"/api/brand-rankings?limit=5&{period}")
assert isinstance(brands, list)
for brand in brands:
    rows = client.get(
        "/api/content-detail",
        params={
            "brand": brand["brand_name"],
            "start_date": "2026-07-13",
            "end_date": "2026-08-12",
            "limit": 5000,
        },
    ).json()
    assert len(rows) == brand["content_count"]

creators = get(f"/api/top-creators?limit=10&{period}")
assert isinstance(creators, list)
for creator in creators:
    rows = client.get(
        "/api/content-detail",
        params={
            "creator_id": creator["creator_id"],
            "start_date": "2026-07-13",
            "end_date": "2026-08-12",
            "limit": 5000,
        },
    ).json()
    assert len(rows) == creator["content_count"]

thunderbird = get(f"/api/top-creators?limit=50&scope=thunderbird&{period}")
assert isinstance(thunderbird, list)
assert all(row.get("thunderbird_link_count", 0) > 0 for row in thunderbird)

print("PASS: package APIs, KPI schema, drill-down consistency and Thunderbird creator filters")
