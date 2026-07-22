import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isChannel } from "@/lib/channels";

type ImportOrder = {
  orderNo: string;
  productId: string;
  qty: number;
  paidAt: string;
  status: string;
  amount: number;
  talent: string;
  product: string;
};

export async function POST(request: Request) {
  const userClient = await createClient();
  const admin = createAdminClient();
  if (!userClient || !admin)
    return NextResponse.json(
      { error: "数据库尚未配置，当前为演示模式" },
      { status: 503 },
    );
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "登录已失效" }, { status: 401 });
  const body = (await request.json()) as {
    channel?: string;
    orders?: ImportOrder[];
    importJobId?: string;
    fileName?: string;
    firstBatch?: boolean;
    finalBatch?: boolean;
    totalRows?: number;
  };
  if (!isChannel(body.channel))
    return NextResponse.json(
      { error: "请先选择有效渠道（京东、抖音或天猫）" },
      { status: 400 },
    );
  const orders = body.orders ?? [];
  if (!orders.length || orders.length > 1000)
    return NextResponse.json(
      { error: "每批必须包含1至1000条订单" },
      { status: 400 },
    );

  let jobId = body.importJobId;
  if (body.firstBatch || !jobId) {
    const { data, error } = await admin
      .from("import_jobs")
      .insert({
        channel: body.channel,
        file_name: body.fileName || "订单导入.xlsx",
        status: "processing",
        created_by: user.id,
      })
      .select("id")
      .single();
    if (error)
      return NextResponse.json({ error: error.message }, { status: 400 });
    jobId = data.id;
  } else {
    const { data: job, error: jobError } = await admin
      .from("import_jobs")
      .select("channel,status")
      .eq("id", jobId)
      .single();
    if (jobError || !job)
      return NextResponse.json({ error: "导入任务不存在" }, { status: 400 });
    if (job.channel !== body.channel)
      return NextResponse.json(
        { error: "导入任务渠道与当前选择不一致，请重新上传" },
        { status: 409 },
      );
    if (job.status !== "processing")
      return NextResponse.json({ error: "该导入任务已经结束" }, { status: 409 });
  }

  const rows = orders.map((order) => ({
    platform: body.channel,
    order_no: order.orderNo,
    external_product_id: order.productId || null,
    quantity: order.qty,
    paid_at: order.paidAt,
    order_status: order.status,
    payable_amount: order.amount,
    talent_name_raw: order.talent,
    product_name_raw: order.product || null,
    import_job_id: jobId,
    source_payload: order,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await admin
    .from("orders")
    .upsert(rows, { onConflict: "platform,order_no" });
  if (error)
    return NextResponse.json({ error: error.message }, { status: 400 });
  if (body.finalBatch)
    await admin
      .from("import_jobs")
      .update({
        status: "completed",
        total_rows: body.totalRows || orders.length,
        completed_at: new Date().toISOString(),
      })
      .eq("id", jobId);
  return NextResponse.json({
    ok: true,
    importJobId: jobId,
    processed: orders.length,
  });
}
