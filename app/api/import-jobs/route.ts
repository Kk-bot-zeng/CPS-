import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { isChannel } from "@/lib/channels";

export async function GET(request: Request) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;
  const channel = new URL(request.url).searchParams.get("channel") || "all";
  if (channel !== "all" && !isChannel(channel))
    return NextResponse.json({ error: "无效渠道" }, { status: 400 });
  let query = auth.admin
    .from("import_jobs")
    .select("id,channel,file_name,status,total_rows,created_at,completed_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (channel !== "all") query = query.eq("channel", channel);
  const { data, error } = await query;
  if (error)
    return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function DELETE(request: Request) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;
  const body = (await request.json()) as { ids?: unknown };
  const ids = Array.isArray(body.ids)
    ? [
        ...new Set(
          body.ids.filter((id): id is string => typeof id === "string"),
        ),
      ]
    : [];
  if (!ids.length || ids.length > 100)
    return NextResponse.json(
      { error: "请选择1至100个导入批次" },
      { status: 400 },
    );

  const { data, error } = await auth.admin.rpc("delete_import_jobs", {
    p_job_ids: ids,
  });
  if (error)
    return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
