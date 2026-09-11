import assert from "node:assert/strict";

const { deriveProductSeries, normaliseProductSearch, splitProductSearchTerms, productMatchesSearch } = await import("../lib/product-search.ts");
const { shouldGenerateSeparately } = await import("../lib/copywriting-selection.ts");

const product = {
  promotionName: "鹤7 Pro",
  model: "65鹤7 Pro 26款",
  series: "鹤7 Pro 26款",
  sku: "SKU-HE7-65",
};

assert.equal(normaliseProductSearch(" 鹤 7-Pro / 26款 "), "鹤7pro26款");
assert.equal(deriveProductSeries({ promotionName: "65鹤7 PRO 26款" }), "鹤7 PRO 26款");
assert.equal(deriveProductSeries({ promotionName: "75英寸 鹤7 PRO 26款" }), "鹤7 PRO 26款");
assert.equal(deriveProductSeries({ series: "业务确认系列", promotionName: "65鹤7 PRO 26款" }), "业务确认系列");
assert.equal(normaliseProductSearch(deriveProductSeries({ promotionName: "65鹤7 PRO 26款" })), normaliseProductSearch(deriveProductSeries({ promotionName: "75鹤7 PRO 26款" })), "65/75 same series should share a grouping key");
assert.equal(deriveProductSeries({ promotionName: "鹤7 PRO 26款" }), "", "promotion names without a safe size prefix stay ungrouped");
assert.equal(deriveProductSeries({ model: "65鹤7 PRO 26款" }), "", "canonical model must never be used to guess a series");
assert.deepEqual(splitProductSearchTerms("鹤7 26"), ["鹤7", "26"]);
assert.deepEqual(splitProductSearchTerms("鹤6Ultra"), ["鹤6ultra"]);
assert(productMatchesSearch(product, "鹤7 26"), "space-separated terms should use AND matching");
assert(productMatchesSearch(product, "鹤7 65"), "terms may be found across promotion/model fields");
assert(productMatchesSearch({ series: "鹤6 Ultra", model: "65鹤6 Ultra 25款" }, "鹤6Ultra"), "unseparated query should remain contiguous matching");
assert(productMatchesSearch({ sku: "SKU-HE7-65" }, "sku he7 65"), "SKU separators and spaces should be ignored");
assert(!productMatchesSearch(product, "鹤8 26"), "unrelated series must not match");
assert(!productMatchesSearch(product, "鹤7 27"), "all terms are required");
assert(productMatchesSearch(product, "   "), "empty queries match the available list");
assert.equal(shouldGenerateSeparately("separate", 3, true), false, "series selection must stay as one campaign unit");
assert.equal(shouldGenerateSeparately("separate", 3, false), true, "explicit product multi-select may split by model");
assert.equal(shouldGenerateSeparately("merge", 3, false), false, "merge mode must remain one request");

console.log("product-search-regression: PASS");
