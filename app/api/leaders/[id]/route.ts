import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { isChannel } from "@/lib/channels";
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;
  const { id } = await params;
  const body = await request.json();
  if (body.product_category === "monitor" && body.platform !== "jd")
    return NextResponse.json({ error: "显示器资源仅支持京东渠道" }, { status: 400 });
  if (!isChannel(body.platform))
    return NextResponse.json({ error: "请选择团长所属渠道" }, { status: 400 });
  const { data: linkedTalents } = await auth.admin
    .from("talents")
    .select("platform,product_category")
    .eq("leader_id", id);
  const category = body.product_category === "monitor" ? "monitor" : "tv";
  if ((linkedTalents || []).some((talent: { platform: string; product_category: string }) => talent.platform !== body.platform || talent.product_category !== category))
    return NextResponse.json(
      { error: "该团长名下存在其他渠道达人，请先调整达人归属" },
      { status: 409 },
    );
  delete body.id;
  delete body.created_at;
  body.updated_at = new Date().toISOString();
  const { data, error } = await auth.admin
    .from("leaders")
    .update(body)
    .eq("id", id)
    .select()
    .single();
  if (error)
    return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
export async function DELETE(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;
  const { id } = await params;
  const { error } = await auth.admin.from("leaders").delete().eq("id", id);
  if (error)
    return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
