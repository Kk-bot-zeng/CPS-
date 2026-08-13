CREATE SCHEMA IF NOT EXISTS monitor_dashboard;

CREATE TABLE IF NOT EXISTS monitor_dashboard.bilibili_content_facts (
  content_id text PRIMARY KEY, aid text, author_uid text, author_name text,
  published_at timestamp, title text, content_url text, keyword text
);
CREATE TABLE IF NOT EXISTS monitor_dashboard.bilibili_link_facts (
  link_id text, content_id text, author_uid text, author_name text,
  published_at timestamp, comment_id text, parent_comment_id text,
  comment_author_uid text, comment_author_name text, comment_text text,
  action_type text, position text, label text, url text, brand text,
  raw_model text, model_parse_status text, standard_model text,
  model_confidence text, model_match_level text, model_evidence text,
  attribution_grade text, link_status text, crawl_at timestamp
);
CREATE TABLE IF NOT EXISTS monitor_dashboard.jdsz_ffalcon_trade_daily (
  trade_date date, brand text, transaction_amount numeric,
  transaction_item_quantity numeric, source_url text, queried_at timestamp,
  query_note text, PRIMARY KEY (trade_date, brand)
);
CREATE TABLE IF NOT EXISTS monitor_dashboard.jdsz_traffic_source_daily (
  traffic_date date PRIMARY KEY, source_filename text, imported_at timestamptz,
  indoor_path text, search_path text, outdoor_path text,
  total_visitors numeric, total_visitors_change numeric, total_uv_value numeric,
  total_uv_value_change numeric, indoor_visitors numeric,
  indoor_visitors_change numeric, indoor_uv_value numeric,
  indoor_uv_value_change numeric, search_visitors numeric,
  search_visitors_change numeric, search_uv_value numeric,
  search_uv_value_change numeric, outdoor_visitors numeric,
  outdoor_visitors_change numeric, outdoor_uv_value numeric,
  outdoor_uv_value_change numeric
);
CREATE TABLE IF NOT EXISTS monitor_dashboard.jd_order_facts (
  order_id text, order_date date, complete_date date,
  product_id text, sku_name text, promoter_pin text, plan text,
  order_status text, is_valid text, quantity numeric,
  commission_amount numeric, actual_paid_amount numeric,
  actual_unit_price numeric, promotion_amount numeric, discount_amount numeric,
  source_file text, standard_model text, model_candidate text,
  model_mapping_source text, model_confidence text, model_match_level text,
  model_evidence text, model_review_status text
);

CREATE INDEX IF NOT EXISTS idx_monitor_content_published ON monitor_dashboard.bilibili_content_facts (published_at);
CREATE INDEX IF NOT EXISTS idx_monitor_content_author ON monitor_dashboard.bilibili_content_facts (author_uid);
CREATE INDEX IF NOT EXISTS idx_monitor_link_published ON monitor_dashboard.bilibili_link_facts (published_at);
CREATE INDEX IF NOT EXISTS idx_monitor_link_content ON monitor_dashboard.bilibili_link_facts (content_id);
CREATE INDEX IF NOT EXISTS idx_monitor_order_date ON monitor_dashboard.jd_order_facts (order_date);
