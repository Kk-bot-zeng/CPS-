import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { isChannel } from "@/lib/channels";

type ImportOrder = {
  sourceKey: string; orderNo: string; productId: string; merchantCode: string;
  qty: number; paidAt: string; status: string; amount: number;
  talent: string; product: string; model?: string;
};

function isRealTalent(value: string) {
  const name = value.trim();
  if (!name || name === "-" || name === "—") return false;
  if (/^FFALCON雷鸟/i.test(name)) return false;
  if (/(官方|官旗|旗舰店|总部|云仓|中心场|自播)/i.test(name)) return false;
  if (/^雷鸟电视.*直播间$/i.test(name)) return false;
  return true;
}

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;
  const body = (await request.json()) as {
    channel?: string; orders?: ImportOrder[]; importJobId?: string;
    fileName?: string; firstBatch?: boolean; finalBatch?: boolean; totalRows?: number;
  };
  if (!isChannel(body.channel))
    return NextResponse.json({ error: "请先选择有效渠道" }, { status: 400 });
  const orders = body.orders || [];
  if (!orders.length || orders.length > 1000)
    return NextResponse.json({ error: "每批必须包含1至1000条订单" }, { status: 400 });

  let jobId = body.importJobId;
  if (body.firstBatch || !jobId) {
    const { data, error } = await auth.admin.from("import_jobs").insert({
      channel: body.channel, file_name: body.fileName || "订单导入.xlsx",
      status: "processing", created_by: auth.user.id,
    }).select("id").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    jobId = data.id;
  }

  const codes = [...new Set(orders.map((x) => x.merchantCode).filter(Boolean))];
  const mapping = new Map<string, string>();
  if (codes.length) {
    const { data: upload } = await auth.admin.from("product_mapping_uploads")
      .select("id").eq("channel", body.channel).eq("active", true).maybeSingle();
    if (upload) {
      const { data } = await auth.admin.from("product_mappings")
        .select("merchant_code,promotion_name").eq("upload_id", upload.id)
        .in("merchant_code", codes);
      for (const row of data || []) mapping.set(row.merchant_code, row.promotion_name);
    }
  }

  const rows = orders.map((order) => {
    const rawTalent = String(order.talent || "").trim();
    const matchedModel = mapping.get(order.merchantCode);
    return {
      platform: body.channel, source_key: order.sourceKey, order_no: order.orderNo,
      external_product_id: order.productId || null, merchant_code: order.merchantCode || null,
      quantity: order.qty, paid_at: order.paidAt, order_status: order.status,
      payable_amount: order.amount, talent_name_raw: rawTalent || "-",
      is_talent: isRealTalent(rawTalent), product_name_raw: order.product || null,
      model_name: matchedModel || order.model || null, import_job_id: jobId,
      source_payload: order, updated_at: new Date().toISOString(),
    };
  });
  const { error } = await auth.admin.from("orders")
    .upsert(rows, { onConflict: "platform,source_key" });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (body.finalBatch) {
    await auth.admin.from("import_jobs").update({
      status: "completed", total_rows: body.totalRows || orders.length,
      error_rows: rows.filter((x) => !x.model_name).length,
      skipped_rows: rows.filter((x) => !x.is_talent).length,
      completed_at: new Date().toISOString(),
    }).eq("id", jobId);
  }
  return NextResponse.json({ ok: true, importJobId: jobId, processed: rows.length,
    unmatched: rows.filter((x) => !x.model_name).length,
    excludedTalents: rows.filter((x) => !x.is_talent).length });
}
