create extension if not exists "uuid-ossp";

create table if not exists public.leaders (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  contact_name text,
  phone text,
  wechat text,
  platform text not null check (platform in ('jd', 'douyin', 'tmall')),
  province text,
  city text,
  district text,
  address text,
  longitude numeric(10, 7),
  latitude numeric(10, 7),
  cooperation_status text not null default '合作中',
  tags text[] not null default '{}',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.talents (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  platform text not null check (platform in ('jd', 'douyin', 'tmall')),
  platform_account text,
  phone text,
  wechat text,
  leader_id uuid references public.leaders(id) on delete set null,
  province text,
  city text,
  district text,
  address text,
  longitude numeric(10, 7),
  latitude numeric(10, 7),
  location_precision text,
  cooperation_status text not null default '合作中',
  tags text[] not null default '{}',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(platform, platform_account)
);

create table if not exists public.products (
  id uuid primary key default uuid_generate_v4(),
  external_product_id text unique,
  name text not null,
  model_family text,
  size text,
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default uuid_generate_v4(),
  platform text not null check (platform in ('jd', 'douyin', 'tmall')),
  order_no text not null,
  external_product_id text,
  quantity integer not null check (quantity > 0),
  paid_at timestamptz not null,
  order_status text not null,
  payable_amount numeric(14, 2) not null check (payable_amount >= 0),
  talent_name_raw text not null,
  product_name_raw text,
  talent_id uuid references public.talents(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  import_job_id uuid,
  source_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(platform, order_no)
);

create table if not exists public.import_jobs (
  id uuid primary key default uuid_generate_v4(),
  channel text not null check (channel in ('jd', 'douyin', 'tmall')),
  file_name text not null,
  file_hash text,
  status text not null default 'processing',
  total_rows integer not null default 0,
  inserted_rows integer not null default 0,
  updated_rows integer not null default 0,
  skipped_rows integer not null default 0,
  error_rows integer not null default 0,
  date_min timestamptz,
  date_max timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

do $$ begin
  alter table public.orders add constraint orders_import_job_fk foreign key (import_job_id)
    references public.import_jobs(id) on delete set null;
exception when duplicate_object then null;
end $$;

create index if not exists orders_paid_at_idx on public.orders(paid_at);
create index if not exists orders_platform_paid_at_idx on public.orders(platform, paid_at);
create index if not exists talents_platform_idx on public.talents(platform);
create index if not exists leaders_platform_idx on public.leaders(platform);
create index if not exists import_jobs_channel_idx on public.import_jobs(channel);
create index if not exists orders_talent_id_idx on public.orders(talent_id);
create index if not exists orders_product_id_idx on public.orders(product_id);
create index if not exists orders_status_idx on public.orders(order_status);
create index if not exists talents_leader_id_idx on public.talents(leader_id);
create index if not exists talents_city_idx on public.talents(city);
create index if not exists leaders_city_idx on public.leaders(city);

create or replace view public.daily_sales as
select
  date_trunc('day', paid_at) as sales_date,
  talent_id,
  product_id,
  sum(payable_amount) as gmv,
  sum(payable_amount) filter (where order_status <> '已关闭') as gsv,
  count(*) as order_count,
  count(*) filter (where order_status <> '已关闭') as valid_order_count,
  sum(quantity) as quantity
from public.orders
group by 1, 2, 3;

alter table public.talents enable row level security;
alter table public.leaders enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.import_jobs enable row level security;

create policy "authenticated users can read talents" on public.talents for select to authenticated using (true);
create policy "authenticated users can read leaders" on public.leaders for select to authenticated using (true);
create policy "authenticated users can read products" on public.products for select to authenticated using (true);
create policy "authenticated users can read orders" on public.orders for select to authenticated using (true);
create policy "authenticated users can read import jobs" on public.import_jobs for select to authenticated using (true);
