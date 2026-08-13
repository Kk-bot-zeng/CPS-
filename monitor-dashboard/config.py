"""Portable configuration for the external development hand-off package."""

import os

PROJECT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(PROJECT_DIR, "data")
REPORT_DATA_PATH = os.path.join(DATA_DIR, "report_data.json")
CONTENT_FACTS_PATH = os.path.join(DATA_DIR, "normalized", "bilibili_content_facts.csv")
LINK_FACTS_PATH = os.path.join(DATA_DIR, "normalized", "bilibili_link_facts.csv")
TRAFFIC_FACTS_PATH = os.path.join(DATA_DIR, "normalized", "jdsz_traffic_source_daily.csv")

HOST = "127.0.0.1"
PORT = 8090

# Set this only on the recipient's local machine.  It is intentionally empty in
# the hand-off package and the dashboard works without it until AI is invoked.
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
DEEPSEEK_BASE_URL = "https://live-turing.cn.llm.tcljd.com/api/v1"
DEEPSEEK_MODEL = "deepseek-v4-flash-0731"

ANALYSIS_PROMPTS = {
    "ai_today_analysis": """你是专业的CPS达人运营数据分析师。基于所给周期数据，总结内容、蓝链与转化变化，并给出不超过两条可执行建议。数据不足时明确说明，不得臆测。""",
    "ai_content_analysis": """你是专业的CPS达人运营数据分析师。分析内容播放、互动、蓝链与转化的关系，指出值得复盘的内容。数据不足时明确说明。""",
    "ai_creator_analysis": """你是专业的CPS达人运营数据分析师。基于达人周期表现给出建联、跟进或观察建议，引用可见数据证据。""",
    "ai_trend_analysis": """你是专业的CPS达人运营数据分析师。比较本期与上期达人内容、播放、蓝链和转化变化，识别风险与机会。""",
}
