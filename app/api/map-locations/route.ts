import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;
  const body = (await request.json()) as {
    id?: string;
    type?: string;
    longitude?: number;
    latitude?: number;
    precision?: string;
  };
  if (
    !body.id ||
    !["达人", "团长"].includes(body.type || "") ||
    !Number.isFinite(body.longitude) ||
    !Number.isFinite(body.latitude)
  )
    return NextResponse.json({ error: "定位数据无效" }, { status: 400 });
  const table = body.type === "达人" ? "talents" : "leaders";
  const update: Record<string, unknown> = {
    longitude: body.longitude,
    latitude: body.latitude,
    updated_at: new Date().toISOString(),
  };
  if (table === "talents")
    update.location_precision = body.precision || "geocoded";
  const { error } = await auth.admin
    .from(table)
    .update(update)
    .eq("id", body.id);
  if (error)
    return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
