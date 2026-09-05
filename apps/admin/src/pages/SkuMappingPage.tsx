import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { Search, Wand2, RefreshCw, ChevronRight, ChevronDown } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, Button, Badge } from '@/components/ui';

/**
 * Every SKU in one place: the product SKU and each denomination's sub-product
 * SKU. A SKU is what an incoming storefront order is matched against, so each
 * one is editable here and each must be unique.
 */
export function SkuMappingPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [error, setError] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading } = useQuery({
    queryKey: ['skus', debounced],
    queryFn: () => api.listSkus(debounced),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['skus'] });

  const generate = useMutation({
    mutationFn: () => api.generateMissingSkus(),
    onSuccess: () => { setError(''); refresh(); },
    onError: (err: any) => setError(err.message),
  });

  const products = data?.items || [];
  const missingCount = products.reduce(
    (total: number, product: any) =>
      total + (product.sku ? 0 : 1) + product.denominations.filter((d: any) => !d.sku).length,
    0,
  );

  return (
    <div className="space-y-6 animate-slide-up">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">SKU</h1>
          <p className="text-sm text-muted-foreground">
            The code that connects a product here to the same product in your store. Orders arriving
            with a matching SKU are fulfilled automatically.
          </p>
        </div>
        <Button onClick={() => generate.mutate()} disabled={generate.isPending || missingCount === 0}>
          <Wand2 className="mr-2 h-4 w-4" />
          {missingCount > 0 ? `Generate ${missingCount} missing` : 'All SKUs set'}
        </Button>
      </div>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {generate.isSuccess && generate.data?.assigned_count > 0 && (
        <Card className="border-emerald-500/20">
          <p className="text-sm">
            Generated {generate.data.assigned_count} SKU
            {generate.data.assigned_count === 1 ? '' : 's'}.
          </p>
        </Card>
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search product, region or SKU..."
          className="w-full rounded-lg border border-input bg-background py-2.5 pl-10 pr-3 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
        />
      </div>

      {isLoading && <p role="status" className="text-muted-foreground">Loading SKUs...</p>}

      <div className="space-y-3">
        {products.map((product: any) => {
          const open = expanded[product.id] ?? false;
          const missingHere = product.denominations.filter((d: any) => !d.sku).length;
          return (
            <Card key={product.id} className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  className="flex items-center gap-2 text-left"
                  onClick={() => setExpanded({ ...expanded, [product.id]: !open })}
                  aria-expanded={open}
                >
                  {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  <span>
                    <span className="font-semibold">{product.name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{product.region}</span>
                  </span>
                </button>
                <div className="flex items-center gap-2">
                  {product.denominations.length > 0 && (
                    <Badge className="bg-muted text-muted-foreground">
                      {product.denominations.length} sub-product
                      {product.denominations.length === 1 ? '' : 's'}
                      {missingHere > 0 && ` · ${missingHere} without SKU`}
                    </Badge>
                  )}
                  <SkuField
                    value={product.sku}
                    suggestion={product.suggested_sku}
                    label={`Product SKU for ${product.name}`}
                    onSave={(sku) => api.setProductSku(product.id, sku)}
                    onSaved={refresh}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    title="Rebuild the sub-product SKUs from this product SKU"
                    onClick={() => api.resyncDenominationSkus(product.id).then(refresh).catch((e) => setError(e.message))}
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {open && (
                <div className="space-y-2 border-t border-border pt-3">
                  {product.denominations.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      No denominations on this product — it is sold as variants only.
                    </p>
                  )}
                  {product.denominations.map((denomination: any) => (
                    <div key={denomination.id} className="flex items-center justify-between gap-3">
                      <span className="text-sm">
                        ${denomination.face_value}
                        <span className="ml-2 text-xs text-muted-foreground">{denomination.currency}</span>
                      </span>
                      <SkuField
                        value={denomination.sku}
                        suggestion={denomination.suggested_sku}
                        label={`SKU for ${product.name} ${denomination.face_value}`}
                        onSave={(sku) => api.setDenominationSku(denomination.id, sku)}
                        onSaved={refresh}
                      />
                    </div>
                  ))}
                </div>
              )}
            </Card>
          );
        })}
        {!isLoading && products.length === 0 && (
          <Card className="py-12 text-center text-muted-foreground">No products found.</Card>
        )}
      </div>
    </div>
  );
}

/** An inline SKU editor that offers the generated value when none is set. */
function SkuField({
  value, suggestion, label, onSave, onSaved,
}: {
  value: string | null;
  suggestion: string;
  label: string;
  onSave: (sku: string | null) => Promise<any>;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState(value || '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { setDraft(value || ''); }, [value]);

  const dirty = draft.trim() !== (value || '');
  const save = async (next: string | null) => {
    setSaving(true);
    try {
      await onSave(next);
      setError('');
      onSaved();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1">
        <input
          value={draft}
          aria-label={label}
          onChange={(e) => setDraft(e.target.value.toUpperCase())}
          placeholder={suggestion}
          className="w-44 rounded border border-input bg-background px-2 py-1 font-mono text-xs"
        />
        {dirty ? (
          <Button size="sm" disabled={saving} onClick={() => save(draft.trim() || null)}>Save</Button>
        ) : !value ? (
          <Button size="sm" variant="outline" disabled={saving} onClick={() => save(suggestion)}>
            Use {suggestion}
          </Button>
        ) : null}
      </div>
      {error && <span role="alert" className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
