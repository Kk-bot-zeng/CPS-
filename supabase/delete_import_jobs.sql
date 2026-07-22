-- 原子删除导入批次及其当前关联订单，仅供服务端 service_role 调用。
create or replace function public.delete_import_jobs(p_job_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_jobs integer;
  v_orders integer;
begin
  if p_job_ids is null or cardinality(p_job_ids) = 0 or cardinality(p_job_ids) > 100 then
    raise exception '请选择1至100个导入批次';
  end if;

  delete from public.orders where import_job_id = any(p_job_ids);
  get diagnostics v_orders = row_count;
  delete from public.import_jobs where id = any(p_job_ids);
  get diagnostics v_jobs = row_count;

  return jsonb_build_object('ok', true, 'deletedJobs', v_jobs, 'deletedOrders', v_orders);
end;
$$;

revoke all on function public.delete_import_jobs(uuid[]) from public, anon, authenticated;
grant execute on function public.delete_import_jobs(uuid[]) to service_role;
