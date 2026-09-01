-- 产品资料库（TV/显示器隔离）
--
-- 本迁移只新增 product_knowledge_* 表，不修改订单、商品匹配表及现有文案数据。
-- 产品的当前值保存在 product_knowledge_products，历史快照保存在
-- product_knowledge_versions；导入预览先落在 product_knowledge_imports，确认时
-- 由服务端事务一次性应用。

create extension if not exists "uuid-ossp";

create table if not exists public.product_knowledge_fields (
  id uuid primary key default uuid_generate_v4(),
  product_category text not null check (product_category in ('tv', 'monitor')),
  field_key text not null check (field_key ~ '^[a-z][a-z0-9_]{1,63}$'),
  field_label text not null check (length(trim(field_label)) between 1 and 80),
  field_type text not null default 'text'
    check (field_type in ('text', 'textarea', 'number', 'date', 'select', 'multiselect')),
  options jsonb not null default '[]'::jsonb,
  required boolean not null default false,
  active boolean not null default true,
  sort_order integer not null default 0,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_category, field_key)
);

create index if not exists product_knowledge_fields_category_idx
  on public.product_knowledge_fields(product_category, active, sort_order, field_label);

create table if not exists public.product_knowledge_products (
  id uuid primary key default uuid_generate_v4(),
  product_category text not null check (product_category in ('tv', 'monitor')),
  product_series text,
  canonical_model text not null check (length(trim(canonical_model)) between 1 and 160),
  canonical_model_normalized text not null,
  sku text,
  promotion_name text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  custom_values jsonb not null default '{}'::jsonb,
  current_version_id uuid,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_category, canonical_model_normalized)
);

create index if not exists product_knowledge_products_category_status_idx
  on public.product_knowledge_products(product_category, status, updated_at desc);
create index if not exists product_knowledge_products_sku_idx
  on public.product_knowledge_products(product_category, sku)
  where sku is not null;

create table if not exists public.product_knowledge_versions (
  id uuid primary key default uuid_generate_v4(),
  product_id uuid not null references public.product_knowledge_products(id) on delete cascade,
  version_no integer not null check (version_no > 0),
  source text not null default 'manual'
    check (source in ('manual', 'import', 'rollback')),
  snapshot jsonb not null,
  note text,
  rollback_from_version_id uuid references public.product_knowledge_versions(id) on delete set null,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (product_id, version_no)
);

do $$ begin
  alter table public.product_knowledge_products
    add constraint product_knowledge_products_current_version_fk
    foreign key (current_version_id)
    references public.product_knowledge_versions(id)
    on delete set null;
exception when duplicate_object then null;
end $$;

create index if not exists product_knowledge_versions_product_idx
  on public.product_knowledge_versions(product_id, version_no desc);

create table if not exists public.product_knowledge_policies (
  id uuid primary key default uuid_generate_v4(),
  product_id uuid not null references public.product_knowledge_products(id) on delete cascade,
  policy_name text not null check (length(trim(policy_name)) between 1 and 160),
  channel text not null default 'all' check (channel in ('all', 'jd', 'douyin', 'tmall')),
  policy_data jsonb not null default '{}'::jsonb,
  starts_at timestamptz,
  ends_at timestamptz,
  status text not null default 'active' check (status in ('active', 'inactive')),
  notes text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at >= starts_at)
);

create index if not exists product_knowledge_policies_product_idx
  on public.product_knowledge_policies(product_id, status, starts_at, ends_at);
create index if not exists product_knowledge_policies_channel_idx
  on public.product_knowledge_policies(channel, status, starts_at, ends_at);

create table if not exists public.product_knowledge_imports (
  id uuid primary key default uuid_generate_v4(),
  product_category text not null check (product_category in ('tv', 'monitor')),
  file_name text not null default '产品资料库.xlsx',
  mode text not null check (mode in ('insert_only', 'merge', 'overwrite')),
  status text not null default 'preview'
    check (status in ('preview', 'confirmed', 'cancelled', 'expired')),
  "rows" jsonb not null,
  schema_snapshot jsonb not null default '{}'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  expires_at timestamptz not null default (now() + interval '24 hours')
);

create index if not exists product_knowledge_imports_user_idx
  on public.product_knowledge_imports(created_by, created_at desc);
create index if not exists product_knowledge_imports_status_idx
  on public.product_knowledge_imports(status, expires_at);

-- 统一规范型号，防止“ 65 鹤 6 26 款 ”与“65 鹤 6 26 款”形成两条资料。
create or replace function public.product_knowledge_normalize_model()
returns trigger
language plpgsql
as $$
begin
  new.canonical_model_normalized := lower(regexp_replace(trim(new.canonical_model), '\s+', ' ', 'g'));
  return new;
end;
$$;

drop trigger if exists product_knowledge_products_normalize_model_trg
  on public.product_knowledge_products;
create trigger product_knowledge_products_normalize_model_trg
before insert or update of canonical_model on public.product_knowledge_products
for each row execute function public.product_knowledge_normalize_model();

-- 已存在的历史表上执行迁移时，触发器不会替换旧值；这里显式回填一次。
update public.product_knowledge_products
set canonical_model_normalized = lower(regexp_replace(trim(canonical_model), '\s+', ' ', 'g'))
where canonical_model_normalized is null or canonical_model_normalized = '';

-- 本地部署使用应用层会话（app_users），Supabase 部署使用服务端连接；不在此处
-- 绑定 auth.users，避免迁移无法在本地开发库执行。
comment on table public.product_knowledge_products is '产品资料库当前有效资料，按品类和标准型号隔离';
comment on table public.product_knowledge_fields is '产品资料库的品类级动态字段定义';
comment on table public.product_knowledge_versions is '产品资料库不可破坏的历史版本快照';
comment on table public.product_knowledge_policies is '与长期产品参数分离的活动政策及有效期';
comment on table public.product_knowledge_imports is '批量导入预览与确认的临时事务数据';

create table if not exists public.copywriting_generations (
  id uuid primary key default uuid_generate_v4(),
  created_by uuid not null,
  product_category text check (product_category in ('tv', 'monitor')),
  channel text check (channel is null or channel in ('all', 'jd', 'douyin', 'tmall')),
  product_ids uuid[] not null default '{}'::uuid[],
  product_version_ids uuid[] not null default '{}'::uuid[],
  request_config jsonb not null default '{}'::jsonb,
  result_text text not null,
  created_at timestamptz not null default now()
);

create index if not exists copywriting_generations_user_idx
  on public.copywriting_generations(created_by, created_at desc);
create index if not exists copywriting_generations_category_idx
  on public.copywriting_generations(product_category, created_at desc);
comment on table public.copywriting_generations is '文案生成历史，记录生成请求与引用的产品资料版本';
