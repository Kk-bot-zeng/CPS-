import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { isChannel } from "@/lib/channels";

type Row = {
  type?: string;
  name?: string;
  channel?: string;
  account?: string;
  matchId?: string;
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

const EMPTY_MARKERS = new Set([
  "-",
  "—",
  "–",
  "无",
  "暂无",
  "未填写",
  "n/a",
  "na",
  "请填写京东推客pin/联盟id",
]);

function cleanText(value: unknown) {
  return String(value ?? "")
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    .trim();
}

function optionalText(value: unknown) {
  const text = cleanText(value);
  return EMPTY_MARKERS.has(text.toLowerCase()) ? "" : text;
}

function normalizeChannel(value: unknown) {
  const text = optionalText(value);
  const key = text.toLowerCase().replace(/\s+/g, "");
  const aliases: Record<string, string> = {
    jd: "jd",
    京东: "jd",
    京东渠道: "jd",
    douyin: "douyin",
    dy: "douyin",
    抖音: "douyin",
    抖音渠道: "douyin",
    tmall: "tmall",
    天猫: "tmall",
    天猫渠道: "tmall",
  };
  return aliases[key] || text;
}

function normalizeRows(rows: Row[]) {
  return rows.map((source) => {
    const row = source && typeof source === "object" ? source : {};
    return {
      ...row,
      type: cleanText(row.type).replace(/\s+/g, ""),
      name: cleanText(row.name),
      channel: normalizeChannel(row.channel),
      account: optionalText(row.account),
      matchId: optionalText(row.matchId),
      leader: optionalText(row.leader),
      contact: optionalText(row.contact),
      phone: optionalText(row.phone),
      wechat: optionalText(row.wechat),
      province: optionalText(row.province),
      city: optionalText(row.city),
      district: optionalText(row.district),
      address: optionalText(row.address),
      status: optionalText(row.status),
      notes: optionalText(row.notes),
    } satisfies Row;
  });
}

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;
  const body = (await request.json()) as {
    rows?: Row[];
    product_category?: string;
    selected_channel?: string;
  };
  const category = body.product_category === "monitor" ? "monitor" : "tv";
  const requestedChannel = typeof body.selected_channel === "string"
    ? body.selected_channel.trim().toLowerCase()
    : "all";
  if (requestedChannel !== "all" && !isChannel(requestedChannel))
    return NextResponse.json(
      { error: "文件校验失败", errors: [`【渠道】：无效的当前选择渠道“${requestedChannel}”`] },
      { status: 400 },
    );
  if (category === "monitor" && requestedChannel !== "all" && requestedChannel !== "jd")
    return NextResponse.json(
      { error: "文件校验失败", errors: ["【渠道】：显示器资源仅支持京东渠道"] },
      { status: 400 },
    );
  const rows = Array.isArray(body.rows)
    ? normalizeRows(body.rows).map((row) => ({
      ...row,
      // A selected channel is authoritative. This prevents one incorrectly
      // labeled row (for example, “B站”) from breaking a 抖音 import.
      channel: category === "monitor"
        ? "jd"
        : requestedChannel !== "all"
          ? requestedChannel
          : row.channel,
    }))
    : body.rows;
  if (!Array.isArray(rows) || !rows.length || rows.length > 1000)
    return NextResponse.json(
      { error: "每次请导入1至1000条数据" },
      { status: 400 },
    );
  const errors: string[] = [];
  rows.forEach((r, i) => {
    if (!["达人", "团长"].includes(r.type || ""))
      errors.push(`第${i + 2}行【身份】：必须是达人或团长（当前：${r.type || "空"}）`);
    if (!r.name?.trim()) errors.push(`第${i + 2}行【名称】：不能为空`);
    if (!isChannel(r.channel))
      errors.push(`第${i + 2}行【渠道】：必须是京东、抖音或天猫（当前：${r.channel || "空"}）`);
    if (category === "monitor" && r.channel !== "jd")
      errors.push(`第${i + 2}行【渠道】：显示器资源仅支持京东渠道`);
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
      .select("name,platform,product_category")
      .eq("product_category", category);
    const keys = new Set(
      (existing || []).map((x: { platform: string; name: string }) => `${x.platform}:${x.name}`),
    );
    const payload = leaders
      .filter((r, index, list) => {
        const key = `${r.channel}:${r.name!.trim()}`;
        if (keys.has(key)) return false;
        keys.add(key);
        return list.findIndex((candidate) => `${candidate.channel}:${candidate.name!.trim()}` === key) === index;
      })
      .map((r) => ({
        name: r.name!.trim(),
        product_category: category,
        contact_name: r.contact || null,
        phone: r.phone || null,
        wechat: r.wechat || null,
        platform: r.channel,
        match_id: r.matchId || null,
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
        return NextResponse.json({ error: "团长导入失败", errors: [error.message] }, { status: 400 });
    }
  }
  const { data: leaderRows, error: leaderError } = await auth.admin
    .from("leaders")
    .select("id,name,platform")
    .eq("product_category", category);
  if (leaderError)
    return NextResponse.json({ error: "读取团长档案失败", errors: [leaderError.message] }, { status: 400 });
  const leaderMap = new Map(
    (leaderRows || []).map((l: { platform: string; name: string; id: string }) => [`${l.platform}:${l.name}`, l.id]),
  );
  if (talents.length) {
    const unresolved = talents
      .map((r, index) => ({ row: r, rowNumber: index + 2 }))
      .filter(({ row }) => row.leader && !leaderMap.has(`${row.channel}:${row.leader}`));
    if (unresolved.length)
      return NextResponse.json(
        {
          error: "团长匹配失败",
          errors: unresolved.slice(0, 50).map(({ row, rowNumber }) =>
            `第${rowNumber}行【所属团长】：找不到同渠道团长“${row.leader}”`),
        },
        { status: 400 },
      );
    const { data: existingTalents, error: talentReadError } = await auth.admin
      .from("talents")
      .select("name,platform,platform_account")
      .eq("product_category", category);
    if (talentReadError)
      return NextResponse.json({ error: "读取达人档案失败", errors: [talentReadError.message] }, { status: 400 });
    const talentKeys = new Set(
      (existingTalents || []).map((talent: { name: string; platform: string; platform_account: string | null }) =>
        `${talent.platform}:${talent.platform_account || talent.name}`),
    );
    const payload = talents
      .filter((r) => {
        const key = `${r.channel}:${r.account || r.name!.trim()}`;
        if (talentKeys.has(key)) return false;
        talentKeys.add(key);
        return true;
      })
      .map((r) => ({
        name: r.name!.trim(),
        product_category: category,
        platform: r.channel,
        platform_account: r.account || null,
        match_id: r.matchId || null,
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
    if (!payload.length)
      return NextResponse.json({ ok: true, leaders: leaders.length, talents: 0, total: rows.length, skipped: talents.length }, { status: 200 });
    const { error } = await auth.admin
      .from("talents")
      .insert(payload);
    if (error)
      return NextResponse.json({ error: "达人导入失败", errors: [error.message] }, { status: 400 });
  }
  return NextResponse.json({
    ok: true,
    leaders: leaders.length,
    talents: talents.length,
    total: rows.length,
  });
}
