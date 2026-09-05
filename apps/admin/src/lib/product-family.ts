/**
 * The family a product belongs to — "PlayStation" for every PSN region.
 *
 * Real catalogue data is preferred: if the product's category has a brand, that
 * brand is the family, and the category name is the next best thing. Neither is
 * guaranteed to be filled in, so the SKU prefix is the reliable fallback, mapped
 * to a proper label because "PSN" is the code, not the name people read.
 */
const SKU_PREFIX_LABELS: Record<string, string> = {
  PSN: 'PlayStation',
  XBOX: 'Xbox',
  ITUNES: 'iTunes / Apple',
  NINTENDO: 'Nintendo',
  STEAM: 'Steam',
  GOOGLE: 'Google Play',
  PUBG: 'PUBG',
  ROBLOX: 'Roblox',
  FORNITE: 'Fortnite',
  RAZER: 'Razer Gold',
  RGU: 'Razer Gold',
  NVS: 'Nord VPN',
  MOPP: 'MS Office',
  WPK: 'Windows',
  NETFLIX: 'Netflix',
  SPOTIFY: 'Spotify',
  AMAZON: 'Amazon',
};

/** A row from the denomination-stock endpoint. */
type StockRow = {
  brand?: string | null;
  category?: string | null;
  product_sku?: string | null;
  product: string;
};

export function familyOf(row: StockRow): string {
  if (row.brand) return row.brand;
  if (row.category) return row.category;

  const prefix = (row.product_sku || '').split('-')[0].toUpperCase();
  if (prefix && SKU_PREFIX_LABELS[prefix]) return SKU_PREFIX_LABELS[prefix];
  if (prefix) return prefix;

  // No SKU either: the first word of the name is the best available grouping.
  return row.product.split(/\s+/)[0] || 'Other';
}
