/**
 * SKU generation for products. A SKU is the key that ties a DCV product to the
 * same product in a merchant storefront, so incoming orders match automatically.
 * Generation is deterministic: the same name and region always yield the same base.
 */
// Keys are matched case-insensitively against the full product name.
// If a product name doesn't match any entry, a fallback is generated.
const PRODUCT_SKU_MAP: Record<string, string> = {
  'psn ksa digital code': 'PSN-KSA',
  'psn ca digital code': 'PSN-CA',
  'psn au digital code': 'PSN-GLO',
  'psn hk digital code': 'PSN-GLO-1',
  'psn qa digital code': 'PSN-GLO-2',
  'psn in digital code': 'PSN-GLO-3',
  'xbox usa gift card': 'XBOX-USA',
  'xbox game pass subscriptions': 'XBOX-USA-1',
  'itunes usa gift card': 'ITUNES-USA',
  'nintendo eshop usa': 'NINTENDO-USA',
  'nintendo switch online membership': 'NINTENDO-USA-1',
  'steam usa wallet code': 'STEAM-USA',
  'google play usa gift card': 'GOOGLE-USA',
  'pubg uc — pakistan region': 'PUBG-PK',
  'pubg uc — other regions': 'PUBG-GLO',
  'pubg uc - pakistan region': 'PUBG-PK',
  'pubg uc - other regions': 'PUBG-GLO',
  'nord vpn subscription': 'NVS-GLO',
  'ms office pro plus keys': 'MOPP-GLO',
  'windows 11 pro key': 'WPK-GLO',
  'razer gold usa': 'RGU-USA',
  'roblox robux': 'ROBLOX-USA',
  'fortnite v-bucks usa': 'FORNITE-USA',
};

// Fuzzy keyword-based fallback mapping for products not in the exact map
const KEYWORD_SKU_MAP: { keywords: string[]; prefix: string }[] = [
  { keywords: ['playstation', 'psn'], prefix: 'PSN' },
  { keywords: ['itunes', 'apple'], prefix: 'ITUNES' },
  { keywords: ['google play'], prefix: 'GOOGLE' },
  { keywords: ['steam'], prefix: 'STEAM' },
  { keywords: ['xbox'], prefix: 'XBOX' },
  { keywords: ['nintendo', 'eshop'], prefix: 'NINTENDO' },
  { keywords: ['roblox'], prefix: 'ROBLOX' },
  { keywords: ['fortnite', 'v-bucks', 'vbucks'], prefix: 'FORNITE' },
  { keywords: ['pubg'], prefix: 'PUBG' },
  { keywords: ['netflix'], prefix: 'NETFLIX' },
  { keywords: ['spotify'], prefix: 'SPOTIFY' },
  { keywords: ['amazon'], prefix: 'AMAZON' },
  { keywords: ['razer'], prefix: 'RAZER' },
  { keywords: ['nord vpn', 'nordvpn'], prefix: 'NVS' },
  { keywords: ['office', 'msoffice'], prefix: 'MOPP' },
  { keywords: ['windows'], prefix: 'WPK' },
];

export function resolveProductSkuBase(name: string, region: string): string {
  const lower = name.toLowerCase().trim();

  // 1. Exact match against the user-defined map
  if (PRODUCT_SKU_MAP[lower]) {
    return PRODUCT_SKU_MAP[lower];
  }

  // 2. Keyword-based fallback
  for (const entry of KEYWORD_SKU_MAP) {
    if (entry.keywords.some((kw) => lower.includes(kw))) {
      const regionCode = (region || 'GLO').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) || 'GLO';
      return `${entry.prefix}-${regionCode}`;
    }
  }

  // 3. Generic fallback: first letters of each word + region
  const words = name.toUpperCase().replace(/[^A-Z\s]/g, '').split(/\s+/).filter(Boolean);
  const regionCode = (region || 'GLO').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) || 'GLO';
  if (words.length === 1) {
    return `${words[0].slice(0, 4)}-${regionCode}`;
  }
  return `${words.map((w) => w[0]).join('').slice(0, 4)}-${regionCode}`;
}

/** Normalise a SKU the way lookups compare them: trimmed, upper case. */
export function normaliseSku(sku: string): string {
  return sku.trim().toUpperCase().replace(/\s+/g, '-');
}

/**
 * A SKU must be unique across products, so a collision gets a numeric suffix.
 * `taken` holds already-used SKUs in any casing.
 */
export function uniqueSku(base: string, taken: Iterable<string>): string {
  const used = new Set([...taken].map((sku) => normaliseSku(sku)));
  const candidate = normaliseSku(base);
  if (!used.has(candidate)) return candidate;
  let suffix = 1;
  while (used.has(normaliseSku(`${base}-${suffix}`))) suffix++;
  return normaliseSku(`${base}-${suffix}`);
}

/** The per-denomination SKU derived from a product SKU, e.g. PSN-KSA-10. */
export function denominationSku(productSku: string, faceValue: number): string {
  return `${normaliseSku(productSku)}-${faceValue}`;
}
