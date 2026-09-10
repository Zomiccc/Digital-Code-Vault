import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useMemo, useEffect, ReactNode } from 'react';
import { Search, ChevronRight, ArrowLeft, AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, Button, Badge } from '@/components/ui';
import { formatPrice } from '@/lib/utils';
import { familyOf } from '@/lib/product-family';

/**
 * Prices, edited where they live.
 *
 * Same shape as Inventory — brand, then region, then the things you sell — so
 * one mental model covers both. Everything on the last screen is editable: the
 * value of each code and the price of each pack, each in its own currency,
 * because a Saudi card is priced in riyals and not in converted dollars.
 */
export function PricesPage() {
  const [family, setFamily] = useState<string | null>(null);
  const [productId, setProductId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({ queryKey: ['skus'], queryFn: () => api.listSkus() });
  const products = data?.items || [];

  // familyOf expects the shape the stock endpoint uses, so map onto it.
  const withFamily = useMemo(
    () => products.map((product: any) => ({
      ...product,
      family: familyOf({ product_sku: product.sku, product: product.name }),
    })),
    [products],
  );

  if (productId) {
    const product = withFamily.find((entry: any) => entry.id === productId);
    if (product) {
      return <ProductPrices product={product} onBack={() => setProductId(null)} />;
    }
  }
  if (family) {
    return (
      <RegionList
        family={family}
        products={withFamily.filter((product: any) => product.family === family)}
        onBack={() => setFamily(null)}
        onOpen={setProductId}
      />
    );
  }
  return (
    <FamilyList products={withFamily} isLoading={isLoading} error={error} onOpen={setFamily} />
  );
}

function FamilyList({
  products, isLoading, error, onOpen,
}: { products: any[]; isLoading: boolean; error: unknown; onOpen: (family: string) => void }) {
  const [search, setSearch] = useState('');

  const families = useMemo(() => {
    const grouped = new Map<string, any[]>();
    for (const product of products) {
      if (!grouped.has(product.family)) grouped.set(product.family, []);
      grouped.get(product.family)!.push(product);
    }
    const term = search.trim().toLowerCase();
    return [...grouped.entries()]
      .map(([name, group]) => ({
        name,
        regions: group.length,
        items: group.reduce(
          (sum, product) => sum + product.denominations.length + (product.variants?.length || 0), 0),
      }))
      .filter((family) => !term || family.name.toLowerCase().includes(term))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [products, search]);

  return (
    <Shell
      title="Prices"
      subtitle="Pick a brand, then a region, to set what its codes and packs sell for."
      search={search}
      onSearch={setSearch}
      placeholder="Search brand..."
    >
      {!!error && (
        <p role="alert" className="text-destructive">Could not load prices. {(error as Error).message}</p>
      )}
      {isLoading && <p role="status" className="text-muted-foreground">Loading prices...</p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {families.map((family) => (
          <Tile
            key={family.name}
            title={family.name}
            subtitle={`${family.regions} region${family.regions === 1 ? '' : 's'}`}
            footer={`${family.items} priced item${family.items === 1 ? '' : 's'}`}
            onClick={() => onOpen(family.name)}
          />
        ))}
        {!isLoading && families.length === 0 && (
          <Card className="col-span-full py-12 text-center text-muted-foreground">
            No products found.
          </Card>
        )}
      </div>
    </Shell>
  );
}

function RegionList({
  family, products, onBack, onOpen,
}: { family: string; products: any[]; onBack: () => void; onOpen: (id: string) => void }) {
  const [search, setSearch] = useState('');
  const term = search.trim().toLowerCase();
  const shown = products
    .filter((product) => !term || `${product.name} ${product.region}`.toLowerCase().includes(term))
    .sort((a, b) => a.region.localeCompare(b.region));

  return (
    <Shell
      title={family}
      subtitle="Pick a region to edit its prices."
      onBack={onBack}
      backLabel="All brands"
      search={search}
      onSearch={setSearch}
      placeholder="Search region..."
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {shown.map((product) => (
          <Tile
            key={product.id}
            title={product.region}
            subtitle={product.name}
            footer={
              <>
                {product.denominations.length} value{product.denominations.length === 1 ? '' : 's'}
                {(product.variants?.length || 0) > 0 && `, ${product.variants.length} pack${product.variants.length === 1 ? '' : 's'}`}
              </>
            }
            onClick={() => onOpen(product.id)}
          />
        ))}
        {shown.length === 0 && (
          <Card className="col-span-full py-12 text-center text-muted-foreground">
            No regions found.
          </Card>
        )}
      </div>
    </Shell>
  );
}

/** The last screen: every price for one regional product, all editable. */
function ProductPrices({ product, onBack }: { product: any; onBack: () => void }) {
  const queryClient = useQueryClient();
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['skus'] });
    queryClient.invalidateQueries({ queryKey: ['denomination-stock'] });
    queryClient.invalidateQueries({ queryKey: ['catalog-hierarchy'] });
    queryClient.invalidateQueries({ queryKey: ['products'] });
  };

  return (
    <Shell
      title={`${product.name}`}
      subtitle={`${product.region} · set what each code value and pack sells for`}
      onBack={onBack}
      backLabel="All regions"
    >
      <Card className="border-primary/30 bg-primary/5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <p className="text-sm text-muted-foreground">
            These are selling prices, set per currency. What a batch cost you is separate and stays
            on the batch in its own currency. A merchant paying from a rupee balance is charged the
            rupee price set here; leave a currency blank and the item is simply not sold in it.
          </p>
        </div>
      </Card>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Code values</h2>
        {product.denominations.length === 0 && (
          <Card className="py-8 text-center text-muted-foreground">
            No code values on this product — it sells as packs only.
          </Card>
        )}
        {product.denominations.map((denomination: any) => (
          <PriceRow
            key={denomination.id}
            itemType="DENOMINATION"
            itemId={denomination.id}
            label={formatPrice(denomination.face_value, denomination.currency)}
            sku={denomination.sku}
            value={denomination.face_value}
            currency={denomination.currency}
            onSaved={refresh}
          />
        ))}
      </div>

      {(product.variants?.length || 0) > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Packs & subscriptions</h2>
          {product.variants.map((variant: any) => (
            <PriceRow
              key={variant.id}
              itemType="VARIANT"
              itemId={variant.id}
              label={variant.name}
              secondary={formatPrice(variant.price, variant.currency)}
              sku={variant.sku}
              value={variant.price}
              currency={variant.currency}
              onSaved={refresh}
            />
          ))}
        </div>
      )}
    </Shell>
  );
}

/** The currencies every item can be priced in. */
const SELLING_CURRENCIES = ['USD', 'PKR'] as const;

/**
 * The selling price for one item, in every currency the platform sells in.
 *
 * Cost lives on the batch, in whatever currency that batch was bought in. This
 * is the other side: what the item sells for, set independently per currency. A
 * $100 code can sell for $101 and for 27,500 rupees, and 27,500 is not 101 times
 * a rate — so each field is entered, never derived. A currency left blank means
 * the item is not sold in it: a merchant paying from that balance is turned
 * away rather than charged a guessed figure.
 */
function PriceRow({
  itemType, itemId, label, secondary, sku, value, currency, onSaved,
}: {
  itemType: 'DENOMINATION' | 'VARIANT';
  itemId: string;
  label: string; secondary?: string; sku?: string | null;
  value: number; currency: string;
  onSaved: () => void;
}) {
  const { data: prices, refetch } = useQuery({
    queryKey: ['selling-prices', itemType, itemId],
    queryFn: () => api.listSellingPrices(itemType, itemId),
  });

  const save = (currencyCode: string) => async (amount: number | null) => {
    if (amount === null) await api.removeSellingPrice(itemType, itemId, currencyCode);
    else await api.setSellingPrice(itemType, itemId, currencyCode, amount);
    await refetch();
    onSaved();
  };

  const priceFor = (code: string) =>
    (prices || []).find((row: any) => row.currency === code)?.amount ?? null;

  return (
    <Card className="space-y-3">
      <div>
        <p className="font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">
          {secondary && <span className="mr-2">{secondary}</span>}
          {sku ? <span className="font-mono">{sku}</span> : <span className="italic">no SKU</span>}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {SELLING_CURRENCIES.map((code) => (
          <CurrencyPriceField
            key={code}
            currency={code}
            amount={priceFor(code)}
            fallback={code === currency ? value : null}
            onSave={save(code)}
          />
        ))}
      </div>
    </Card>
  );
}

function CurrencyPriceField({
  currency, amount, fallback, onSave,
}: {
  currency: string;
  amount: number | null;
  fallback: number | null;
  onSave: (amount: number | null) => Promise<void>;
}) {
  const [draft, setDraft] = useState(amount === null ? '' : String(amount));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { setDraft(amount === null ? '' : String(amount)); }, [amount]);

  const parsed = Number(draft);
  const valid = draft.trim() !== '' && Number.isFinite(parsed) && parsed > 0;
  const dirty = draft.trim() !== (amount === null ? '' : String(amount));

  const commit = async (next: number | null) => {
    setSaving(true);
    try {
      await onSave(next);
      setError('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-1">
      <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {currency} price
      </label>
      <div className="flex items-center gap-2">
        <input
          type="number" min="0" step="0.01" value={draft}
          aria-label={`${currency} selling price`}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={fallback !== null ? String(fallback) : 'not set'}
          className="w-32 rounded border border-input bg-background px-2 py-1 text-sm"
        />
        {dirty && (
          <Button size="sm" disabled={!valid || saving} onClick={() => commit(parsed)}>Save</Button>
        )}
        {!dirty && amount !== null && (
          <Button size="sm" variant="ghost" disabled={saving} onClick={() => commit(null)}>Clear</Button>
        )}
      </div>
      {amount === null && (
        fallback !== null
          ? (
            <p className="text-xs text-muted-foreground">
              Not set — sells at its own value of {fallback}.
            </p>
          )
          : (
            <p className="text-xs text-amber-500">
              Not set — cannot be sold in {currency}.
            </p>
          )
      )}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function Shell({
  title, subtitle, onBack, backLabel, search, onSearch, placeholder, children,
}: {
  title: string; subtitle: string; onBack?: () => void; backLabel?: string;
  search?: string; onSearch?: (value: string) => void; placeholder?: string; children: ReactNode;
}) {
  return (
    <div className="space-y-6 animate-slide-up">
      {onBack && (
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" /> {backLabel || 'Back'}
        </Button>
      )}
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
      {onSearch && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={placeholder}
            className="w-full rounded-lg border border-input bg-background py-2.5 pl-10 pr-3 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
          />
        </div>
      )}
      {children}
    </div>
  );
}

function Tile({
  title, subtitle, footer, onClick,
}: { title: string; subtitle?: string; footer?: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group rounded-xl border border-border bg-card p-4 text-left transition-all hover:border-primary/40 hover:bg-muted/30"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium">{title}</p>
          {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </div>
      {footer && (
        <Badge className="mt-3 bg-muted text-muted-foreground">{footer}</Badge>
      )}
    </button>
  );
}
