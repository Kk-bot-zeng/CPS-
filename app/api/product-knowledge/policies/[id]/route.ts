import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { pool } from "@/lib/db";
import { errorMessage } from "@/lib/product-knowledge";

export const runtime = "nodejs";
const CHANNELS = new Set(["all", "jd", "douyin", "tmall"]);

function policyData(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 100));
}

async function findPolicy(id: string) {
  const { rows } = await pool.query(`select p.id, p.product_id, k.product_category,
      k.canonical_model, k.product_series, p.policy_name, p.channel, p.policy_data,
      p.starts_at, p.ends_at, p.status, p.notes, p.created_by, p.updated_by,
      p.created_at, p.updated_at
    from public.product_knowledge_policies p
    join public.product_knowledge_products k on k.id = p.product_id
    where p.id = $1`, [id]);
  return rows[0] || null;
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;
  const policy = await findPolicy((await params).id);
  if (!policy) return NextResponse.json({ error: "活动政策不存在" }, { status: 404 });
  return NextResponse.json(policy);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;
  const { id } = await params;
  const current = await findPolicy(id);
  if (!current) return NextResponse.json({ error: "活动政策不存在" }, { status: 404 });
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "请求格式不正确" }, { status: 400 }); }
  const name = body.policyName === undefined && body.policy_name === undefined && body.name === undefined
    ? current.policy_name : String(body.policyName ?? body.policy_name ?? body.name).trim();
  const channel = body.channel === undefined ? current.channel : String(body.channel).trim();
  if (!name) return NextResponse.json({ error: "政策名称不能为空" }, { status: 400 });
  if (!CHANNELS.has(channel)) return NextResponse.json({ error: "无效渠道" }, { status: 400 });
  const startsAt = body.startsAt === undefined && body.starts_at === undefined ? current.starts_at : (body.startsAt ?? body.starts_at ?? null);
  const endsAt = body.endsAt === undefined && body.ends_at === undefined ? current.ends_at : (body.endsAt ?? body.ends_at ?? null);
  const status = body.status === undefined ? current.status : (body.status === "inactive" ? "inactive" : "active");
  try {
    const { rows } = await pool.query(
      `update public.product_knowledge_policies
          set policy_name = $1, channel = $2, policy_data = $3::jsonb,
              starts_at = $4, ends_at = $5, status = $6, notes = $7,
              updated_by = $8, updated_at = now()
        where id = $9
      returning id, product_id, policy_name, channel, policy_data, starts_at,
                ends_at, status, notes, created_by, updated_by, created_at, updated_at`,
      [name, channel, JSON.stringify(body.policyData === undefined && body.policy_data === undefined ? current.policy_data : policyData(body.policyData ?? body.policy_data)), startsAt || null, endsAt || null, status,
        body.notes === undefined ? current.notes : (body.notes ? String(body.notes).trim().slice(0, 500) : null), auth.user.id, id],
    );
    return NextResponse.json(rows[0]);
  } catch (error) { return NextResponse.json({ error: errorMessage(error) || "活动政策更新失败" }, { status: 400 }); }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;
  const { id } = await params;
  try {
    const { rows } = await pool.query(
      `update public.product_knowledge_policies
          set status = 'inactive', updated_by = $1, updated_at = now()
        where id = $2
      returning id, product_id, policy_name, channel, policy_data,
                starts_at, ends_at, status, notes, created_by, updated_by, created_at, updated_at`, [auth.user.id, id],
    );
    if (!rows[0]) return NextResponse.json({ error: "活动政策不存在" }, { status: 404 });
    return NextResponse.json({ ok: true, policy: rows[0], message: "活动政策已停用" });
  } catch (error) { return NextResponse.json({ error: errorMessage(error) || "活动政策停用失败" }, { status: 400 }); }
}

