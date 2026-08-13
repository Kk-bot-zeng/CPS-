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
  const category = body.product_category === "monitor" ? "monitor" : "tv";
  if (category === "monitor" && body.platform !== "jd")
    return NextResponse.json({ error: "显示器资源仅支持京东渠道" }, { status: 400 });
  if (!isChannel(body.platform))
    return NextResponse.json({ error: "请选择达人所属渠道" }, { status: 400 });
  if (body.leader_id) {
    const { data: leader } = await auth.admin
      .from("leaders")
      .select("platform,product_category")
      .eq("id", body.leader_id)
      .single();
    if (!leader || leader.platform !== body.platform || leader.product_category !== category)
      return NextResponse.json(
        { error: "达人和所属团长必须属于同一渠道" },
        { status: 409 },
      );
  }
  delete body.id;
  delete body.created_at;
  delete body.leaders;
  body.updated_at = new Date().toISOString();
  const { data, error } = await auth.admin
    .from("talents")
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
  const { error } = await auth.admin.from("talents").delete().eq("id", id);
  if (error)
    return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
