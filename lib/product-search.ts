/**
 * Product picker search primitives.  Keep these independent from React so
 * matching behavior can be regression-tested without mounting the workspace.
 */
export type ProductSearchRecord = {
  promotionName?: unknown;
  model?: unknown;
  series?: unknown;
  sku?: unknown;
};

const PRODUCT_SEARCH_SEPARATOR_RE = /[\s\-_/\\|·•.,，。:：;；+&#@()\[\]【】{}<>《》'"“”‘’~～]+/g;

function asText(value: unknown) {
  return String(value ?? "").trim();
}

/** Normalize display variants while preserving Chinese/Latin/digit content. */
export function normaliseProductSearch(value: unknown) {
  return asText(value)
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(PRODUCT_SEARCH_SEPARATOR_RE, "");
}

/**
 * Split a query into meaningful terms before normalizing each term.  A query
 * without separators (for example, "鹤6Ultra") remains one contiguous term.
 */
export function splitProductSearchTerms(value: unknown) {
  return asText(value)
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .split(PRODUCT_SEARCH_SEPARATOR_RE)
    .map((term) => normaliseProductSearch(term))
    .filter(Boolean);
}

/**
 * Every query term must occur in the combined product search text.  This
 * supports "鹤7 26" → "鹤7 Pro 26款" while avoiding broad OR/fuzzy matches.
 */
export function productMatchesSearch(product: ProductSearchRecord, query: unknown) {
  const terms = splitProductSearchTerms(query);
  if (!terms.length) return true;
  const searchable = [product.promotionName, product.model, product.series, product.sku]
    .map((value) => normaliseProductSearch(value))
    .join("");
  return terms.every((term) => searchable.includes(term));
}
