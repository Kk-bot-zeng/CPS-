\set ON_ERROR_STOP on
TRUNCATE monitor_dashboard.bilibili_content_facts,
  monitor_dashboard.bilibili_link_facts,
  monitor_dashboard.jdsz_ffalcon_trade_daily,
  monitor_dashboard.jdsz_traffic_source_daily,
  monitor_dashboard.jd_order_facts;
\copy monitor_dashboard.bilibili_content_facts FROM '/tmp/bilibili_content_facts.csv' WITH (FORMAT csv, HEADER true)
\copy monitor_dashboard.bilibili_link_facts FROM '/tmp/bilibili_link_facts.csv' WITH (FORMAT csv, HEADER true)
\copy monitor_dashboard.jdsz_ffalcon_trade_daily FROM '/tmp/jdsz_ffalcon_trade_daily.csv' WITH (FORMAT csv, HEADER true)
\copy monitor_dashboard.jdsz_traffic_source_daily FROM '/tmp/jdsz_traffic_source_daily.csv' WITH (FORMAT csv, HEADER true)
\copy monitor_dashboard.jd_order_facts FROM '/tmp/jd_order_facts.csv' WITH (FORMAT csv, HEADER true)
