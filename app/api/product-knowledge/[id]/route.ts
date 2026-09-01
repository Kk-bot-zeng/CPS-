import { NextResponse } from "next/server";
import type { Pool, PoolClient } from "pg";
import { requireApiUser } from "@/lib/api-auth";
import { pool } from "@/lib/db";
import {
  buildProductPayload,
  cleanStatus,
  cleanText,
  createProductVersion,
  customValuesFromInput,
  errorMessage,
  isBlank,
  isProductCategory,
  mergeCustomValues,
  normalizeModel,
  productSnapshot,
  validateCustomValues,
  type ProductCategory,
  type ProductField,
  type ProductRecord,
} from "@/lib/product-knowledge";

export const runtime = "nodejs";

async function findProduct(id: string, client: Pool | PoolClient = pool) {
  const { rows } = await client.query<ProductRecord>(
    `select id, product_category, product_series, canonical_model,
            canonical_model_normalized, sku, promotion_name, status,
            custom_values, current_version_id, created_by, updated_by,
            created_at, updated_at
       from public.product_knowledge_products where id = $1`,
    [id],
  );
  return rows[0] || null;
}

async function fieldsFor(category: ProductCategory, includeInactive = false) {
  const { rows } = await pool.query<ProductField>(
    `select id, product_category, field_key, field_label, field_type, options,
            required, active, sort_order, notes, created_at, updated_at
       from public.product_knowledge_fields
      where product_category = $1 ${includeInactive ? "" : "and active = true"}
      order by sort_order asc, field_label asc`,
    [category],
  );
  return rows;
}

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;
  const { id } = await params;
  const product = await findProduct(id);
  if (!product) return NextResponse.json({ error: "产品资料不存在" }, { status: 404 });
  const [versionsResult, policiesResult, fields] = await Promise.all([
    pool.query(`select id, product_id, version_no, source, snapshot, note,
                       rollback_from_version_id, created_by, created_at
                  from public.product_knowledge_versions
                 where product_id = $1 order by version_no desc`, [id]),
    pool.query(`select id, product_id, policy_name, channel, policy_data,
                       starts_at, ends_at, status, notes, created_by, updated_by,
                       created_at, updated_at
                  from public.product_knowledge_policies
                 where product_id = $1 order by starts_at desc nulls last, updated_at desc`, [id]),
    fieldsFor(product.product_category, true),
  ]);
  return NextResponse.json({ product, fields, versions: versionsResult.rows, policies: policiesResult.rows }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;
  const { id } = await params;
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "请求格式不正确" }, { status: 400 }); }

  const client = await pool.connect();
  try {
    await client.query("begin");
    const current = await findProduct(id, client);
    if (!current) { await client.query("rollback"); return NextResponse.json({ error: "产品资料不存在" }, { status: 404 }); }
    const requestedCategory = body.category ?? body.product_category;
    if (requestedCategory !== undefined && requestedCategory !== current.product_category) {
      await client.query("rollback");
      return NextResponse.json({ error: "产品品类不可直接修改，请在目标品类下新建资料" }, { status: 400 });
    }
    const fields = await fieldsFor(current.product_category);
    const hasCustom = body.custom_values !== undefined || body.customValues !== undefined;
    const incomingCustom = customValuesFromInput(body.custom_values ?? body.customValues);
    const customErrors = hasCustom ? validateCustomValues(incomingCustom, fields) : [];
    if (customErrors.length) { await client.query("rollback"); return NextResponse.json({ error: "自定义字段校验失败", errors: customErrors }, { status: 400 }); }

    const canonicalModel = body.canonical_model !== undefined || body.canonicalModel !== undefined || body.model !== undefined
      ? cleanText(body.canonical_model ?? body.canonicalModel ?? body.model, 160)
      : current.canonical_model;
    if (!canonicalModel) { await client.query("rollback"); return NextResponse.json({ error: "标准型号不能为空" }, { status: 400 }); }
    const next = {
      product_series: body.product_series !== undefined || body.productSeries !== undefined || body.series !== undefined
        ? cleanText(body.product_series ?? body.productSeries ?? body.series, 160) : current.product_series,
      canonical_model: canonicalModel,
      canonical_model_normalized: normalizeModel(canonicalModel),
      sku: body.sku !== undefined ? cleanText(body.sku, 160) : current.sku,
      promotion_name: body.promotion_name !== undefined || body.promotionName !== undefined
        ? cleanText(body.promotion_name ?? body.promotionName, 240) : current.promotion_name,
      status: body.status !== undefined ? cleanStatus(body.status) : current.status,
      custom_values: hasCustom
        ? mergeCustomValues(current.custom_values || {}, incomingCustom, body.replaceCustomValues === true ? "overwrite" : "merge")
        : current.custom_values || {},
    };
    const duplicate = await client.query<{ id: string }>(
      `select id from public.product_knowledge_products
        where product_category = $1 and canonical_model_normalized = $2 and id <> $3
        for update`,
      [current.product_category, next.canonical_model_normalized, id],
    );
    if (duplicate.rowCount) { await client.query("rollback"); return NextResponse.json({ error: "该品类下的标准型号已存在", code: "PRODUCT_EXISTS" }, { status: 409 }); }
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
      [next.product_series, next.canonical_model, next.canonical_model_normalized, next.sku,
        next.promotion_name, next.status, JSON.stringify(next.custom_values), auth.user.id, id],
    );
    const version = await createProductVersion(client, rows[0], "manual", auth.user.id, cleanText(body.note, 500) || "手动编辑");
    const product = await findProduct(id, client);
    await client.query("commit");
    return NextResponse.json({ product, version });
  } catch (error) {
    await client.query("rollback");
    const message = errorMessage(error);
    if (/duplicate key|unique constraint/i.test(message)) return NextResponse.json({ error: "该品类下的标准型号已存在", code: "PRODUCT_EXISTS" }, { status: 409 });
    return NextResponse.json({ error: message || "产品资料更新失败" }, { status: 400 });
  } finally { client.release(); }
}

/** Safe delete: deactivate and retain all versions and custom facts. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;
  const { id } = await params;
  const client = await pool.connect();
  try {
    await client.query("begin");
    const current = await findProduct(id, client);
    if (!current) { await client.query("rollback"); return NextResponse.json({ error: "产品资料不存在" }, { status: 404 }); }
    const { rows } = await client.query<ProductRecord>(
      `update public.product_knowledge_products
          set status = 'inactive', updated_by = $1, updated_at = now()
        where id = $2
      returning id, product_category, product_series, canonical_model,
                canonical_model_normalized, sku, promotion_name, status,
                custom_values, current_version_id, created_by, updated_by,
                created_at, updated_at`,
      [auth.user.id, id],
    );
    const body = await request.text().catch(() => "");
    let note = "安全停用";
    if (body) { try { const parsed = JSON.parse(body) as { note?: unknown }; note = cleanText(parsed.note, 500) || note; } catch { /* optional body */ } }
    const version = await createProductVersion(client, rows[0], "manual", auth.user.id, note);
    const product = await findProduct(id, client);
    await client.query("commit");
    return NextResponse.json({ ok: true, product, version, message: "产品资料已停用，历史版本仍保留" });
  } catch (error) {
    await client.query("rollback");
    return NextResponse.json({ error: errorMessage(error) || "产品资料停用失败" }, { status: 400 });
  } finally { client.release(); }
}
