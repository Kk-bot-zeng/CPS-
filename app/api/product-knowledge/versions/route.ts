import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { pool } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;
  const params = new URL(request.url).searchParams;
  const productId = params.get("productId") || params.get("product_id");
  if (!productId) return NextResponse.json({ error: "缺少产品ID" }, { status: 400 });
  const { rows: productRows } = await pool.query<{ id: string }>(`select id from public.product_knowledge_products where id = $1`, [productId]);
  if (!productRows[0]) return NextResponse.json({ error: "产品资料不存在" }, { status: 404 });
  const { rows } = await pool.query(
    `select v.id, v.product_id, v.version_no, v.source, v.snapshot, v.note,
            v.rollback_from_version_id, v.created_by, v.created_at,
            (p.current_version_id = v.id) as is_current
       from public.product_knowledge_versions v
       join public.product_knowledge_products p on p.id = v.product_id
      where v.product_id = $1 order by v.version_no desc limit 200`, [productId],
  );
  return NextResponse.json({ productId, versions: rows }, { headers: { "Cache-Control": "no-store" } });
}
