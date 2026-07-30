-- 抖音销售明细、商品匹配表与达人识别
alter table public.orders add column if not exists merchant_code text;
alter table public.orders add column if not exists model_name text;
alter table public.orders add column if not exists source_key text;
alter table public.orders add column if not exists is_talent boolean not null default true;

update public.orders
set source_key = coalesce(source_key, order_no)
where source_key is null;

alter table public.orders alter column source_key set not null;

do $$ begin
  alter table public.orders drop constraint orders_platform_order_no_key;
exception when undefined_object then null; end $$;

create unique index if not exists orders_platform_source_key_uidx
  on public.orders(platform, source_key);
create index if not exists orders_douyin_analytics_idx
  on public.orders(platform, is_talent, paid_at);
create index if not exists orders_model_name_idx on public.orders(model_name);

create table if not exists public.product_mapping_uploads (
  id uuid primary key default uuid_generate_v4(),
  channel text not null check (channel in ('jd','douyin','tmall')),
  file_name text not null,
  row_count integer not null default 0,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.product_mappings (
  id uuid primary key default uuid_generate_v4(),
  upload_id uuid not null references public.product_mapping_uploads(id) on delete cascade,
  channel text not null check (channel in ('jd','douyin','tmall')),
  merchant_code text not null,
  promotion_name text not null,
  model_name text,
  created_at timestamptz not null default now(),
  unique(upload_id, merchant_code)
);

create index if not exists product_mappings_lookup_idx
  on public.product_mappings(channel, merchant_code);
create unique index if not exists product_mapping_one_active_upload_idx
  on public.product_mapping_uploads(channel) where active;

alter table public.product_mapping_uploads enable row level security;
alter table public.product_mappings enable row level security;
drop policy if exists "authenticated users can read mapping uploads" on public.product_mapping_uploads;
create policy "authenticated users can read mapping uploads" on public.product_mapping_uploads
  for select to authenticated using (true);
drop policy if exists "authenticated users can read product mappings" on public.product_mappings;
create policy "authenticated users can read product mappings" on public.product_mappings
  for select to authenticated using (true);

create or replace function public.replace_product_mappings(
  p_channel text,
  p_file_name text,
  p_rows jsonb,
  p_user_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_upload_id uuid;
  v_count integer;
begin
  if p_channel not in ('jd','douyin','tmall') then
    raise exception '无效渠道';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception '匹配表没有有效数据';
  end if;

  update product_mapping_uploads set active = false
  where channel = p_channel and active;

  insert into product_mapping_uploads(channel, file_name, row_count, active, created_by)
  values (p_channel, p_file_name, jsonb_array_length(p_rows), true, p_user_id)
  returning id into v_upload_id;

  insert into product_mappings(upload_id, channel, merchant_code, promotion_name, model_name)
  select v_upload_id, p_channel,
         trim(x->>'merchantCode'), trim(x->>'promotionName'), nullif(trim(x->>'modelName'), '')
  from jsonb_array_elements(p_rows) x
  where trim(coalesce(x->>'merchantCode','')) <> ''
    and trim(coalesce(x->>'promotionName','')) <> ''
  on conflict (upload_id, merchant_code) do update
  set promotion_name = excluded.promotion_name, model_name = excluded.model_name;

  get diagnostics v_count = row_count;
  update product_mapping_uploads set row_count = v_count where id = v_upload_id;
  return jsonb_build_object('ok', true, 'uploadId', v_upload_id, 'rowCount', v_count);
end;
$$;

revoke all on function public.replace_product_mappings(text,text,jsonb,uuid) from public, anon, authenticated;
grant execute on function public.replace_product_mappings(text,text,jsonb,uuid) to service_role;
