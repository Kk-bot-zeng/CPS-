import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { isChannel } from "@/lib/channels";

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
  if (!isChannel(channel))
    return NextResponse.json({ error: "无效渠道" }, { status: 400 });
  const { data, error } = await auth.admin
    .from("product_mapping_uploads")
    .select("id,file_name,row_count,created_at")
    .eq("channel", channel)
    .eq("active", true)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data || null);
}

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;
  const body = (await request.json()) as {
    channel?: string;
    fileName?: string;
    rows?: MappingRow[];
  };
  if (!isChannel(body.channel))
    return NextResponse.json({ error: "请先选择有效渠道" }, { status: 400 });
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
  const { data, error } = await auth.admin.rpc("replace_product_mappings", {
    p_channel: body.channel,
    p_file_name: body.fileName || "商品匹配表.xlsx",
    p_rows: deduped,
    p_user_id: auth.user.id,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
