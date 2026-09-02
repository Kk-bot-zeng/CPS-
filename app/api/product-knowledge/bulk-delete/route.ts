import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { pool } from "@/lib/db";
import {
  createProductVersion,
  errorMessage,
  isProductCategory,
  type ProductCategory,
  type ProductRecord,
} from "@/lib/product-knowledge";

export const runtime = "nodejs";

const MAX_PRODUCT_IDS = 500;
// PostgreSQL accepts UUID v1-v8 (and the nil UUID).  The API only needs the
// canonical textual shape here; the database performs the final UUID cast.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

/**
 * Batch safe delete for product knowledge.
 *
 * Products are only deactivated.  Each product that changes state receives a
 * new immutable version snapshot, so this endpoint never removes product
 * history or policy/version references.
 */
async function handleBatchDelete(request: Request) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("请求体必须是对象");
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "请求格式不正确" }, { status: 400 });
  }

  const category = body.category ?? body.product_category;
  if (!isProductCategory(category)) {
    return NextResponse.json({ error: "请选择有效品类" }, { status: 400 });
  }

  const rawIds = body.ids ?? body.productIds;
  if (!Array.isArray(rawIds) || rawIds.length === 0) {
    return NextResponse.json({ error: "请至少选择一条产品资料" }, { status: 400 });
  }
  if (rawIds.length > MAX_PRODUCT_IDS) {
    return NextResponse.json({ error: `单次最多停用${MAX_PRODUCT_IDS}条产品资料` }, { status: 400 });
  }

  const invalidIds = rawIds.filter((value) => !isUuid(value));
  if (invalidIds.length) {
    return NextResponse.json({ error: "产品ID格式不正确", invalidIds: invalidIds.slice(0, 20) }, { status: 400 });
  }

  const ids = [...new Set(rawIds as string[])];
  const client = await pool.connect();
  try {
    await client.query("begin");
    // Lock all matching rows before changing state.  The category predicate
    // is part of the lock query as well as the update, so an ID from TV can
    // never be changed by a monitor request (and vice versa).
    const { rows: lockedRows } = await client.query<ProductRecord>(
      `select id, product_category, product_series, canonical_model,
              canonical_model_normalized, sku, promotion_name, status,
              custom_values, current_version_id, created_by, updated_by,
              created_at, updated_at
         from public.product_knowledge_products
        where id = any($1::uuid[])
          and product_category = $2
        for update`,
      [ids, category],
    );

    const deletedIds: string[] = [];
    const versions: Array<{ id: string; product_id: string; version_no: number }> = [];
    for (const locked of lockedRows) {
      if (locked.status !== "active") continue;
      const { rows } = await client.query<ProductRecord>(
        `update public.product_knowledge_products
            set status = 'inactive', updated_by = $1, updated_at = now()
          where id = $2 and product_category = $3 and status = 'active'
        returning id, product_category, product_series, canonical_model,
                  canonical_model_normalized, sku, promotion_name, status,
                  custom_values, current_version_id, created_by, updated_by,
                  created_at, updated_at`,
        [auth.user.id, locked.id, category],
      );
      const product = rows[0];
      if (!product) continue;
      deletedIds.push(product.id);
      const version = await createProductVersion(client, product, "manual", auth.user.id, "批量安全停用");
      const versionRecord = version as unknown as { id: string; product_id: string; version_no: number };
      versions.push({ id: versionRecord.id, product_id: versionRecord.product_id || product.id, version_no: versionRecord.version_no });
    }

    await client.query("commit");
    const deletedSet = new Set(deletedIds);
    const ignoredIds = ids.filter((id) => !deletedSet.has(id));
    return NextResponse.json({
      ok: true,
      category: category as ProductCategory,
      requested: ids.length,
      duplicateCount: rawIds.length - ids.length,
      deleted: deletedIds.length,
      ignored: ignoredIds.length,
      deletedIds,
      ignoredIds,
      versions: versions.map((version) => ({ id: version.id, productId: version.product_id, version: version.version_no })),
      message: deletedIds.length
        ? `已停用${deletedIds.length}条产品资料，历史版本已保留`
        : "所选产品资料均已停用或不属于当前品类",
    });
  } catch (error) {
    await client.query("rollback");
    return NextResponse.json({ error: errorMessage(error) || "批量停用失败，数据库未发生变更" }, { status: 400 });
  } finally {
    client.release();
  }
}

// DELETE is kept for the current workspace client.  POST is also supported
// for clients/proxies that do not allow JSON request bodies on DELETE.
export async function DELETE(request: Request) {
  return handleBatchDelete(request);
}

export async function POST(request: Request) {
  return handleBatchDelete(request);
}
