import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { pool } from "@/lib/db";
import {
  cleanStatus,
  cleanText,
  createProductVersion,
  errorMessage,
  normalizeModel,
  type ProductRecord,
} from "@/lib/product-knowledge";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;
  const { id: versionId } = await params;
  let body: Record<string, unknown> = {};
  try { body = await request.json() as Record<string, unknown>; } catch { /* optional note */ }
  const client = await pool.connect();
  try {
    await client.query("begin");
    const { rows: versionRows } = await client.query<{
      id: string; product_id: string; snapshot: Record<string, unknown>; version_no: number;
    }>(`select id, product_id, snapshot, version_no from public.product_knowledge_versions where id = $1 for update`, [versionId]);
    const version = versionRows[0];
    if (!version) { await client.query("rollback"); return NextResponse.json({ error: "版本不存在" }, { status: 404 }); }
    const { rows: productRows } = await client.query<ProductRecord>(
      `select id, product_category, product_series, canonical_model,
              canonical_model_normalized, sku, promotion_name, status,
              custom_values, current_version_id, created_by, updated_by,
              created_at, updated_at
         from public.product_knowledge_products where id = $1 for update`, [version.product_id],
    );
    const current = productRows[0];
    if (!current) { await client.query("rollback"); return NextResponse.json({ error: "版本关联的产品不存在" }, { status: 404 }); }
    const snapshot = version.snapshot || {};
    const model = cleanText(snapshot.canonical_model ?? snapshot.canonicalModel, 160);
    if (!model) { await client.query("rollback"); return NextResponse.json({ error: "历史版本缺少有效标准型号，无法回滚" }, { status: 409 }); }
    const next = {
      product_series: cleanText(snapshot.product_series ?? snapshot.productSeries, 160),
      canonical_model: model,
      canonical_model_normalized: normalizeModel(model),
      sku: cleanText(snapshot.sku, 160),
      promotion_name: cleanText(snapshot.promotion_name ?? snapshot.promotionName, 240),
      status: cleanStatus(snapshot.status),
      custom_values: snapshot.custom_values && typeof snapshot.custom_values === "object" && !Array.isArray(snapshot.custom_values)
        ? snapshot.custom_values : (snapshot.customValues && typeof snapshot.customValues === "object" && !Array.isArray(snapshot.customValues) ? snapshot.customValues : {}),
    };
    const { rows } = await client.query<ProductRecord>(
      `update public.product_knowledge_products
          set product_series = $1, canonical_model = $2,
              canonical_model_normalized = $3, sku = $4, promotion_name = $5,
              status = $6, custom_values = $7::jsonb, updated_by = $8, updated_at = now()
        where id = $9
      returning id, product_category, product_series, canonical_model,
                canonical_model_normalized, sku, promotion_name, status,
                custom_values, current_version_id, created_by, updated_by,
                created_at, updated_at`,
      [next.product_series, next.canonical_model, next.canonical_model_normalized,
        next.sku, next.promotion_name, next.status, JSON.stringify(next.custom_values), auth.user.id, current.id],
    );
    const newVersion = await createProductVersion(client, rows[0], "rollback", auth.user.id,
      cleanText(body.note, 500) || `回滚到版本${version.version_no}`, versionId);
    const { rows: finalRows } = await client.query<ProductRecord>(
      `select id, product_category, product_series, canonical_model,
              canonical_model_normalized, sku, promotion_name, status,
              custom_values, current_version_id, created_by, updated_by,
              created_at, updated_at
         from public.product_knowledge_products where id = $1`, [current.id]);
    await client.query("commit");
    return NextResponse.json({ ok: true, product: finalRows[0], version: newVersion, rolledBackFrom: versionId });
  } catch (error) {
    await client.query("rollback");
    return NextResponse.json({ error: errorMessage(error) || "版本回滚失败，数据库未发生变更" }, { status: 400 });
  } finally { client.release(); }
}

