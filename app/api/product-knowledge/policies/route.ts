import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { pool } from "@/lib/db";
import { errorMessage, isProductCategory } from "@/lib/product-knowledge";

export const runtime = "nodejs";
const CHANNELS = new Set(["all", "jd", "douyin", "tmall"]);

function parsePolicyData(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 100));
}

async function productExists(id: string, category?: string) {
  const values: unknown[] = [id];
  const categorySql = category && isProductCategory(category) ? (values.push(category), ` and product_category = $${values.length}`) : "";
  const { rows } = await pool.query<{ id: string }>(`select id from public.product_knowledge_products where id = $1${categorySql}`, values);
  return Boolean(rows[0]);
}

export async function GET(request: Request) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;
  const params = new URL(request.url).searchParams;
  const values: unknown[] = [];
  const conditions: string[] = [];
  const productId = params.get("productId") || params.get("product_id");
  const category = params.get("category") || params.get("product_category");
  const channel = params.get("channel");
  const status = params.get("status");
  if (productId) { values.push(productId); conditions.push(`p.product_id = $${values.length}`); }
  if (category && isProductCategory(category)) { values.push(category); conditions.push(`k.product_category = $${values.length}`); }
  if (channel && CHANNELS.has(channel)) { values.push(channel); conditions.push(`p.channel = $${values.length}`); }
  if (status === "active" || status === "inactive") { values.push(status); conditions.push(`p.status = $${values.length}`); }
  const { rows } = await pool.query(
    `select p.id, p.product_id, k.product_category, k.canonical_model,
            k.product_series, p.policy_name, p.channel, p.policy_data,
            p.starts_at, p.ends_at, p.status, p.notes,
            p.created_by, p.updated_by, p.created_at, p.updated_at,
            (p.status = 'active'
             and (p.starts_at is null or p.starts_at <= now())
             and (p.ends_at is null or p.ends_at >= now())) as effective_now
       from public.product_knowledge_policies p
       join public.product_knowledge_products k on k.id = p.product_id
      ${conditions.length ? `where ${conditions.join(" and ")}` : ""}
      order by p.starts_at desc nulls last, p.updated_at desc
      limit 500`, values,
  );
  return NextResponse.json({ policies: rows }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "请求格式不正确" }, { status: 400 }); }
  const productId = String(body.productId ?? body.product_id ?? "").trim();
  const name = String(body.policyName ?? body.policy_name ?? body.name ?? "").trim();
  const channel = String(body.channel ?? "all").trim();
  if (!productId || !name) return NextResponse.json({ error: "产品和政策名称不能为空" }, { status: 400 });
  if (!CHANNELS.has(channel)) return NextResponse.json({ error: "无效渠道" }, { status: 400 });
  if (!(await productExists(productId))) return NextResponse.json({ error: "产品资料不存在" }, { status: 404 });
  const startsAt = body.startsAt ?? body.starts_at ?? null;
  const endsAt = body.endsAt ?? body.ends_at ?? null;
  try {
    const { rows } = await pool.query(
      `insert into public.product_knowledge_policies
        (product_id, policy_name, channel, policy_data, starts_at, ends_at, status, notes, created_by, updated_by)
       values ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $9)
       returning id, product_id, policy_name, channel, policy_data, starts_at,
                 ends_at, status, notes, created_by, updated_by, created_at, updated_at`,
      [productId, name, channel, JSON.stringify(parsePolicyData(body.policyData ?? body.policy_data)), startsAt || null, endsAt || null,
        body.status === "inactive" ? "inactive" : "active", body.notes ? String(body.notes).trim().slice(0, 500) : null, auth.user.id],
    );
    return NextResponse.json(rows[0], { status: 201 });
  } catch (error) { return NextResponse.json({ error: errorMessage(error) || "活动政策保存失败" }, { status: 400 }); }
}

