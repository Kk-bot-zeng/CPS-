create table if not exists sales_warning_acknowledgements (
  user_id uuid not null references app_users(id) on delete cascade,
  resource_key text not null,
  severity text not null check (severity in ('light','medium','heavy')),
  last_sale_at timestamptz,
  acknowledged_at timestamptz not null default now(),
  primary key (user_id, resource_key)
);
create index if not exists sales_warning_ack_user_idx on sales_warning_acknowledgements(user_id, acknowledged_at desc);
