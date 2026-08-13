alter table public.leaders
  add column if not exists product_category text not null default 'tv';
alter table public.talents
  add column if not exists product_category text not null default 'tv';

do $$ begin
  alter table public.leaders add constraint leaders_product_category_check
    check (product_category in ('tv', 'monitor'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.talents add constraint talents_product_category_check
    check (product_category in ('tv', 'monitor'));
exception when duplicate_object then null; end $$;

create index if not exists leaders_category_platform_idx
  on public.leaders(product_category, platform);
create index if not exists talents_category_platform_idx
  on public.talents(product_category, platform);
create index if not exists leaders_category_match_id_idx
  on public.leaders(product_category, platform, match_id) where match_id is not null;
create index if not exists talents_category_match_id_idx
  on public.talents(product_category, platform, match_id) where match_id is not null;
