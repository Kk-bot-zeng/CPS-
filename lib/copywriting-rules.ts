/**
 * Deterministic copywriting guardrails.
 *
 * These helpers deliberately do not call an AI service.  The API route uses
 * them both when building the grounding prompt and when normalising the
 * returned draft, so the most important naming and product-launch rules do
 * not depend on model compliance.
 */

export type GroundedCopyProduct = {
  id?: string;
  canonicalModel: string;
  promotionName?: string | null;
  /** Server-validated public name for a selected whole series. */
  seriesPublicName?: string | null;
};

const POSITIVE_NEW_PRODUCT_RE = /(?:新品(?:上市|发布|首发|来袭)?|全新(?:上市|发布|首发)|上新|首发|新款(?:上市|发布)?)/u;
const NEGATED_NEW_PRODUCT_RE = /(?:(?:不(?:是|属于)?|非)|不要|无需|无须|禁止|勿|别)\s*(?:再\s*)?(?:写|说|强调|标注|宣传|称(?:为)?|使用)?\s*(?:新品|上新|首发|新款|全新)/u;

function textValue(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(textValue).filter(Boolean).join("\n");
  if (value && typeof value === "object") return Object.values(value as Record<string, unknown>).map(textValue).filter(Boolean).join("\n");
  return "";
}

/** Return true only when text contains a positive, explicit launch intent. */
export function hasExplicitNewProductIntent(...values: unknown[]): boolean {
  const text = values.map(textValue).filter(Boolean).join("\n");
  if (!text || NEGATED_NEW_PRODUCT_RE.test(text)) return false;
  return POSITIVE_NEW_PRODUCT_RE.test(text);
}

/**
 * Authorization boundary used by the API.  Keep this separate from the
 * generic detector so callers cannot accidentally pass automatically loaded
 * facts or policy text as if it were a user's instruction.
 */
export function hasUserNewProductIntent(scene: unknown, intent: unknown, constraints: unknown): boolean {
  return hasExplicitNewProductIntent(scene, intent, constraints);
}

/**
 * A promotion name is the public name.  The canonical model is only a safe
 * fallback when the catalog has no promotion name.
 */
export function publicProductName(product: GroundedCopyProduct): string {
  return product.seriesPublicName?.trim() || product.promotionName?.trim() || product.canonicalModel.trim();
}

export function hasPromotionName(product: GroundedCopyProduct): boolean {
  return Boolean(product.promotionName?.trim());
}

export function hasPublicProductName(product: GroundedCopyProduct): boolean {
  return Boolean(product.seriesPublicName?.trim() || product.promotionName?.trim());
}

export function uniquePublicProductNames(products: GroundedCopyProduct[]): string[] {
  return [...new Set(products.map(publicProductName).filter(Boolean))];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function draftRange(content: string): { start: number; end: number } | null {
  const marker = "【文案草稿】";
  const startMarker = content.indexOf(marker);
  if (startMarker < 0) return null;
  const start = startMarker + marker.length;
  const endMarker = content.indexOf("【待确认事项】", start);
  return { start, end: endMarker >= 0 ? endMarker : content.length };
}

/** Replace exact canonical-model mentions in the draft with promotion names. */
export function replaceModelReferencesInDraft(content: string, products: GroundedCopyProduct[]): string {
  const range = draftRange(content);
  if (!range) return content;
  let draft = content.slice(range.start, range.end);
  const replacements = products
    .filter((product) => hasPublicProductName(product) && product.canonicalModel.trim() && publicProductName(product) !== product.canonicalModel.trim())
    .sort((a, b) => b.canonicalModel.trim().length - a.canonicalModel.trim().length);
  for (const product of replacements) {
    const model = product.canonicalModel.trim();
    // Allow arbitrary whitespace between model tokens (e.g. "鹤7Pro" and
    // "鹤7 Pro") while keeping the match bounded to the exact model text.
    const pattern = escapeRegExp(model).replace(/\\ +/g, "\\s*");
    draft = draft.replace(new RegExp(pattern, "giu"), publicProductName(product));
  }
  // Models can be paraphrased with an inch unit ("65英寸鹤7…") rather than
  // copied verbatim.  For a validated series, remove that size prefix too;
  // standalone products retain their own promotion names.
  const seriesNames = [...new Set(products.map((product) => product.seriesPublicName?.trim()).filter((name): name is string => Boolean(name)))];
  for (const seriesName of seriesNames) {
    const pattern = `\\d{2,3}(?:\\.\\d+)?\\s*(?:英寸|寸|吋)?\\s*${escapeRegExp(seriesName)}`;
    draft = draft.replace(new RegExp(pattern, "giu"), seriesName);
  }
  return `${content.slice(0, range.start)}${draft}${content.slice(range.end)}`;
}

/**
 * Ensure every selected public product name is visible in the draft.  Missing
 * promotion names are called out explicitly instead of silently presenting a
 * canonical model as a consumer-facing name.
 */
export function ensurePublicProductNames(content: string, products: GroundedCopyProduct[]): string {
  const range = draftRange(content);
  if (!range) return content;
  const draft = content.slice(range.start, range.end);
  const fallbackNames = products
    .filter((product) => !hasPublicProductName(product) && product.canonicalModel.trim())
    .map((product) => `标准型号：${product.canonicalModel.trim()}（推广名缺失）`);
  const missing = uniquePublicProductNames(products).filter((name) => !draft.includes(name));
  const missingFallbacks = fallbackNames.filter((name) => !draft.includes(name));
  if (!missing.length && !missingFallbacks.length) return content;
  const names = [...missing.filter((name) => !fallbackNames.some((item) => item.includes(name))), ...missingFallbacks];
  const line = `\n产品：${names.join("、")}\n`;
  return `${content.slice(0, range.start)}${line}${content.slice(range.start)}`;
}

/** Remove unsupported launch claims from all generated sections. */
export function stripUnsupportedNewProductClaims(content: string, allowNewProduct: boolean): string {
  if (allowNewProduct) return content;
  return content
    .replace(/新品(?:上市|发布|首发|来袭)?/gu, "产品")
    .replace(/全新(?:上市|发布|首发)/gu, "产品介绍")
    .replace(/上新/gu, "产品推荐")
    .replace(/新款(?:上市|发布)?/gu, "产品");
}
