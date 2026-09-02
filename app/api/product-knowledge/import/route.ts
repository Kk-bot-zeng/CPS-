import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api-auth";
import { pool } from "@/lib/db";
import {
  FIXED_PRODUCT_FIELDS,
  MAX_PRODUCT_KNOWLEDGE_IMPORT_CUSTOM_FIELDS,
  MAX_PRODUCT_KNOWLEDGE_IMPORT_HEADERS,
  MAX_PRODUCT_KNOWLEDGE_IMPORT_REQUEST_BYTES,
  MAX_PRODUCT_KNOWLEDGE_IMPORT_ROWS,
  canonicalImportKey,
  cleanStatus,
  cleanText,
  createProductVersion,
  errorMessage,
  isBlank,
  isValidFieldKey,
  isProductCategory,
  keyFromLabel,
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
const IMPORT_META_KEYS = new Set(["__rowNum__", "__rowNum", "rowNum", "序号", "index"]);

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

type ImportField = Omit<ProductField, "id"> & { id?: string };

type ImportSummary = {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  creates: number;
  updates: number;
  skips: number;
  conflicts: number;
  newFields: Array<{ field_key: string; field_label: string; field_type: string }>;
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

function comparableHeader(value: unknown) {
  return String(value ?? "").trim().toLocaleLowerCase();
}

function isEmptySpreadsheetHeader(value: unknown) {
  const header = String(value ?? "").trim();
  return !header || /^__empty(?:_\d+)?$/i.test(header) || /^unnamed(?::\s*\d+)?$/i.test(header);
}

function importHeaders(rows: unknown[], suppliedHeaders: unknown) {
  if (Array.isArray(suppliedHeaders)) return suppliedHeaders.map((header) => String(header ?? ""));
  const union = new Set<string>();
  rows.forEach((source) => {
    if (source && typeof source === "object" && !Array.isArray(source)) Object.keys(source as Record<string, unknown>).forEach((key) => union.add(key));
  });
  return [...union];
}

function importHeaderStats(headers: string[]) {
  let nonEmpty = 0;
  const custom = new Set<string>();
  for (const header of headers) {
    if (isEmptySpreadsheetHeader(header)) continue;
    nonEmpty += 1;
    const canonical = canonicalImportKey(header);
    if (FIXED_PRODUCT_FIELDS.some((field) => field.key === canonical) || IMPORT_META_KEYS.has(header)) continue;
    custom.add(comparableHeader(header));
  }
  return { nonEmpty, customCount: custom.size };
}

function explicitCustomFieldStats(rows: unknown[]) {
  let maxPerRow = 0;
  for (const source of rows) {
    if (!source || typeof source !== "object" || Array.isArray(source)) continue;
    const row = source as Record<string, unknown>;
    const values = row.custom_values ?? row.customValues;
    if (!values || typeof values !== "object" || Array.isArray(values)) continue;
    maxPerRow = Math.max(maxPerRow, Object.keys(values as Record<string, unknown>).length);
  }
  return maxPerRow;
}

function withUniqueFieldKey(base: string, used: Set<string>) {
  let key = base;
  let suffix = 2;
  while (used.has(key) || !isValidFieldKey(key)) {
    const tail = `_${suffix}`;
    key = `${base.slice(0, Math.max(2, 64 - tail.length))}${tail}`;
    suffix += 1;
  }
  used.add(key);
  return key;
}

function prepareImportFields(
  headers: string[],
  category: ProductCategory,
  fields: ProductField[],
  autoCreateFields: boolean,
) {
  const fixedKeys = new Set(FIXED_PRODUCT_FIELDS.map((field) => field.key));
  const active = fields.filter((field) => field.active);
  const inactive = fields.filter((field) => !field.active);
  const usedKeys = new Set([...fixedKeys, ...fields.map((field) => field.field_key)]);
  const labelMap = new Map<string, ProductField>();
  [...active].forEach((field) => {
    labelMap.set(comparableHeader(field.field_key), field);
    labelMap.set(comparableHeader(field.field_label), field);
  });
  const inactiveMap = new Map<string, ProductField>();
  inactive.forEach((field) => {
    inactiveMap.set(comparableHeader(field.field_key), field);
    inactiveMap.set(comparableHeader(field.field_label), field);
  });
  const seenHeaders = new Set<string>();
  const errors: string[] = [];
  const newFields: ProductField[] = [];
  const reactivateFields: ProductField[] = [];
  const reactivateKeys = new Set<string>();
  const parseFields: ProductField[] = [...active];
  for (const header of headers) {
    if (isEmptySpreadsheetHeader(header)) {
      errors.push("表头不能为空，请删除空白列后重新导入");
      continue;
    }
    const canonical = canonicalImportKey(header);
    if (FIXED_PRODUCT_FIELDS.some((field) => field.key === canonical) || IMPORT_META_KEYS.has(header)) {
      const duplicateKey = `fixed:${comparableHeader(canonical)}`;
      if (seenHeaders.has(duplicateKey)) errors.push(`表头重复：“${header}”`);
      seenHeaders.add(duplicateKey);
      continue;
    }
    const lookup = comparableHeader(header);
    if (seenHeaders.has(`field:${lookup}`)) {
      errors.push(`表头重复：“${header}”`);
      continue;
    }
    seenHeaders.add(`field:${lookup}`);
    if (labelMap.has(lookup)) continue;
    if (inactiveMap.has(lookup)) {
      const field = inactiveMap.get(lookup)!;
      // A parameter sheet is an authoritative schema input.  Reusing a
      // previously disabled header should restore that field as part of the
      // same confirmation transaction instead of creating a duplicate field.
      const restored = { ...field, active: true };
      if (!reactivateKeys.has(field.field_key)) {
        reactivateFields.push(field);
        reactivateKeys.add(field.field_key);
      }
      parseFields.push(restored);
      labelMap.set(lookup, restored);
      continue;
    }
    if (!autoCreateFields) {
      errors.push(`未知字段“${header}”，本次导入不会自动创建字段`);
      continue;
    }
    const fieldKey = withUniqueFieldKey(keyFromLabel(header), usedKeys);
    const field: ProductField = {
      id: "",
      product_category: category,
      field_key: fieldKey,
      field_label: cleanText(header, 80) || "未命名字段",
      field_type: "text",
      options: [],
      required: false,
      active: true,
      sort_order: fields.length + newFields.length,
      notes: null,
    };
    newFields.push(field);
    labelMap.set(lookup, field);
    labelMap.set(comparableHeader(field.field_key), field);
  }
  return { activeFields: [...parseFields, ...newFields], newFields, reactivateFields, errors };
}

function parseRows(rows: unknown[], category: ProductCategory, fields: ProductField[]) {
  const labelMap = new Map<string, ProductField>();
  fields.filter((field) => field.active).forEach((field) => {
    labelMap.set(comparableHeader(field.field_key), field);
    labelMap.set(comparableHeader(field.field_label), field);
  });
  const errors: string[] = [];
  const warnings: string[] = [];
  const valid: NormalizedImportRow[] = [];
  let fieldLimitExceeded = false;
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
      const field = labelMap.get(comparableHeader(key));
      if (!field) { errors.push(`第${rowNumber}行：未知或已停用字段“${key}”`); continue; }
      custom[field.field_key] = optionValue(value, field);
    }
    if (Object.keys(custom).length > MAX_PRODUCT_KNOWLEDGE_IMPORT_CUSTOM_FIELDS) { fieldLimitExceeded = true; continue; }
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
  return { rows: [...deduped.values()], errors, warnings, duplicateRows: valid.length - deduped.size, fieldLimitExceeded };
}

async function fieldsFor(category: ProductCategory, includeInactive = false) {
  const { rows } = await pool.query<ProductField>(
    `select id, product_category, field_key, field_label, field_type, options,
            required, active, sort_order, notes, created_at, updated_at
       from public.product_knowledge_fields
      where product_category = $1${includeInactive ? "" : " and active = true"}
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

function countPlan(rows: NormalizedImportRow[], existing: Map<string, ProductRecord>, mode: ImportMode, newFields: ProductField[] = []): ImportSummary {
  let creates = 0; let updates = 0; let skips = 0;
  for (const row of rows) {
    if (!existing.has(row.canonical_model_normalized)) creates += 1;
    else if (mode === "insert_only") skips += 1;
    else updates += 1;
  }
  return {
    totalRows: rows.length,
    validRows: rows.length,
    invalidRows: 0,
    duplicateRows: 0,
    creates,
    updates,
    skips,
    conflicts: 0,
    newFields: newFields.map((field) => ({ field_key: field.field_key, field_label: field.field_label, field_type: field.field_type })),
  };
}

async function preview(body: Record<string, unknown>, userId: string) {
  const category = parseCategory(body.category ?? body.product_category);
  if (!category) return NextResponse.json({ error: "请选择有效品类" }, { status: 400 });
  // The product-parameter UI always uses full coverage.  Keep the three API
  // modes for existing integrations, but make the safe default overwrite so a
  // plain upload has the requested semantics.
  const mode = body.mode === undefined || body.mode === null || body.mode === ""
    ? "overwrite" as const
    : parseImportMode(body.mode);
  if (!mode) return NextResponse.json({ error: "导入模式只能是insert_only、merge或overwrite" }, { status: 400 });
  const sourceRows = body.rows;
  if (!Array.isArray(sourceRows) || !sourceRows.length || sourceRows.length > MAX_PRODUCT_KNOWLEDGE_IMPORT_ROWS) return NextResponse.json({ error: `每次请导入1至${MAX_PRODUCT_KNOWLEDGE_IMPORT_ROWS}条数据` }, { status: 400 });
  const suppliedHeaders = importHeaders(sourceRows, body.headers);
  const headerStats = importHeaderStats(suppliedHeaders);
  if (headerStats.nonEmpty > MAX_PRODUCT_KNOWLEDGE_IMPORT_HEADERS) {
    return NextResponse.json({ error: `参数表总表头不能超过${MAX_PRODUCT_KNOWLEDGE_IMPORT_HEADERS}列，请拆分后重新导入` }, { status: 400 });
  }
  if (headerStats.customCount > MAX_PRODUCT_KNOWLEDGE_IMPORT_CUSTOM_FIELDS) {
    return NextResponse.json({ error: `参数表自定义字段不能超过${MAX_PRODUCT_KNOWLEDGE_IMPORT_CUSTOM_FIELDS}个，请减少字段后重新导入` }, { status: 400 });
  }
  if (explicitCustomFieldStats(sourceRows) > MAX_PRODUCT_KNOWLEDGE_IMPORT_CUSTOM_FIELDS) {
    return NextResponse.json({ error: `参数表单行自定义字段不能超过${MAX_PRODUCT_KNOWLEDGE_IMPORT_CUSTOM_FIELDS}个，请减少字段后重新导入` }, { status: 400 });
  }
  const allFields = await fieldsFor(category, true);
  const autoCreateFields = body.autoCreateFields === true || mode === "overwrite";
  const prepared = prepareImportFields(suppliedHeaders, category, allFields, autoCreateFields);
  if (prepared.errors.length) return NextResponse.json({ error: "参数表头校验失败", errors: prepared.errors.slice(0, 200) }, { status: 400 });
  const fields = prepared.activeFields;
  const parsed = parseRows(sourceRows, category, fields);
  if (parsed.fieldLimitExceeded) {
    return NextResponse.json({ error: `参数表自定义字段不能超过${MAX_PRODUCT_KNOWLEDGE_IMPORT_CUSTOM_FIELDS}个，请减少字段后重新导入` }, { status: 400 });
  }
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
  const summary = countPlan(parsed.rows, existing, mode, prepared.newFields);
  summary.totalRows = sourceRows.length;
  summary.invalidRows = parsed.errors.length;
  summary.duplicateRows = parsed.duplicateRows;
  const fileName = cleanText(body.fileName ?? body.file_name, 240) || "产品资料库.xlsx";
  const schemaSnapshot = { fixedFields: FIXED_PRODUCT_FIELDS, fields, newFields: prepared.newFields, reactivateFields: prepared.reactivateFields };
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
    newFields: prepared.newFields.map((field) => ({ field_key: field.field_key, field_label: field.field_label, field_type: field.field_type })),
    restoredFields: prepared.reactivateFields.map((field) => ({ field_key: field.field_key, field_label: field.field_label })),
    // A small preview is enough for UI confirmation; all normalized rows stay server-side.
    previewRows: parsed.rows.slice(0, 100).map((row) => {
      const existingRow = existing.get(row.canonical_model_normalized);
      return {
        rowNumber: row.rowNumber,
        state: existingRow ? (mode === "insert_only" ? "skip" : "update") : "new",
        values: {
          product_category: row.product_category,
          product_series: row.product_series || "",
          canonical_model: row.canonical_model,
          sku: row.sku || "",
          promotion_name: row.promotion_name || "",
          status: row.status || "",
          ...Object.fromEntries(fields.filter((field) => !FIXED_PRODUCT_FIELDS.some((fixed) => fixed.key === field.field_key)).map((field) => [field.field_label, row.custom_values[field.field_key] ?? ""])),
        },
      };
    }),
  }, { status: 201 });
}

async function confirm(importId: string, userId: string) {
  if (!importId) return NextResponse.json({ error: "缺少导入预览ID" }, { status: 400 });
  const client = await pool.connect();
  try {
    await client.query("begin");
    const { rows: importRows } = await client.query<{
      id: string; product_category: ProductCategory; mode: ImportMode; status: string;
      rows: NormalizedImportRow[]; file_name: string; summary: ImportSummary; schema_snapshot: { fields?: ImportField[]; newFields?: ImportField[]; reactivateFields?: ImportField[] }; expires_at: string;
    }>(
      `select id, product_category, mode, status, "rows", file_name, summary, schema_snapshot, expires_at
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
    // Field creation is part of the same transaction as product updates.  A
    // preview never mutates the schema, and a failed confirmation rolls back
    // both the new fields and all product/version writes.
    const pendingFields = item.schema_snapshot?.newFields || [];
    for (const pending of pendingFields) {
      if (!pending.field_key || !isValidFieldKey(pending.field_key) || !pending.field_label) {
        throw new Error(`导入字段“${pending.field_label || pending.field_key || "未命名"}”不合法，请重新预览`);
      }
      const { rows: existingFields } = await client.query<ProductField>(
        `select id, product_category, field_key, field_label, field_type, options,
                required, active, sort_order, notes, created_at, updated_at
           from public.product_knowledge_fields
          where product_category = $1 and field_key = $2
          for update`, [item.product_category, pending.field_key],
      );
      if (existingFields[0]) {
        if (existingFields[0].field_label !== pending.field_label) {
          throw new Error(`字段标识“${pending.field_key}”已被其他字段占用，请重新预览`);
        }
        continue;
      }
      await client.query(
        `insert into public.product_knowledge_fields
          (product_category, field_key, field_label, field_type, options, required, active, sort_order, created_by)
         values ($1, $2, $3, $4, $5::jsonb, false, true, $6, $7)`,
        [item.product_category, pending.field_key, pending.field_label, pending.field_type || "text", JSON.stringify(pending.options || []), pending.sort_order || 0, userId],
      );
    }
    for (const pending of item.schema_snapshot?.reactivateFields || []) {
      const { rows: existingFields } = await client.query<ProductField>(
        `select id, product_category, field_key, field_label, field_type, options,
                required, active, sort_order, notes, created_at, updated_at
           from public.product_knowledge_fields
          where product_category = $1 and field_key = $2
          for update`, [item.product_category, pending.field_key],
      );
      if (!existingFields[0] || existingFields[0].field_label !== pending.field_label) {
        throw new Error(`待恢复字段“${pending.field_label}”已发生变化，请重新预览导入`);
      }
      if (!existingFields[0].active) {
        await client.query(`update public.product_knowledge_fields set active = true, updated_at = now() where id = $1`, [existingFields[0].id]);
      }
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
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_PRODUCT_KNOWLEDGE_IMPORT_REQUEST_BYTES) {
    return NextResponse.json({ error: "参数表请求体不能超过64MB，请拆分文件后重新导入" }, { status: 413 });
  }
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
