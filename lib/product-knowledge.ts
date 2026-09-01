import type { PoolClient, QueryResultRow } from "pg";

export type ProductCategory = "tv" | "monitor";
export type ProductStatus = "active" | "inactive";
export type ImportMode = "insert_only" | "merge" | "overwrite";
export type ProductFieldType =
  | "text"
  | "textarea"
  | "number"
  | "date"
  | "select"
  | "multiselect";

export type ProductField = {
  id: string;
  product_category: ProductCategory;
  field_key: string;
  field_label: string;
  field_type: ProductFieldType;
  options: unknown[];
  required: boolean;
  active: boolean;
  sort_order: number;
  notes: string | null;
  created_at?: string;
  updated_at?: string;
};

export type ProductRecord = {
  id: string;
  product_category: ProductCategory;
  product_series: string | null;
  canonical_model: string;
  canonical_model_normalized: string;
  sku: string | null;
  promotion_name: string | null;
  status: ProductStatus;
  custom_values: Record<string, unknown>;
  current_version_id: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export const PRODUCT_CATEGORIES: ProductCategory[] = ["tv", "monitor"];

/** Fixed fields cannot be removed; product-specific facts live in custom_values. */
export const FIXED_PRODUCT_FIELDS = [
  { key: "product_category", header: "品类", label: "品类", type: "select" as const, required: true, fixed: true },
  { key: "product_series", header: "产品系列", label: "产品系列", type: "text" as const, required: false, fixed: true },
  { key: "canonical_model", header: "标准型号", label: "标准型号", type: "text" as const, required: true, fixed: true },
  { key: "sku", header: "SKU", label: "SKU", type: "text" as const, required: false, fixed: true },
  { key: "promotion_name", header: "推广名", label: "推广名", type: "text" as const, required: false, fixed: true },
  { key: "status", header: "状态", label: "状态", type: "select" as const, required: false, fixed: true },
] as const;

const FIXED_KEYS: Set<string> = new Set(FIXED_PRODUCT_FIELDS.map((field) => field.key));
const IMPORT_META_KEYS = new Set(["__rowNum__", "__rowNum", "rowNum", "序号", "index"]);

export function isProductCategory(value: unknown): value is ProductCategory {
  return value === "tv" || value === "monitor";
}

export function parseCategory(value: unknown): ProductCategory | null {
  return isProductCategory(value) ? value : null;
}

export function parseImportMode(value: unknown): ImportMode | null {
  return value === "insert_only" || value === "merge" || value === "overwrite" ? value : null;
}

export function normalizeModel(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

export function cleanText(value: unknown, maxLength = 10_000): string | null {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text ? text.slice(0, maxLength) : null;
}

export function cleanStatus(value: unknown): ProductStatus {
  return value === "inactive" || value === "停用" ? "inactive" : "active";
}

export function isBlank(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === "string" && value.trim() === "");
}

export function keyFromLabel(label: unknown): string {
  const raw = String(label ?? "").trim().toLowerCase();
  const key = raw
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 56);
  return /^[a-z]/.test(key) ? key : `field_${key || Date.now().toString(36)}`;
}

export function isValidFieldKey(value: unknown): value is string {
  return typeof value === "string" && /^[a-z][a-z0-9_]{1,63}$/.test(value) && !FIXED_KEYS.has(value);
}

export function fixedFieldMetadata(category?: ProductCategory) {
  return FIXED_PRODUCT_FIELDS.map((field) => ({
    ...field,
    options: field.key === "product_category"
      ? PRODUCT_CATEGORIES.map((value) => ({ value, label: value === "tv" ? "TV" : "显示器" }))
      : field.key === "status"
        ? [{ value: "active", label: "启用" }, { value: "inactive", label: "停用" }]
        : [],
    category: category || "all",
  }));
}

const aliases: Record<string, string> = {
  category: "product_category",
  品类: "product_category",
  产品品类: "product_category",
  series: "product_series",
  productSeries: "product_series",
  产品系列: "product_series",
  系列: "product_series",
  model: "canonical_model",
  canonicalModel: "canonical_model",
  标准型号: "canonical_model",
  型号: "canonical_model",
  sku: "sku",
  SKU: "sku",
  商品编码: "sku",
  promotionName: "promotion_name",
  推广名: "promotion_name",
  状态: "status",
  state: "status",
};

export function mapImportKeys(row: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (IMPORT_META_KEYS.has(key)) continue;
    const canonicalKey = aliases[key] || key;
    // Keep the first non-empty value if a spreadsheet contains both an English
    // and a Chinese alias for the same column.
    if (!(canonicalKey in result) || isBlank(result[canonicalKey])) result[canonicalKey] = value;
  }
  return result;
}

export function customValuesFromInput(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  return { ...(input as Record<string, unknown>) };
}

export function validateCustomValues(
  values: Record<string, unknown>,
  fields: ProductField[],
  options: { requireRequired?: boolean } = {},
) {
  const active = new Map(fields.filter((field) => field.active).map((field) => [field.field_key, field]));
  const errors: string[] = [];
  for (const key of Object.keys(values)) {
    if (!active.has(key)) errors.push(`未知或已停用字段：${key}`);
  }
  if (options.requireRequired !== false) {
    for (const field of fields.filter((item) => item.active && item.required)) {
      if (isBlank(values[field.field_key])) errors.push(`字段“${field.field_label}”不能为空`);
    }
  }
  return errors;
}

export function mergeCustomValues(
  current: Record<string, unknown>,
  incoming: Record<string, unknown>,
  mode: "merge" | "overwrite",
) {
  if (mode === "overwrite") return { ...incoming };
  const next = { ...current };
  for (const [key, value] of Object.entries(incoming)) {
    if (!isBlank(value)) next[key] = value;
  }
  return next;
}

export function productSnapshot(product: Pick<ProductRecord, "product_category" | "product_series" | "canonical_model" | "sku" | "promotion_name" | "status" | "custom_values">) {
  return {
    product_category: product.product_category,
    product_series: product.product_series,
    canonical_model: product.canonical_model,
    sku: product.sku,
    promotion_name: product.promotion_name,
    status: product.status,
    custom_values: product.custom_values || {},
  };
}

export async function createProductVersion(
  client: Pick<PoolClient, "query">,
  product: ProductRecord,
  source: "manual" | "import" | "rollback",
  createdBy: string | null,
  note?: string | null,
  rollbackFromVersionId?: string | null,
) {
  const { rows: versionRows } = await client.query<QueryResultRow>(
    `select coalesce(max(version_no), 0) + 1 as next_version
       from public.product_knowledge_versions
      where product_id = $1`,
    [product.id],
  );
  const versionNo = Number(versionRows[0]?.next_version || 1);
  const { rows } = await client.query<ProductRecord & { id: string }>(
    `insert into public.product_knowledge_versions
       (product_id, version_no, source, snapshot, note, rollback_from_version_id, created_by)
     values ($1, $2, $3, $4::jsonb, $5, $6, $7)
     returning id, product_id, version_no, source, snapshot, note, rollback_from_version_id, created_by, created_at`,
    [product.id, versionNo, source, JSON.stringify(productSnapshot(product)), note || null, rollbackFromVersionId || null, createdBy],
  );
  await client.query(
    `update public.product_knowledge_products
        set current_version_id = $1, updated_at = now()
      where id = $2`,
    [rows[0].id, product.id],
  );
  return rows[0];
}

export function buildProductPayload(body: Record<string, unknown>, category: ProductCategory) {
  const canonicalModel = cleanText(body.canonical_model ?? body.canonicalModel ?? body.model, 160);
  if (!canonicalModel) throw new Error("标准型号不能为空");
  return {
    product_category: category,
    product_series: cleanText(body.product_series ?? body.productSeries ?? body.series, 160),
    canonical_model: canonicalModel,
    canonical_model_normalized: normalizeModel(canonicalModel),
    sku: cleanText(body.sku, 160),
    promotion_name: cleanText(body.promotion_name ?? body.promotionName, 240),
    status: cleanStatus(body.status),
    custom_values: customValuesFromInput(body.custom_values ?? body.customValues),
  };
}

export const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);
