alter table leaders add column if not exists match_id text;
alter table talents add column if not exists match_id text;
create index if not exists leaders_platform_match_id_idx on leaders(platform,match_id) where match_id is not null;
create index if not exists talents_platform_match_id_idx on talents(platform,match_id) where match_id is not null;
alter table product_mappings add column if not exists count_in_sales boolean not null default true;
create table if not exists plan_whitelist_uploads(
  id uuid primary key default uuid_generate_v4(), channel text not null check(channel in('jd','douyin','tmall')),
  file_name text not null,row_count integer not null default 0,active boolean not null default true,
  created_by uuid references app_users(id) on delete set null,created_at timestamptz not null default now()
);
create unique index if not exists plan_whitelist_one_active_idx on plan_whitelist_uploads(channel) where active;
create table if not exists plan_whitelist_items(
  id uuid primary key default uuid_generate_v4(),upload_id uuid not null references plan_whitelist_uploads(id) on delete cascade,
  channel text not null check(channel in('jd','douyin','tmall')),plan_name text not null,enabled boolean not null default true,notes text,
  unique(upload_id,plan_name)
);
