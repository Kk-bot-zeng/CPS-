import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { pool } from "@/lib/db";
import {
  FIXED_PRODUCT_FIELDS,
  cleanStatus,
  cleanText,
  createProductVersion,
  errorMessage,
  isBlank,
  isProductCategory,
  mapImportKeys,
  mergeCustomValues,
  normalizeModel,
  parseCategory,
  parseImportMode,
  validateCustomValues,
  type ImportMode,
  type ProductCategory,
  type ProductField,
  type ProductRecord,
} from "@/lib/product-knowledge";

export const runtime = "nodejs";
const MAX_IMPORT_ROWS = 20_000;
const MAX_CUSTOM_FIELDS = 100;

type NormalizedImportRow = {
  rowNumber: number;
  product_category: ProductCategory;
  product_series: string | null;
  canonical_model: string;
  canonical_model_normalized: string;
  sku: string | null;
  promotion_name: string | null;
  status: "active" | "inactive" | null;
  custom_values: Record<string, unknown>;
};

type ImportSummary = {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  creates: number;
  updates: number;
  skips: number;
  conflicts: number;
};

function categoryValue(value: unknown, fallback: ProductCategory): ProductCategory | null {
  if (isBlank(value)) return fallback;
  if (isProductCategory(value)) return value;
  const text = String(value).trim().toLowerCase();
  if (["tv", "电视", "电视机"].includes(text)) return "tv";
  if (["monitor", "显示器", "显示屏"].includes(text)) return "monitor";
  return null;
}

function optionValue(value: unknown, field: ProductField): unknown {
  if (isBlank(value)) return null;
  if (field.field_type === "number") {
    const number = typeof value === "number" ? value : Number(String(value).replace(/,/g, "").trim());
    return Number.isFinite(number) ? number : value;
  }
  if (field.field_type === "multiselect") {
    const list = Array.isArray(value) ? value : String(value).split(/[，,、]/).map((item) => item.trim()).filter(Boolean);
    return list.slice(0, 100);
  }
  return typeof value === "string" ? value.trim().slice(0, 10_000) : value;
}

function validFieldValue(value: unknown, field: ProductField): string | null {
  if (isBlank(value)) return field.required ? `字段“${field.field_label}”不能为空` : null;
  if (field.field_type === "number" && typeof value !== "number") return `字段“${field.field_label}”必须是数字`;
  if (field.field_type === "date" && Number.isNaN(Date.parse(String(value)))) return `字段“${field.field_label}”日期格式不正确`;
  if (field.field_type === "select" || field.field_type === "multiselect") {
    const options = Array.isArray(field.options) ? field.options.map((option: unknown) => {
      if (option && typeof option === "object" && !Array.isArray(option)) return String((option as Record<string, unknown>).value ?? (option as Record<string, unknown>).label ?? "");
      return String(option ?? "");
    }) : [];
    const values = field.field_type === "multiselect" && Array.isArray(value) ? value : [value];
    if (values.some((item) => !options.includes(String(item)))) return `字段“${field.field_label}”包含未配置的选项`;
  }
  return null;
}

function parseRows(rows: unknown[], category: ProductCategory, fields: ProductField[]) {
  const labelMap = new Map(fields.filter((field) => field.active).flatMap((field) => [[field.field_key, field], [field.field_label, field]]));
  const errors: string[] = [];
  const warnings: string[] = [];
  const valid: NormalizedImportRow[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    const rowNumber = index + 2;
    const source = rows[index];
    if (!source || typeof source !== "object" || Array.isArray(source)) { errors.push(`第${rowNumber}行：不是有效的数据行`); continue; }
    const row = mapImportKeys(source as Record<string, unknown>);
    const rowCategory = categoryValue(row.product_category, category);
    if (!rowCategory) { errors.push(`第${rowNumber}行：品类只能是TV或显示器`); continue; }
    if (rowCategory !== category) { errors.push(`第${rowNumber}行：品类与当前导入品类不一致`); continue; }
    const model = cleanText(row.canonical_model, 160);
    if (!model) { errors.push(`第${rowNumber}行：标准型号不能为空`); continue; }
    const custom: Record<string, unknown> = {};
    const explicitCustom = row.custom_values ?? row.customValues;
    if (explicitCustom && typeof explicitCustom === "object" && !Array.isArray(explicitCustom)) {
      for (const [key, value] of Object.entries(explicitCustom as Record<string, unknown>)) custom[key] = value;
    }
    for (const [key, value] of Object.entries(row)) {
      if (["product_category", "product_series", "canonical_model", "sku", "promotion_name", "status", "custom_values", "customValues"].includes(key)) continue;
      const field = labelMap.get(key);
      if (!field) { errors.push(`第${rowNumber}行：未知或已停用字段“${key}”`); continue; }
      custom[field.field_key] = optionValue(value, field);
    }
    if (Object.keys(custom).length > MAX_CUSTOM_FIELDS) { errors.push(`第${rowNumber}行：自定义字段不能超过${MAX_CUSTOM_FIELDS}个`); continue; }
    const fieldErrors = validateCustomValues(custom, fields, { requireRequired: false }).concat(fields.filter((field) => field.active).map((field) => validFieldValue(custom[field.field_key], { ...field, required: false })).filter((item): item is string => Boolean(item)));
    if (fieldErrors.length) { errors.push(...fieldErrors.slice(0, 10).map((item) => `第${rowNumber}行：${item}`)); continue; }
    valid.push({
      rowNumber,
      product_category: category,
      product_series: cleanText(row.product_series, 160),
      canonical_model: model,
      canonical_model_normalized: normalizeModel(model),
      sku: cleanText(row.sku, 160),
      promotion_name: cleanText(row.promotion_name, 240),
      status: isBlank(row.status) ? null : cleanStatus(row.status),
      custom_values: custom,
    });
  }
  // Last occurrence wins. It is deterministic and prevents a single import from
  // creating multiple versions of the same model by accident.
  const deduped = new Map<string, NormalizedImportRow>();
  for (const row of valid) {
    if (deduped.has(row.canonical_model_normalized)) { warnings.push(`第${row.rowNumber}行：重复标准型号，已采用最后一行`); }
    deduped.set(row.canonical_model_normalized, row);
  }
  return { rows: [...deduped.values()], errors, warnings, duplicateRows: valid.length - deduped.size };
}

async function fieldsFor(category: ProductCategory) {
  const { rows } = await pool.query<ProductField>(
    `select id, product_category, field_key, field_label, field_type, options,
            required, active, sort_order, notes, created_at, updated_at
       from public.product_knowledge_fields
      where product_category = $1 and active = true
      order by sort_order asc, field_label asc`, [category],
  );
  return rows;
}

async function existingByKeys(category: ProductCategory, keys: string[]) {
  if (!keys.length) return new Map<string, ProductRecord>();
  const { rows } = await pool.query<ProductRecord>(
    `select id, product_category, product_series, canonical_model,
            canonical_model_normalized, sku, promotion_name, status,
            custom_values, current_version_id, created_by, updated_by,
            created_at, updated_at
       from public.product_knowledge_products
      where product_category = $1 and canonical_model_normalized = any($2::text[])`, [category, keys],
  );
  return new Map(rows.map((row) => [row.canonical_model_normalized, row]));
}

function countPlan(rows: NormalizedImportRow[], existing: Map<string, ProductRecord>, mode: ImportMode): ImportSummary {
  let creates = 0; let updates = 0; let skips = 0;
  for (const row of rows) {
    if (!existing.has(row.canonical_model_normalized)) creates += 1;
    else if (mode === "insert_only") skips += 1;
    else updates += 1;
  }
  return { totalRows: rows.length, validRows: rows.length, invalidRows: 0, duplicateRows: 0, creates, updates, skips, conflicts: 0 };
}

async function preview(body: Record<string, unknown>, userId: string) {
  const category = parseCategory(body.category ?? body.product_category);
  if (!category) return NextResponse.json({ error: "请选择有效品类" }, { status: 400 });
  const mode = body.mode === undefined || body.mode === null || body.mode === ""
    ? "merge" as const
    : parseImportMode(body.mode);
  if (!mode) return NextResponse.json({ error: "导入模式只能是insert_only、merge或overwrite" }, { status: 400 });
  const sourceRows = body.rows;
  if (!Array.isArray(sourceRows) || !sourceRows.length || sourceRows.length > MAX_IMPORT_ROWS) return NextResponse.json({ error: `每次请导入1至${MAX_IMPORT_ROWS}条数据` }, { status: 400 });
  const fields = await fieldsFor(category);
  const parsed = parseRows(sourceRows, category, fields);
  const existing = await existingByKeys(category, parsed.rows.map((row) => row.canonical_model_normalized));
  const requiredFields = fields.filter((field) => field.active && field.required);
  const rowsWithRequired = parsed.rows.filter((row) => {
    const needsRequired = !existing.has(row.canonical_model_normalized) || mode === "overwrite";
    if (!needsRequired) return true;
    const missing = requiredFields.filter((field) => isBlank(row.custom_values[field.field_key]));
    if (missing.length) {
      parsed.errors.push(`第${row.rowNumber}行：${missing.map((field) => `字段“${field.field_label}”不能为空`).join("、")}`);
      return false;
    }
    return true;
  });
  parsed.rows = rowsWithRequired;
  const summary = countPlan(parsed.rows, existing, mode);
  summary.totalRows = sourceRows.length;
  summary.invalidRows = parsed.errors.length;
  summary.duplicateRows = parsed.duplicateRows;
  const fileName = cleanText(body.fileName ?? body.file_name, 240) || "产品资料库.xlsx";
  const schemaSnapshot = { fixedFields: FIXED_PRODUCT_FIELDS, fields };
  const { rows } = await pool.query<{ id: string }>(
    `insert into public.product_knowledge_imports
      (product_category, file_name, mode, status, "rows", schema_snapshot, summary, created_by)
     values ($1, $2, $3, 'preview', $4::jsonb, $5::jsonb, $6::jsonb, $7)
     returning id`,
    [category, fileName, mode, JSON.stringify(parsed.rows), JSON.stringify(schemaSnapshot), JSON.stringify(summary), userId],
  );
  return NextResponse.json({
    importId: rows[0].id,
    category,
    mode,
    fileName,
    summary,
    errors: parsed.errors.slice(0, 200),
    warnings: parsed.warnings.slice(0, 200),
    fields: schemaSnapshot,
    // A small preview is enough for UI confirmation; all normalized rows stay server-side.
    previewRows: parsed.rows.slice(0, 100),
  }, { status: 201 });
}

async function confirm(importId: string, userId: string) {
  if (!importId) return NextResponse.json({ error: "缺少导入预览ID" }, { status: 400 });
  const client = await pool.connect();
  try {
    await client.query("begin");
    const { rows: importRows } = await client.query<{
      id: string; product_category: ProductCategory; mode: ImportMode; status: string;
      rows: NormalizedImportRow[]; file_name: string; summary: ImportSummary; expires_at: string;
    }>(
      `select id, product_category, mode, status, "rows", file_name, summary, expires_at
         from public.product_knowledge_imports
        where id = $1 and created_by = $2
        for update`, [importId, userId],
    );
    const item = importRows[0];
    if (!item) { await client.query("rollback"); return NextResponse.json({ error: "导入预览不存在或无权操作" }, { status: 404 }); }
    if (item.status !== "preview") { await client.query("rollback"); return NextResponse.json({ error: "该导入预览已确认或已取消" }, { status: 409 }); }
    if (new Date(item.expires_at).getTime() < Date.now()) {
      await client.query(`update public.product_knowledge_imports set status = 'expired' where id = $1`, [importId]);
      await client.query("commit");
      return NextResponse.json({ error: "导入预览已过期，请重新上传" }, { status: 410 });
    }
    const fieldsResult = await client.query<ProductField>(
      `select id, product_category, field_key, field_label, field_type, options,
              required, active, sort_order, notes, created_at, updated_at
         from public.product_knowledge_fields where product_category = $1 and active = true`, [item.product_category],
    );
    const fieldErrors = item.rows.flatMap((row) => validateCustomValues(row.custom_values || {}, fieldsResult.rows, { requireRequired: false }));
    if (fieldErrors.length) { await client.query("rollback"); return NextResponse.json({ error: "当前字段配置已变化，请重新预览导入", errors: fieldErrors.slice(0, 50) }, { status: 409 }); }
    let inserted = 0; let updated = 0; let skipped = 0;
    for (const row of item.rows) {
      const existingResult = await client.query<ProductRecord>(
        `select id, product_category, product_series, canonical_model,
                canonical_model_normalized, sku, promotion_name, status,
                custom_values, current_version_id, created_by, updated_by,
                created_at, updated_at
           from public.product_knowledge_products
          where product_category = $1 and canonical_model_normalized = $2
          for update`, [item.product_category, row.canonical_model_normalized],
      );
      const current = existingResult.rows[0];
      if (current && item.mode === "insert_only") { skipped += 1; continue; }
      const next = current ? {
        product_series: item.mode === "overwrite" || !isBlank(row.product_series) ? row.product_series : current.product_series,
        canonical_model: row.canonical_model,
        canonical_model_normalized: row.canonical_model_normalized,
        sku: item.mode === "overwrite" || !isBlank(row.sku) ? row.sku : current.sku,
        promotion_name: item.mode === "overwrite" || !isBlank(row.promotion_name) ? row.promotion_name : current.promotion_name,
        status: item.mode === "overwrite" ? (row.status || "active") : (!isBlank(row.status) ? row.status : current.status),
        custom_values: mergeCustomValues(current.custom_values || {}, row.custom_values || {}, item.mode === "overwrite" ? "overwrite" : "merge"),
      } : row;
      if (current) {
        const { rows } = await client.query<ProductRecord>(
          `update public.product_knowledge_products
              set product_series = $1, canonical_model = $2,
                  canonical_model_normalized = $3, sku = $4,
                  promotion_name = $5, status = $6, custom_values = $7::jsonb,
                  updated_by = $8, updated_at = now()
            where id = $9
          returning id, product_category, product_series, canonical_model,
                    canonical_model_normalized, sku, promotion_name, status,
                    custom_values, current_version_id, created_by, updated_by,
                    created_at, updated_at`,
          [next.product_series, next.canonical_model, next.canonical_model_normalized, next.sku,
            next.promotion_name, next.status, JSON.stringify(next.custom_values), userId, current.id],
        );
        await createProductVersion(client, rows[0], "import", userId, `批量导入：${item.file_name}`);
        updated += 1;
      } else {
        const { rows } = await client.query<ProductRecord>(
          `insert into public.product_knowledge_products
            (product_category, product_series, canonical_model, canonical_model_normalized,
             sku, promotion_name, status, custom_values, created_by, updated_by)
           values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $9)
           returning id, product_category, product_series, canonical_model,
                     canonical_model_normalized, sku, promotion_name, status,
                     custom_values, current_version_id, created_by, updated_by,
                     created_at, updated_at`,
          [item.product_category, next.product_series, next.canonical_model, next.canonical_model_normalized,
            next.sku, next.promotion_name, next.status || "active", JSON.stringify(next.custom_values), userId],
        );
        await createProductVersion(client, rows[0], "import", userId, `批量导入：${item.file_name}`);
        inserted += 1;
      }
    }
    const summary = { ...(item.summary || {}), creates: inserted, updates: updated, skips: skipped };
    await client.query(
      `update public.product_knowledge_imports
          set status = 'confirmed', summary = $1::jsonb, confirmed_at = now()
        where id = $2`, [JSON.stringify(summary), importId],
    );
    await client.query("commit");
    return NextResponse.json({ ok: true, importId, fileName: item.file_name, summary });
  } catch (error) {
    await client.query("rollback");
    return NextResponse.json({ error: errorMessage(error) || "导入确认失败，数据库未发生变更" }, { status: 400 });
  } finally { client.release(); }
}

export async function GET(request: Request) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;
  const params = new URL(request.url).searchParams;
  const category = params.get("category") || params.get("product_category");
  const values: unknown[] = [auth.user.id];
  const categorySql = category && isProductCategory(category) ? (values.push(category), ` and product_category = $${values.length}`) : "";
  const { rows } = await pool.query(
    `select id, product_category, file_name, mode, status, summary, created_at, confirmed_at, expires_at
       from public.product_knowledge_imports
      where created_by = $1${categorySql}
      order by created_at desc limit 100`, values,
  );
  return NextResponse.json({ imports: rows });
}

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;
  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "请求格式不正确" }, { status: 400 }); }
  const action = body.action || (body.importId || body.import_id ? "confirm" : "preview");
  if (action === "confirm") return confirm(String(body.importId ?? body.import_id ?? ""), auth.user.id);
  if (action !== "preview") return NextResponse.json({ error: "action只能是preview或confirm" }, { status: 400 });
  return preview(body, auth.user.id);
}

export async function DELETE(request: Request) {
  const auth = await requireApiUser();
  if (auth.error) return auth.error;
  const params = new URL(request.url).searchParams;
  let importId = params.get("importId") || params.get("import_id");
  if (!importId) { try { const body = await request.json() as Record<string, unknown>; importId = String(body.importId ?? body.import_id ?? ""); } catch { /* empty */ } }
  if (!importId) return NextResponse.json({ error: "缺少导入预览ID" }, { status: 400 });
  const { rows } = await pool.query(`update public.product_knowledge_imports set status = 'cancelled' where id = $1 and created_by = $2 and status = 'preview' returning id`, [importId, auth.user.id]);
  if (!rows[0]) return NextResponse.json({ error: "导入预览不存在、已处理或无权操作" }, { status: 404 });
  return NextResponse.json({ ok: true, importId });
}
