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
    .from("talents")
    .select("*,leaders(name)")
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
    return NextResponse.json({ error: "达人昵称不能为空" }, { status: 400 });
  if (!isChannel(body.platform))
    return NextResponse.json({ error: "请选择达人所属渠道" }, { status: 400 });
  if (body.leader_id) {
    const { data: leader } = await auth.admin
      .from("leaders")
      .select("platform")
      .eq("id", body.leader_id)
      .single();
    if (!leader || leader.platform !== body.platform)
      return NextResponse.json(
        { error: "达人和所属团长必须属于同一渠道" },
        { status: 409 },
      );
  }
  const { data, error } = await auth.admin
    .from("talents")
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
    platform: b.platform || null,
    platform_account: b.platform_account || null,
    phone: b.phone || null,
    wechat: b.wechat || null,
    leader_id: b.leader_id || null,
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
