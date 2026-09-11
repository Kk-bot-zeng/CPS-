/**
 * A selected series is one campaign unit.  Only explicit product multi-select
 * can opt into per-model generation.
 */
export function shouldGenerateSeparately(mode: unknown, selectedProductCount: number, hasSelectedSeries: boolean) {
  return mode === "separate" && selectedProductCount > 1 && !hasSelectedSeries;
}
