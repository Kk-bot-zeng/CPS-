import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { isChannel } from "@/lib/channels";

type Row = {
  type?: string;
  name?: string;
  channel?: string;
  account?: string;
  leader?: string;
  contact?: string;
  phone?: string;
  wechat?: string;
  province?: string;
  city?: string;
  district?: string;
  address?: string;
  status?: string;
  notes?: string;
};

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;
  const { rows } = (await request.json()) as { rows?: Row[] };
  if (!Array.isArray(rows) || !rows.length || rows.length > 1000)
    return NextResponse.json(
      { error: "每次请导入1至1000条数据" },
      { status: 400 },
    );
  const errors: string[] = [];
  rows.forEach((r, i) => {
    if (!["达人", "团长"].includes(r.type || ""))
      errors.push(`第${i + 2}行：身份必须是达人或团长`);
    if (!r.name?.trim()) errors.push(`第${i + 2}行：名称不能为空`);
    if (!isChannel(r.channel))
      errors.push(`第${i + 2}行：渠道必须是京东、抖音或天猫`);
  });
  if (errors.length)
    return NextResponse.json(
      { error: "文件校验失败", errors: errors.slice(0, 50) },
      { status: 400 },
    );
  const leaders = rows.filter((r) => r.type === "团长");
  const talents = rows.filter((r) => r.type === "达人");
  if (leaders.length) {
    const { data: existing } = await auth.admin
      .from("leaders")
      .select("name,platform");
    const keys = new Set(
      (existing || []).map((x) => `${x.platform}:${x.name}`),
    );
    const payload = leaders
      .filter((r) => !keys.has(`${r.channel}:${r.name!.trim()}`))
      .map((r) => ({
        name: r.name!.trim(),
        contact_name: r.contact || null,
        phone: r.phone || null,
        wechat: r.wechat || null,
        platform: r.channel,
        province: r.province || null,
        city: r.city || null,
        district: r.district || null,
        address: r.address || null,
        cooperation_status: r.status || "合作中",
        notes: r.notes || null,
        updated_at: new Date().toISOString(),
      }));
    if (payload.length) {
      const { error } = await auth.admin.from("leaders").insert(payload);
      if (error)
        return NextResponse.json({ error: error.message }, { status: 400 });
    }
  }
  const { data: leaderRows, error: leaderError } = await auth.admin
    .from("leaders")
    .select("id,name,platform");
  if (leaderError)
    return NextResponse.json({ error: leaderError.message }, { status: 400 });
  const leaderMap = new Map(
    (leaderRows || []).map((l) => [`${l.platform}:${l.name}`, l.id]),
  );
  if (talents.length) {
    const unresolved = talents.filter(
      (r) => r.leader && !leaderMap.has(`${r.channel}:${r.leader}`),
    );
    if (unresolved.length)
      return NextResponse.json(
        {
          error: `找不到同渠道团长：${unresolved
            .slice(0, 5)
            .map((r) => r.leader)
            .join("、")}`,
        },
        { status: 400 },
      );
    const payload = talents.map((r) => ({
      name: r.name!.trim(),
      platform: r.channel,
      platform_account: r.account || null,
      leader_id: r.leader ? leaderMap.get(`${r.channel}:${r.leader}`) : null,
      phone: r.phone || null,
      wechat: r.wechat || null,
      province: r.province || null,
      city: r.city || null,
      district: r.district || null,
      address: r.address || null,
      cooperation_status: r.status || "合作中",
      notes: r.notes || null,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await auth.admin
      .from("talents")
      .upsert(payload, { onConflict: "platform,platform_account" });
    if (error)
      return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({
    ok: true,
    leaders: leaders.length,
    talents: talents.length,
    total: rows.length,
  });
}
