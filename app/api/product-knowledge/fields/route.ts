import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { pool } from "@/lib/db";
import {
  errorMessage,
  fixedFieldMetadata,
  isProductCategory,
  isValidFieldKey,
  keyFromLabel,
  type ProductCategory,
  type ProductField,
  type ProductFieldType,
} from "@/lib/product-knowledge";

export const runtime = "nodejs";
const FIELD_TYPES = new Set<ProductFieldType>(["text", "textarea", "number", "date", "select", "multiselect"]);

function parseOptions(value: unknown): unknown[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 100).map((item) => {
    if (item && typeof item === "object" && !Array.isArray(item)) {
      const record = item as Record<string, unknown>;
      return { value: String(record.value ?? record.label ?? "").trim().slice(0, 160), label: String(record.label ?? record.value ?? "").trim().slice(0, 160) };
    }
    return String(item ?? "").trim().slice(0, 160);
  }).filter((item) => typeof item === "string" ? item : Boolean(item.value));
}

async function fields(category: ProductCategory, includeInactive: boolean) {
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

export async function GET(request: Request) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;
  const params = new URL(request.url).searchParams;
  const category = params.get("category") || params.get("product_category") || "tv";
  if (!isProductCategory(category)) return NextResponse.json({ error: "无效品类" }, { status: 400 });
  const includeInactive = params.get("includeInactive") === "true" || params.get("include_inactive") === "true";
  return NextResponse.json({ category, fixedFields: fixedFieldMetadata(category), fields: await fields(category, includeInactive) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "请求格式不正确" }, { status: 400 }); }
  const category = body.category ?? body.product_category;
  if (!isProductCategory(category)) return NextResponse.json({ error: "请选择有效品类" }, { status: 400 });
  const label = String(body.field_label ?? body.fieldLabel ?? body.label ?? "").trim();
  if (!label || label.length > 80) return NextResponse.json({ error: "字段名称不能为空且不能超过80个字符" }, { status: 400 });
  const keyCandidate = body.field_key ?? body.fieldKey ?? body.key;
  const fieldKey = keyCandidate === undefined ? keyFromLabel(label) : String(keyCandidate).trim().toLowerCase();
  if (!isValidFieldKey(fieldKey)) return NextResponse.json({ error: "字段Key必须是2至64位小写字母、数字或下划线，且以字母开头" }, { status: 400 });
  const fieldType = String(body.field_type ?? body.fieldType ?? "text") as ProductFieldType;
  if (!FIELD_TYPES.has(fieldType)) return NextResponse.json({ error: "不支持的字段类型" }, { status: 400 });
  const options = parseOptions(body.options);
  if ((fieldType === "select" || fieldType === "multiselect") && !options.length) return NextResponse.json({ error: "单选或多选字段必须配置选项" }, { status: 400 });
  const required = body.required === true;
  const sortOrder = Math.max(0, Math.min(100_000, Number(body.sort_order ?? body.sortOrder ?? 0) || 0));
  const notes = body.notes ? String(body.notes).trim().slice(0, 500) : null;
  try {
    const { rows } = await pool.query<ProductField>(
      `insert into public.product_knowledge_fields
        (product_category, field_key, field_label, field_type, options, required, active, sort_order, notes, created_by)
       values ($1, $2, $3, $4, $5::jsonb, $6, true, $7, $8, $9)
       returning id, product_category, field_key, field_label, field_type, options,
                 required, active, sort_order, notes, created_at, updated_at`,
      [category, fieldKey, label, fieldType, JSON.stringify(options), required, sortOrder, notes, auth.user.id],
    );
    return NextResponse.json(rows[0], { status: 201 });
  } catch (error) {
    const message = errorMessage(error);
    if (/duplicate key|unique constraint/i.test(message)) return NextResponse.json({ error: "该品类下的字段Key已存在", code: "FIELD_EXISTS" }, { status: 409 });
    return NextResponse.json({ error: message || "字段保存失败" }, { status: 400 });
  }
}

