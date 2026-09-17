"""Deterministic regression tests for the Bilibili monitor dashboard.

The production hand-off package deliberately does not include report data.  These
tests therefore build a small, disposable report/facts set and replace the
loader's paths for the duration of each test.  They exercise the HTTP contract,
not implementation details, so they remain useful when the storage adapter is
changed (CSV today, PostgreSQL in production).

Run from the app directory with::

    .venv\\Scripts\\python.exe -m unittest discover -s monitor-dashboard \
        -p "test_*.py" -v

The test data uses three current days and one previous day.  It intentionally
omits the alliance-click metric: a missing source must be marked unavailable,
not silently rendered as zero.
"""

from __future__ import annotations

import csv
import json
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Any
from unittest.mock import patch


MODULE_DIR = Path(__file__).resolve().parent
if str(MODULE_DIR) not in sys.path:
    sys.path.insert(0, str(MODULE_DIR))

from fastapi.testclient import TestClient  # noqa: E402

import config  # noqa: E402
import server  # noqa: E402


def _write_csv(path: Path, headers: list[str], rows: list[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=headers, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def _day(
    day: str,
    *,
    thunderbird_content: int,
    all_content: int,
    thunderbird_links: int,
    all_links: int,
    play: int,
    all_play: int,
    search: int,
    total_visitors: int,
    store_sales: int,
    order_amount: int,
    sales_quantity: int = 0,
    commission: int = 0,
) -> dict[str, Any]:
    """Return one normalized daily row with deliberately distinct sources."""

    return {
        "date": day,
        "new_content": all_content,
        "thunderbird_linked_content_count": thunderbird_content,
        "all_monitored_content_count": all_content,
        "thunderbird_link_count": thunderbird_links,
        "total_blue_link_count": all_links,
        "play_count": play,
        "all_monitored_play_count": all_play,
        "search_visitors": search,
        "total_visitors": total_visitors,
        # Store sales and alliance order amount are intentionally not equal to
        # sales_quantity or commission_amount.  This catches source mixing.
        "store_sales": store_sales,
        "store_sales_quantity": store_sales,
        "jdsz_transaction_item_quantity": store_sales,
        "jd_order_amount": order_amount,
        "alliance_order_amount": order_amount,
        "sales_quantity": sales_quantity,
        "commission_amount": commission,
    }


class MonitorDashboardRegressionTests(unittest.TestCase):
    """Contract tests for date drill-down and core KPI semantics."""

    CURRENT_START = "2026-08-10"
    CURRENT_END = "2026-08-12"
    PREVIOUS_DAY = "2026-08-09"

    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory(prefix="monitor-dashboard-")
        root = Path(self.tempdir.name)
        normalized = root / "normalized"
        normalized.mkdir()

        self.report_path = root / "report_data.json"
        self.content_path = normalized / "bilibili_content_facts.csv"
        self.link_path = normalized / "bilibili_link_facts.csv"
        self.traffic_path = normalized / "jdsz_traffic_source_daily.csv"

        content_rows = [
            {"content_id": "C1", "author_uid": "U1", "author_name": "达人甲",
             "published_date": "2026-08-10", "title": "显示器鹤6测评",
             "content_url": "https://www.bilibili.com/video/C1", "play_count": 100,
             "interaction_count": 20},
            {"content_id": "C2", "author_uid": "U2", "author_name": "达人乙",
             "published_date": "2026-08-10", "title": "显示器选购指南",
             "content_url": "https://www.bilibili.com/video/C2", "play_count": 80,
             "interaction_count": 10},
            {"content_id": "C3", "author_uid": "U1", "author_name": "达人甲",
             "published_date": "2026-08-11", "title": "显示器高刷实测",
             "content_url": "https://www.bilibili.com/video/C3", "play_count": 90,
             "interaction_count": 18},
            {"content_id": "C4", "author_uid": "U3", "author_name": "达人丙",
             "published_date": "2026-08-12", "title": "显示器办公体验",
             "content_url": "https://www.bilibili.com/video/C4", "play_count": 50,
             "interaction_count": 8},
            {"content_id": "C5", "author_uid": "U2", "author_name": "达人乙",
             "published_date": self.PREVIOUS_DAY, "title": "显示器上期内容",
             "content_url": "https://www.bilibili.com/video/C5", "play_count": 40,
             "interaction_count": 5},
        ]
        content_headers = [
            "content_id", "aid", "author_uid", "author_name", "published_at",
            "title", "content_url", "keyword", "play_count", "interaction_count",
        ]
        # Content facts are used for identity/date; report ranking rows above
        # are used for performance fields, matching the production loader.
        content_fact_rows = [
            {"content_id": row["content_id"], "author_uid": row["author_uid"],
             "author_name": row["author_name"], "published_at": row["published_date"],
             "title": row["title"], "content_url": row["content_url"]}
            for row in content_rows
        ]
        _write_csv(self.content_path, content_headers, content_fact_rows)

        link_headers = [
            "link_id", "content_id", "author_uid", "author_name", "published_at",
            "comment_id", "parent_comment_id", "comment_author_uid",
            "comment_author_name", "comment_text", "action_type", "position", "label",
            "url", "brand", "raw_model", "model_parse_status", "standard_model",
            "model_confidence", "model_match_level", "model_evidence",
            "attribution_grade", "link_status", "crawl_at",
        ]
        link_rows = [
            {"link_id": "L1", "content_id": "C1", "author_uid": "U1", "author_name": "达人甲",
             "published_at": "2026-08-10", "comment_id": "CM1", "brand": "雷鸟"},
            {"link_id": "L2", "content_id": "C1", "author_uid": "U1", "author_name": "达人甲",
             "published_at": "2026-08-10", "comment_id": "CM2", "brand": "雷鸟"},
            {"link_id": "L3", "content_id": "C1", "author_uid": "U1", "author_name": "达人甲",
             "published_at": "2026-08-10", "comment_id": "CM3", "brand": "竞品"},
            {"link_id": "L4", "content_id": "C2", "author_uid": "U2", "author_name": "达人乙",
             "published_at": "2026-08-10", "comment_id": "CM4", "brand": "竞品"},
            {"link_id": "L5", "content_id": "C3", "author_uid": "U1", "author_name": "达人甲",
             "published_at": "2026-08-11", "comment_id": "CM5", "brand": "雷鸟"},
            {"link_id": "L6", "content_id": "C3", "author_uid": "U1", "author_name": "达人甲",
             "published_at": "2026-08-11", "comment_id": "CM6", "brand": "雷鸟"},
            {"link_id": "L7", "content_id": "C5", "author_uid": "U2", "author_name": "达人乙",
             "published_at": self.PREVIOUS_DAY, "comment_id": "CM7", "brand": "雷鸟"},
        ]
        _write_csv(self.link_path, link_headers, link_rows)

        traffic_headers = [
            "traffic_date", "source_filename", "imported_at", "indoor_path", "search_path",
            "outdoor_path", "total_visitors", "total_visitors_change", "total_uv_value",
            "total_uv_value_change", "indoor_visitors", "indoor_visitors_change",
            "indoor_uv_value", "indoor_uv_value_change", "search_visitors",
            "search_visitors_change", "search_uv_value", "search_uv_value_change",
            "outdoor_visitors", "outdoor_visitors_change", "outdoor_uv_value",
            "outdoor_uv_value_change",
        ]
        traffic_rows = [
            {"traffic_date": day, "total_visitors": str(total), "search_visitors": str(search),
             "outdoor_visitors": "999", "source_filename": "fixture.xlsx"}
            for day, total, search in (
                ("2026-08-10", 100, 10), ("2026-08-11", 100, 20),
                ("2026-08-12", 100, 30), (self.PREVIOUS_DAY, 100, 5),
            )
        ]
        _write_csv(self.traffic_path, traffic_headers, traffic_rows)

        report = {
            "generated_at": "2026-08-13T08:00:00+08:00",
            "daily": [
                _day(self.PREVIOUS_DAY, thunderbird_content=1, all_content=1,
                     thunderbird_links=1, all_links=1, play=40, all_play=40,
                     search=5, total_visitors=100, store_sales=9, order_amount=900,
                     sales_quantity=9, commission=9),
                _day("2026-08-10", thunderbird_content=1, all_content=2,
                     thunderbird_links=2, all_links=3, play=100, all_play=180,
                     search=10, total_visitors=100, store_sales=20, order_amount=1200,
                     sales_quantity=2, commission=90),
                _day("2026-08-11", thunderbird_content=1, all_content=1,
                     thunderbird_links=2, all_links=2, play=90, all_play=90,
                     search=20, total_visitors=100, store_sales=30, order_amount=1800,
                     sales_quantity=3, commission=100),
                _day("2026-08-12", thunderbird_content=0, all_content=1,
                     thunderbird_links=0, all_links=0, play=50, all_play=50,
                     search=30, total_visitors=100, store_sales=40, order_amount=2400,
                     sales_quantity=4, commission=110),
            ],
            "overview_rankings": {"content": {"rows": content_rows}},
        }
        self.report_path.write_text(json.dumps(report, ensure_ascii=False), encoding="utf-8")

        self.patches = [
            patch.object(config, "REPORT_DATA_PATH", str(self.report_path)),
            patch.object(config, "CONTENT_FACTS_PATH", str(self.content_path)),
            patch.object(config, "LINK_FACTS_PATH", str(self.link_path)),
            patch.object(config, "TRAFFIC_FACTS_PATH", str(self.traffic_path)),
        ]
        for item in self.patches:
            item.start()
        self.previous_loader = server.loader
        self.loader = server.DataLoader()
        server.loader = self.loader
        self.client = TestClient(server.app)

    def tearDown(self) -> None:
        server.loader = self.previous_loader
        for item in reversed(self.patches):
            item.stop()
        self.tempdir.cleanup()

    @staticmethod
    def _card_map(cards: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
        return {str(card.get("key")): card for card in cards}

    @staticmethod
    def _first_present(row: dict[str, Any], *keys: str) -> Any:
        for key in keys:
            if key in row:
                return row[key]
        return None

    def test_date_drilldown_has_complete_fields_and_exact_date_filter(self) -> None:
        response = self.client.get(
            "/api/content-detail",
            params={"start_date": self.CURRENT_START, "end_date": self.CURRENT_END,
                    "date": "2026-08-10", "limit": 50},
        )
        self.assertEqual(response.status_code, 200, response.text)
        rows = response.json()
        self.assertEqual({row["content_id"] for row in rows}, {"C1", "C2"})
        required_groups = (
            ("title",),
            ("url", "content_url", "link"),
            ("creator_name", "account", "author_name"),
            ("play_count", "plays", "play"),
            ("interaction_count", "interactions", "interaction"),
            ("comment_blue_link_count", "blue_link_count", "comment_link_count"),
            ("thunderbird_link_count", "雷鸟蓝链数"),
        )
        for row in rows:
            for group in required_groups:
                self.assertIn(
                    next((key for key in group if key in row), None),
                    group,
                    f"下钻记录缺少字段 {group}: {row}",
                )
            self.assertTrue(self._first_present(row, "title"))
            self.assertTrue(self._first_present(row, "url", "content_url", "link"))
            self.assertTrue(self._first_present(row, "creator_name", "account", "author_name"))
            self.assertIsInstance(self._first_present(row, "play_count", "plays", "play"), (int, float))
            self.assertIsInstance(self._first_present(row, "interaction_count", "interactions", "interaction"), (int, float))

        # A date outside the selected day must never leak into drill-down.
        empty = self.client.get(
            "/api/content-detail",
            params={"start_date": self.CURRENT_START, "end_date": self.CURRENT_END,
                    "date": self.PREVIOUS_DAY, "limit": 50},
        )
        self.assertEqual(empty.status_code, 200, empty.text)
        self.assertEqual(empty.json(), [])

    def test_date_range_filter_is_consistent_with_thunderbird_detail(self) -> None:
        detail = self.client.get(
            "/api/content-detail",
            params={"start_date": self.CURRENT_START, "end_date": self.CURRENT_END,
                    "scope": "thunderbird", "limit": 50},
        )
        self.assertEqual(detail.status_code, 200, detail.text)
        rows = detail.json()
        self.assertEqual({row["content_id"] for row in rows}, {"C1", "C3"})
        self.assertEqual(sum(row["thunderbird_link_count"] for row in rows), 4)

        cards_response = self.client.get(
            "/api/kpi-cards",
            params={"start_date": self.CURRENT_START, "end_date": self.CURRENT_END},
        )
        self.assertEqual(cards_response.status_code, 200, cards_response.text)
        cards = self._card_map(cards_response.json()["cards"])
        self.assertEqual(cards["content_count"]["current_value"], len(rows))
        self.assertEqual(cards["link_count"]["current_value"], 4)

        # Date range narrowing must change the same data universe, not merely
        # the display label.
        one_day = self.client.get(
            "/api/content-detail",
            params={"start_date": "2026-08-11", "end_date": "2026-08-11",
                    "scope": "thunderbird", "limit": 50},
        )
        self.assertEqual(one_day.status_code, 200, one_day.text)
        self.assertEqual({row["content_id"] for row in one_day.json()}, {"C3"})

    def test_core_kpis_have_seven_cards_and_correct_sources(self) -> None:
        response = self.client.get(
            "/api/kpi-cards",
            params={"start_date": self.CURRENT_START, "end_date": self.CURRENT_END},
        )
        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        cards = self._card_map(payload["cards"])

        click_key = next((key for key in ("jd_clicks", "jd_click_count", "alliance_clicks") if key in cards), None)
        amount_key = next((key for key in ("jd_amount", "jd_order_amount", "alliance_order_amount") if key in cards), None)
        self.assertIsNotNone(click_key, f"缺少京东联盟点击卡片: {sorted(cards)}")
        self.assertIsNotNone(amount_key, f"缺少京东联盟订单金额卡片: {sorted(cards)}")
        self.assertIn("store_sales", cards, f"缺少店铺销售卡片: {sorted(cards)}")
        self.assertEqual(len(cards), 7, f"核心指标卡应为7张且key唯一: {sorted(cards)}")

        for key in ("content_count", "link_count", "play_count", "store_traffic"):
            self.assertIn(key, cards)
            card = cards[key]
            self.assertIn("current_value", card)
            self.assertIn("total_value", card)
            self.assertIn("ratio", card)
            self.assertIn("prev_period_value", card)
            self.assertIn("prev_ratio", card)
            self.assertIn(card.get("data_status"), ("ready", "partial", "unavailable"))

        # Three content metrics use Thunderbird/all monitored numerators and
        # denominators.  Values are 2/4, 4/5, and 240/370 respectively.
        self.assertEqual(cards["content_count"]["current_value"], 2)
        self.assertEqual(cards["content_count"]["total_value"], 4)
        self.assertAlmostEqual(cards["content_count"]["ratio"], 50.0, places=2)
        self.assertEqual(cards["link_count"]["current_value"], 4)
        self.assertEqual(cards["link_count"]["total_value"], 5)
        self.assertAlmostEqual(cards["link_count"]["ratio"], 80.0, places=2)
        self.assertEqual(cards["play_count"]["current_value"], 240)
        self.assertEqual(cards["play_count"]["total_value"], 320)
        self.assertAlmostEqual(cards["play_count"]["ratio"], 75.0, places=2)

        # Store traffic is search / all-site traffic.  The fixture has an
        # intentionally large off-site value (999) to catch search+off-site
        # regressions: 60 / 300 = 20%, never 3,530 / 300.
        self.assertEqual(cards["store_traffic"]["current_value"], 60)
        self.assertEqual(cards["store_traffic"]["total_value"], 300)
        self.assertAlmostEqual(cards["store_traffic"]["ratio"], 20.0, places=2)

        self.assertEqual(cards["store_sales"]["current_value"], 90)
        # The fixture's actual alliance order amount is 5,400.  Commission
        # (300) and whole-store transaction amount (9,000) are deliberately
        # different and must not be substituted.
        self.assertEqual(cards[amount_key]["current_value"], 5400)
        self.assertNotEqual(cards[amount_key]["current_value"], 300)
        self.assertNotEqual(cards[amount_key]["current_value"], 9000)

        # No click source is present in the fixture.  It must be visibly
        # unavailable; numeric zero would falsely imply a measured zero.
        click_card = cards[click_key]
        self.assertEqual(click_card.get("data_status"), "unavailable")
        click_value = click_card.get("current_value", click_card.get("value"))
        self.assertIsNone(click_value, f"缺失点击源不应静默变为0: {click_card}")

    def test_period_metadata_and_previous_period_change_with_custom_range(self) -> None:
        response = self.client.get(
            "/api/kpi-cards",
            params={"start_date": "2026-08-11", "end_date": "2026-08-12"},
        )
        self.assertEqual(response.status_code, 200, response.text)
        payload = response.json()
        self.assertEqual(payload["period_start"], "2026-08-11")
        self.assertEqual(payload["period_end"], "2026-08-12")
        self.assertEqual(payload["previous_period_start"], "2026-08-09")
        self.assertEqual(payload["previous_period_end"], "2026-08-10")

        detail = self.client.get(
            "/api/content-detail",
            params={"start_date": "2026-08-11", "end_date": "2026-08-12", "limit": 50},
        )
        self.assertEqual(detail.status_code, 200, detail.text)
        self.assertEqual({row["content_id"] for row in detail.json()}, {"C3", "C4"})


if __name__ == "__main__":
    unittest.main(verbosity=2)
