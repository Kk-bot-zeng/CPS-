import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { isChannel } from "@/lib/channels";

type ImportOrder = {
  sourceKey: string; orderNo: string; productId: string; merchantCode: string;
  qty: number; paidAt: string; status: string; amount: number;
  talent: string; product: string; model?: string;
};

const mappingCache = new Map<string, {
  uploadId: string | null;
  values: Map<string, string>;
  at: number;
}>();

function normalizePaidAt(value: unknown) {
  if (typeof value === "number" || /^\d+(?:\.\d+)?$/.test(String(value ?? "").trim())) {
    const serial = Number(value);
    const date = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  const date = new Date(String(value ?? "").trim());
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

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
  const invalidDates = orders.filter((order) => !normalizePaidAt(order.paidAt)).length;
  if (invalidDates)
    return NextResponse.json({ error: `有 ${invalidDates} 条订单的支付时间无法识别，请检查表格日期格式` }, { status: 400 });

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
    let cached = mappingCache.get(body.channel);
    if (!cached || Date.now() - cached.at > 120_000) {
      const { data: upload } = await auth.admin.from("product_mapping_uploads")
        .select("id").eq("channel", body.channel).eq("active", true).maybeSingle();
      cached = { uploadId: upload?.id || null, values: new Map(), at: Date.now() };
      mappingCache.set(body.channel, cached);
    }
    if (cached.uploadId) {
      const missing = codes.filter((code) => !cached!.values.has(code));
      if (missing.length) {
      const { data } = await auth.admin.from("product_mappings")
          .select("merchant_code,promotion_name").eq("upload_id", cached.uploadId)
          .in("merchant_code", missing);
        for (const row of data || []) cached.values.set(row.merchant_code, row.promotion_name);
      }
      for (const code of codes) {
        const name = cached.values.get(code);
        if (name) mapping.set(code, name);
      }
    }
  }

  const rows = orders.map((order) => {
    const rawTalent = String(order.talent || "").trim();
    const matchedModel = mapping.get(order.merchantCode);
    return {
      platform: body.channel, source_key: order.sourceKey, order_no: order.orderNo,
      external_product_id: order.productId || null, merchant_code: order.merchantCode || null,
      quantity: order.qty, paid_at: normalizePaidAt(order.paidAt)!, order_status: order.status,
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
