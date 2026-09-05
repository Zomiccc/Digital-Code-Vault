import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useMemo, useEffect, ReactNode } from 'react';
import { Search, ChevronRight, ArrowLeft, AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, Button, Badge } from '@/components/ui';
import { formatPrice, isKnownCurrency } from '@/lib/utils';
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
      <Card className="border-amber-500/30 bg-amber-500/5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          <p className="text-sm text-muted-foreground">
            Changing a code value changes what codes already uploaded against it are worth, and a
            delivery rule that added up to the old value will no longer match. Both are shown to you
            rather than corrected silently.
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
            label={formatPrice(denomination.face_value, denomination.currency)}
            sku={denomination.sku}
            value={denomination.face_value}
            currency={denomination.currency}
            onSave={(amount, currency) =>
              api.updateDenomination(denomination.id, amount, currency)}
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
              label={variant.name}
              secondary={formatPrice(variant.price, variant.currency)}
              sku={variant.sku}
              value={variant.price}
              currency={variant.currency}
              onSave={(amount, currency) =>
                api.updateVariant(variant.id, { customerPrice: amount, currency })}
              onSaved={refresh}
            />
          ))}
        </div>
      )}
    </Shell>
  );
}

/** One editable price with its currency. */
function PriceRow({
  label, secondary, sku, value, currency, onSave, onSaved,
}: {
  label: string; secondary?: string; sku?: string | null;
  value: number; currency: string;
  onSave: (amount: number, currency: string) => Promise<any>;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState(String(Number(value)));
  const [code, setCode] = useState(currency);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setAmount(String(Number(value)));
    setCode(currency);
  }, [value, currency]);

  const parsed = Number(amount);
  const valid = Number.isFinite(parsed) && parsed > 0 && /^[A-Za-z]{3}$/.test(code.trim());
  const dirty = parsed !== Number(value) || code.toUpperCase() !== currency.toUpperCase();
  const unrecognised = /^[A-Za-z]{3}$/.test(code.trim()) && !isKnownCurrency(code);

  const save = async () => {
    setSaving(true);
    try {
      await onSave(parsed, code.trim().toUpperCase());
      setError('');
      onSaved();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="flex flex-wrap items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">
          {secondary && <span className="mr-2">{secondary}</span>}
          {sku ? <span className="font-mono">{sku}</span> : <span className="italic">no SKU</span>}
        </p>
      </div>
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-2">
          <input
            type="number" min="0" step="0.01" value={amount}
            aria-label={`Price for ${label}`}
            onChange={(e) => setAmount(e.target.value)}
            className="w-28 rounded border border-input bg-background px-2 py-1 text-sm"
          />
          <input
            value={code}
            aria-label={`Currency for ${label}`}
            onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 3))}
            className="w-16 rounded border border-input bg-background px-2 py-1 font-mono text-xs"
          />
          <Button size="sm" disabled={!valid || !dirty || saving} onClick={save}>Save</Button>
        </div>
        {unrecognised && (
          <span className="text-xs text-amber-500">
            {code.toUpperCase()} is not a currency code we recognise.
          </span>
        )}
        {error && <span role="alert" className="text-xs text-destructive">{error}</span>}
      </div>
    </Card>
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
