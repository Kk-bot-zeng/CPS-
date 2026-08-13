"""Offline smoke test for a copied/unpacked hand-off package."""

from fastapi.testclient import TestClient

import server


client = TestClient(server.app)
period = "start_date=2026-07-13&end_date=2026-08-12"


def get(path: str):
    response = client.get(path)
    response.raise_for_status()
    return response.json()


cards = get(f"/api/kpi-cards?{period}")["cards"]
assert len(cards) == 6
assert all(card.get("data_status") == "ready" for card in cards)
assert all(card.get("current_value") is not None for card in cards)

brands = get(f"/api/brand-rankings?limit=5&{period}")
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
assert thunderbird and all(row["thunderbird_link_count"] > 0 for row in thunderbird)

print("PASS: package APIs, KPI cards, brand/creator drill-downs and Thunderbird creators")
