import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { pool } from "@/lib/db";
import {
  buildProductPayload,
  createProductVersion,
  errorMessage,
  fixedFieldMetadata,
  isProductCategory,
  normalizeModel,
  validateCustomValues,
  type ProductCategory,
  type ProductField,
  type ProductRecord,
} from "@/lib/product-knowledge";

export const runtime = "nodejs";

async function activeFields(category: ProductCategory) {
  const { rows } = await pool.query<ProductField>(
    `select id, product_category, field_key, field_label, field_type, options,
            required, active, sort_order, notes, created_at, updated_at
       from public.product_knowledge_fields
      where product_category = $1 and active = true
      order by sort_order asc, field_label asc`,
    [category],
  );
  return rows;
}

function parsePage(value: string | null, fallback: number, max: number) {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(1, parsed)) : fallback;
}

export async function GET(request: Request) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;

  const params = new URL(request.url).searchParams;
  const category = params.get("category") || params.get("product_category") || "tv";
  if (!isProductCategory(category)) return NextResponse.json({ error: "无效品类" }, { status: 400 });
  const q = (params.get("q") || "").trim();
  const status = params.get("status");
  const page = parsePage(params.get("page"), 1, 10_000);
  const pageSize = parsePage(params.get("pageSize"), 20, 200);
  const offset = (page - 1) * pageSize;
  const values: unknown[] = [category];
  const conditions = ["product_category = $1"];
  if (status === "active" || status === "inactive") {
    values.push(status);
    conditions.push(`status = $${values.length}`);
  }
  if (q) {
    values.push(`%${q}%`);
    conditions.push(`(canonical_model ilike $${values.length}
      or coalesce(product_series, '') ilike $${values.length}
      or coalesce(sku, '') ilike $${values.length}
      or coalesce(promotion_name, '') ilike $${values.length})`);
  }
  const where = conditions.join(" and ");
  const countResult = await pool.query<{ count: string }>(
    `select count(*)::text as count from public.product_knowledge_products where ${where}`,
    values,
  );
  const rowsResult = await pool.query<ProductRecord>(
    `select id, product_category, product_series, canonical_model,
            canonical_model_normalized, sku, promotion_name, status,
            custom_values, current_version_id, created_by, updated_by,
            created_at, updated_at
       from public.product_knowledge_products
      where ${where}
      order by updated_at desc, canonical_model asc
      limit $${values.length + 1} offset $${values.length + 2}`,
    [...values, pageSize, offset],
  );
  return NextResponse.json({
    products: rowsResult.rows,
    total: Number(countResult.rows[0]?.count || 0),
    page,
    pageSize,
    fields: await activeFields(category),
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;
  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "请求格式不正确" }, { status: 400 });
  }
  const category = body.category ?? body.product_category;
  if (!isProductCategory(category)) return NextResponse.json({ error: "请选择有效品类" }, { status: 400 });
  let payload: ReturnType<typeof buildProductPayload>;
  try {
    payload = buildProductPayload(body, category);
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 400 });
  }
  const fields = await activeFields(category);
  const fieldErrors = validateCustomValues(payload.custom_values, fields);
  if (fieldErrors.length) return NextResponse.json({ error: "自定义字段校验失败", errors: fieldErrors }, { status: 400 });

  const client = await pool.connect();
  try {
    await client.query("begin");
    const exists = await client.query<{ id: string }>(
      `select id from public.product_knowledge_products
        where product_category = $1 and canonical_model_normalized = $2
        for update`,
      [category, normalizeModel(payload.canonical_model)],
    );
    if (exists.rowCount) {
      await client.query("rollback");
      return NextResponse.json({ error: "该品类下的标准型号已存在，请使用编辑或导入覆盖", code: "PRODUCT_EXISTS" }, { status: 409 });
    }
    const { rows } = await client.query<ProductRecord>(
      `insert into public.product_knowledge_products
       (product_category, product_series, canonical_model, canonical_model_normalized,
        sku, promotion_name, status, custom_values, created_by, updated_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $9)
       returning id, product_category, product_series, canonical_model,
                 canonical_model_normalized, sku, promotion_name, status,
                 custom_values, current_version_id, created_by, updated_by,
                 created_at, updated_at`,
      [category, payload.product_series, payload.canonical_model, payload.canonical_model_normalized,
        payload.sku, payload.promotion_name, payload.status, JSON.stringify(payload.custom_values), auth.user.id],
    );
    const product = rows[0];
    const version = await createProductVersion(client, product, "manual", auth.user.id, "手动新增");
    const { rows: finalRows } = await client.query<ProductRecord>(
      `select id, product_category, product_series, canonical_model,
              canonical_model_normalized, sku, promotion_name, status,
              custom_values, current_version_id, created_by, updated_by,
              created_at, updated_at
         from public.product_knowledge_products where id = $1`,
      [product.id],
    );
    await client.query("commit");
    return NextResponse.json({ product: finalRows[0], version }, { status: 201 });
  } catch (error) {
    await client.query("rollback");
    const message = errorMessage(error);
    if (/duplicate key|unique constraint/i.test(message)) return NextResponse.json({ error: "该品类下的标准型号已存在", code: "PRODUCT_EXISTS" }, { status: 409 });
    return NextResponse.json({ error: message || "产品资料保存失败" }, { status: 400 });
  } finally {
    client.release();
  }
}
