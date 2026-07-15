-- 雷鸟电视CPS系统：看板性能优化函数
-- 在 Supabase SQL Editor 中执行一次即可。
create or replace function public.dashboard_summary(p_start date default null, p_end date default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
with filtered as (
  select payable_amount, quantity, order_status, talent_name_raw,
         coalesce(nullif(product_name_raw, ''), '待映射商品') as product_name,
         paid_at::date as sales_date
  from public.orders
  where (p_start is null or paid_at >= p_start::timestamptz)
    and (p_end is null or paid_at < (p_end + 1)::timestamptz)
), totals as (
  select coalesce(sum(payable_amount),0) as gmv,
         coalesce(sum(payable_amount) filter(where order_status <> '已关闭'),0) as gsv,
         count(*) as orders,
         count(*) filter(where order_status <> '已关闭') as valid_orders,
         coalesce(sum(quantity),0) as quantity,
         count(distinct talent_name_raw) as active_talents
  from filtered
), talent_rows as (
  select talent_name_raw as name, sum(payable_amount) as gmv,
         sum(payable_amount) filter(where order_status <> '已关闭') as gsv,
         count(*) as orders
  from filtered group by talent_name_raw order by gmv desc limit 50
), product_rows as (
  select product_name as name, sum(payable_amount) as gmv, sum(quantity) as qty,
         count(distinct talent_name_raw) as talents
  from filtered group by product_name order by gmv desc limit 50
), daily_rows as (
  select sales_date as date, sum(payable_amount) as gmv,
         sum(payable_amount) filter(where order_status <> '已关闭') as gsv
  from filtered group by sales_date order by sales_date
)
select jsonb_build_object(
  'gmv', t.gmv, 'gsv', t.gsv, 'orders', t.orders,
  'validOrders', t.valid_orders, 'quantity', t.quantity,
  'activeTalents', t.active_talents,
  'talents', coalesce((select jsonb_agg(to_jsonb(x)) from talent_rows x), '[]'::jsonb),
  'products', coalesce((select jsonb_agg(to_jsonb(x)) from product_rows x), '[]'::jsonb),
  'daily', coalesce((select jsonb_agg(to_jsonb(x)) from daily_rows x), '[]'::jsonb)
) from totals t;
$$;

grant execute on function public.dashboard_summary(date,date) to authenticated, service_role;

create index if not exists orders_talent_name_raw_idx on public.orders(talent_name_raw);
create index if not exists orders_product_name_raw_idx on public.orders(product_name_raw);
create index if not exists orders_paid_status_idx on public.orders(paid_at, order_status);
