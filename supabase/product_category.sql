alter table orders add column if not exists product_category text not null default 'tv'
  check (product_category in ('tv','monitor'));
alter table import_jobs add column if not exists product_category text not null default 'tv'
  check (product_category in ('tv','monitor'));
alter table product_mapping_uploads add column if not exists product_category text not null default 'tv'
  check (product_category in ('tv','monitor'));
alter table product_mappings add column if not exists product_category text not null default 'tv'
  check (product_category in ('tv','monitor'));
alter table plan_whitelist_uploads add column if not exists product_category text not null default 'tv'
  check (product_category in ('tv','monitor'));
alter table plan_whitelist_items add column if not exists product_category text not null default 'tv'
  check (product_category in ('tv','monitor'));

alter table orders drop constraint if exists orders_platform_source_key_key;
drop index if exists orders_platform_source_key_key;
create unique index if not exists orders_category_platform_source_key_idx
  on orders(product_category, platform, source_key);

drop index if exists product_mapping_one_active_upload_idx;
create unique index if not exists product_mapping_one_active_upload_idx
  on product_mapping_uploads(product_category, channel) where active;

drop index if exists plan_whitelist_one_active_idx;
create unique index if not exists plan_whitelist_one_active_idx
  on plan_whitelist_uploads(product_category, channel) where active;

create index if not exists orders_category_platform_paid_at_idx
  on orders(product_category, platform, paid_at);
