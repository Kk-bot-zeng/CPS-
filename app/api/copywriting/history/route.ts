import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { pool } from "@/lib/db";

export const runtime = "nodejs";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;
  const params = new URL(request.url).searchParams;
  const values: unknown[] = [auth.user.id];
  const conditions = ["g.created_by = $1"];
  const category = params.get("category") || params.get("product_category");
  const channel = params.get("channel");
  const productId = params.get("productId") || params.get("product_id");
  if (category === "tv" || category === "monitor") { values.push(category); conditions.push(`g.product_category = $${values.length}`); }
  if (["all", "jd", "douyin", "tmall"].includes(channel || "")) { values.push(channel); conditions.push(`g.channel = $${values.length}`); }
  if (productId && UUID_RE.test(productId)) { values.push(productId); conditions.push(`$${values.length}::uuid = any(g.product_ids)`); }
  const parsedPage = Number.parseInt(params.get("page") || "1", 10);
  const parsedSize = Number.parseInt(params.get("pageSize") || "20", 10);
  const page = Number.isFinite(parsedPage) ? Math.max(1, Math.min(10_000, parsedPage)) : 1;
  const pageSize = Number.isFinite(parsedSize) ? Math.max(1, Math.min(100, parsedSize)) : 20;
  const countResult = await pool.query<{ count: string }>(`select count(*)::text as count from public.copywriting_generations g where ${conditions.join(" and ")}`, values);
  const { rows } = await pool.query(
    `select g.id, g.product_category, g.channel, g.product_ids, g.product_version_ids,
            g.request_config, g.result_text as content, g.created_at as "createdAt",
            g.request_config->>'length' as length,
            g.request_config->>'scene' as scene,
            coalesce((select array_agg(p.canonical_model order by p.canonical_model)
            from public.product_knowledge_products p where p.id = any(g.product_ids)), '{}'::text[]) as products,
            coalesce((select jsonb_agg(jsonb_build_object(
              'id', p.id, 'canonicalModel', p.canonical_model,
              'series', p.product_series, 'currentVersionId', p.current_version_id
            ) order by p.canonical_model)
            from public.product_knowledge_products p where p.id = any(g.product_ids)), '[]'::jsonb) as productDetails
       from public.copywriting_generations g
      where ${conditions.join(" and ")}
      order by g.created_at desc
      limit $${values.length + 1} offset $${values.length + 2}`,
    [...values, pageSize, (page - 1) * pageSize],
  );
  const total = Number(countResult.rows[0]?.count || 0);
  return NextResponse.json({ history: rows, generations: rows, total, page, pageSize }, { headers: { "Cache-Control": "no-store" } });
}
