import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { isChannel } from "@/lib/channels";
import { pool } from "@/lib/db";

type MappingRow = {
  merchantCode: string;
  promotionName: string;
  modelName?: string;
  countInSales?: boolean;
};

export async function GET(request: Request) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;
  const channel = new URL(request.url).searchParams.get("channel") || "douyin";
  const category = new URL(request.url).searchParams.get("category") || "tv";
  if (!isChannel(channel))
    return NextResponse.json({ error: "无效渠道" }, { status: 400 });
  if (category !== "tv" && category !== "monitor") return NextResponse.json({ error: "无效品类" }, { status: 400 });
  const { rows } = await pool.query("select id,file_name,row_count,created_at from product_mapping_uploads where channel=$1 and product_category=$2 and active=true limit 1", [channel, category]);
  return NextResponse.json(rows[0] || null);
}

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;
  const body = (await request.json()) as {
    channel?: string;
    category?: string;
    fileName?: string;
    rows?: MappingRow[];
  };
  if (!isChannel(body.channel))
    return NextResponse.json({ error: "请先选择有效渠道" }, { status: 400 });
  const category = body.category === "monitor" ? "monitor" : "tv";
  const rows = (body.rows || [])
    .map((row) => ({
      merchantCode: String(row.merchantCode || "").trim(),
      promotionName: String(row.promotionName || "").trim(),
      modelName: String(row.modelName || "").trim(),
      countInSales: row.countInSales !== false,
    }))
    .filter((row) => row.merchantCode && row.promotionName);
  if (!rows.length || rows.length > 20000)
    return NextResponse.json(
      { error: "匹配表必须包含1至20000条有效记录" },
      { status: 400 },
    );
  const deduped = [...new Map(rows.map((row) => [row.merchantCode, row])).values()];
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("update product_mapping_uploads set active=false where channel=$1 and product_category=$2 and active=true", [body.channel, category]);
    const { rows: [upload] } = await client.query("insert into product_mapping_uploads(channel,product_category,file_name,row_count,active,created_by) values($1,$2,$3,$4,true,$5) returning id", [body.channel, category, body.fileName || "商品匹配表.xlsx", deduped.length, auth.user.id]);
    for (const row of deduped) await client.query("insert into product_mappings(upload_id,channel,product_category,merchant_code,promotion_name,model_name,count_in_sales) values($1,$2,$3,$4,$5,$6,$7)", [upload.id, body.channel, category, row.merchantCode, row.promotionName, row.modelName || null, row.countInSales]);
    await client.query("commit");
    return NextResponse.json({ ok: true, rowCount: deduped.length });
  } catch (error) {
    await client.query("rollback");
    return NextResponse.json({ error: error instanceof Error ? error.message : "匹配表保存失败" }, { status: 400 });
  } finally { client.release(); }
}
