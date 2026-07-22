-- 渠道维度升级：生产库执行一次，然后再执行 performance.sql。
alter table public.import_jobs add column if not exists channel text;

-- 历史数据无法可靠推断渠道，统一标记为待确认；请在上线前人工修正。
update public.orders set platform = 'unknown' where platform is null or platform = 'default';
update public.talents set platform = 'unknown' where platform is null or platform not in ('jd','douyin','tmall');
update public.leaders set platform = 'unknown' where platform is null or platform not in ('jd','douyin','tmall');
update public.import_jobs set channel = 'unknown' where channel is null;

alter table public.import_jobs alter column channel set not null;

do $$ begin
  alter table public.orders add constraint orders_channel_check check (platform in ('jd','douyin','tmall','unknown'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.talents add constraint talents_channel_check check (platform in ('jd','douyin','tmall','unknown'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.leaders add constraint leaders_channel_check check (platform in ('jd','douyin','tmall','unknown'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.import_jobs add constraint import_jobs_channel_check check (channel in ('jd','douyin','tmall','unknown'));
exception when duplicate_object then null; end $$;

create index if not exists orders_platform_paid_at_idx on public.orders(platform, paid_at);
create index if not exists talents_platform_idx on public.talents(platform);
create index if not exists leaders_platform_idx on public.leaders(platform);
create index if not exists import_jobs_channel_idx on public.import_jobs(channel);
