import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { isChannel } from "@/lib/channels";
export async function GET(request: Request) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;
  const params = new URL(request.url).searchParams;
  const q = params.get("q") || "";
  const channel = params.get("channel") || "all";
  if (channel !== "all" && !isChannel(channel))
    return NextResponse.json({ error: "无效渠道" }, { status: 400 });
  let query = auth.admin
    .from("leaders")
    .select("*")
    .order("created_at", { ascending: false });
  if (q) query = query.ilike("name", `%${q}%`);
  if (channel !== "all") query = query.eq("platform", channel);
  const { data, error } = await query;
  if (error)
    return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;
  const body = await request.json();
  if (!body.name)
    return NextResponse.json({ error: "团长名称不能为空" }, { status: 400 });
  if (!isChannel(body.platform))
    return NextResponse.json({ error: "请选择团长所属渠道" }, { status: 400 });
  const { data, error } = await auth.admin
    .from("leaders")
    .insert(clean(body))
    .select()
    .single();
  if (error)
    return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data, { status: 201 });
}
function clean(b: Record<string, unknown>) {
  return {
    name: b.name,
    contact_name: b.contact_name || null,
    phone: b.phone || null,
    wechat: b.wechat || null,
    platform: b.platform || null,
    province: b.province || null,
    city: b.city || null,
    district: b.district || null,
    address: b.address || null,
    longitude: b.longitude || null,
    latitude: b.latitude || null,
    cooperation_status: b.cooperation_status || "合作中",
    tags: b.tags || [],
    notes: b.notes || null,
    updated_at: new Date().toISOString(),
  };
}
