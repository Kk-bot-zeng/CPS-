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
card_by_key = {str(card.get("key")): card for card in cards}
assert len(card_by_key) == 7, f"核心指标应为7张且key唯一，实际为：{sorted(card_by_key)}"
for key in ("content_count", "link_count", "play_count", "store_traffic", "store_sales"):
    assert key in card_by_key, f"缺少核心指标卡：{key}"
click_key = next((key for key in ("jd_clicks", "jd_click_count", "alliance_clicks") if key in card_by_key), None)
amount_key = next((key for key in ("jd_amount", "jd_order_amount", "alliance_order_amount") if key in card_by_key), None)
assert click_key, f"缺少京东联盟点击卡片：{sorted(card_by_key)}"
assert amount_key, f"缺少京东联盟订单金额卡片：{sorted(card_by_key)}"
for key, card in card_by_key.items():
    assert "data_status" in card, f"指标 {key} 缺少 data_status"
for key in ("content_count", "link_count", "play_count", "store_traffic"):
    card = card_by_key[key]
    assert all(field in card for field in ("current_value", "total_value", "ratio")), \
        f"指标 {key} 缺少分子、分母或占比字段"
assert "佣金" not in str(card_by_key[amount_key].get("label", "")), \
    "京东联盟订单金额不得使用佣金标签"

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
