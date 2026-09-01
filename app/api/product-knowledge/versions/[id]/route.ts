import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { pool } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;
  const { rows } = await pool.query(
    `select v.id, v.product_id, v.version_no, v.source, v.snapshot, v.note,
            v.rollback_from_version_id, v.created_by, v.created_at,
            (p.current_version_id = v.id) as is_current,
            p.product_category, p.canonical_model
       from public.product_knowledge_versions v
       join public.product_knowledge_products p on p.id = v.product_id
      where v.id = $1`, [(await params).id],
  );
  if (!rows[0]) return NextResponse.json({ error: "版本不存在" }, { status: 404 });
  return NextResponse.json(rows[0], { headers: { "Cache-Control": "no-store" } });
}

