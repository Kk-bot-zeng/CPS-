import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { pool } from "@/lib/db";
import { errorMessage, isProductCategory, type ProductField, type ProductFieldType } from "@/lib/product-knowledge";

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

async function findField(id: string) {
  const { rows } = await pool.query<ProductField>(
    `select id, product_category, field_key, field_label, field_type, options,
            required, active, sort_order, notes, created_at, updated_at
       from public.product_knowledge_fields where id = $1`, [id],
  );
  return rows[0] || null;
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;
  const field = await findField((await params).id);
  if (!field) return NextResponse.json({ error: "字段不存在" }, { status: 404 });
  return NextResponse.json(field);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;
  const { id } = await params;
  const field = await findField(id);
  if (!field) return NextResponse.json({ error: "字段不存在" }, { status: 404 });
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "请求格式不正确" }, { status: 400 }); }
  const label = body.field_label ?? body.fieldLabel ?? body.label;
  if (label !== undefined && (!String(label).trim() || String(label).trim().length > 80)) return NextResponse.json({ error: "字段名称不能为空且不能超过80个字符" }, { status: 400 });
  const fieldType = body.field_type ?? body.fieldType;
  if (fieldType !== undefined && !FIELD_TYPES.has(String(fieldType) as ProductFieldType)) return NextResponse.json({ error: "不支持的字段类型" }, { status: 400 });
  const options = body.options === undefined ? field.options : parseOptions(body.options);
  const nextType = String(fieldType ?? field.field_type) as ProductFieldType;
  if ((nextType === "select" || nextType === "multiselect") && !options.length) return NextResponse.json({ error: "单选或多选字段必须配置选项" }, { status: 400 });
  const active = body.active === undefined ? field.active : body.active !== false;
  const sortOrder = body.sort_order === undefined && body.sortOrder === undefined
    ? field.sort_order : Math.max(0, Math.min(100_000, Number(body.sort_order ?? body.sortOrder) || 0));
  const notes = body.notes === undefined ? field.notes : (body.notes ? String(body.notes).trim().slice(0, 500) : null);
  try {
    const { rows } = await pool.query<ProductField>(
      `update public.product_knowledge_fields
          set field_label = $1, field_type = $2, options = $3::jsonb,
              required = $4, active = $5, sort_order = $6, notes = $7, updated_at = now()
        where id = $8
      returning id, product_category, field_key, field_label, field_type, options,
                required, active, sort_order, notes, created_at, updated_at`,
      [label === undefined ? field.field_label : String(label).trim(), nextType, JSON.stringify(options),
        body.required === undefined ? field.required : body.required === true, active, sortOrder, notes, id],
    );
    return NextResponse.json(rows[0]);
  } catch (error) { return NextResponse.json({ error: errorMessage(error) || "字段更新失败" }, { status: 400 }); }
}

/** A field is never physically deleted: its values remain in version snapshots. */
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;
  const { id } = await params;
  try {
    const { rows } = await pool.query<ProductField>(
      `update public.product_knowledge_fields
          set active = false, updated_at = now()
        where id = $1
      returning id, product_category, field_key, field_label, field_type, options,
                required, active, sort_order, notes, created_at, updated_at`, [id],
    );
    if (!rows[0]) return NextResponse.json({ error: "字段不存在" }, { status: 404 });
    return NextResponse.json({ ok: true, field: rows[0], message: "字段已停用，历史产品资料仍保留" });
  } catch (error) { return NextResponse.json({ error: errorMessage(error) || "字段停用失败" }, { status: 400 }); }
}

