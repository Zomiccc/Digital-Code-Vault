import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useMemo, useEffect } from 'react';
import { Plus, Trash2, Search, AlertTriangle, CheckCircle2, Package, Pencil } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, Button, Input, Badge, Modal } from '@/components/ui';
import { formatPrice } from '@/lib/utils';

/**
 * Delivery rules.
 *
 * One rule answers one question: when a customer buys this item, which codes do
 * we hand over? The old screen buried that behind three dependent dropdowns and
 * words like "combination" and "priority"; this one lists every item you sell
 * with its rule visible, and says plainly when an item has no rule and would
 * therefore fail to deliver.
 */
export function FulfillmentPresetsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<any>(null);

  const { data: hierarchy, isLoading: loadingCatalog } = useQuery({
    queryKey: ['catalog-hierarchy'],
    queryFn: api.getCatalogHierarchy,
  });
  const { data: rules, isLoading: loadingRules } = useQuery({
    queryKey: ['all-combinations'],
    queryFn: () => api.listCombinations(),
  });

  // Every sellable item, flattened out of the catalogue tree with its product,
  // region, denominations and whatever rules currently point at it.
  const items = useMemo(() => {
    const byVariant = new Map<string, any[]>();
    for (const rule of rules || []) {
      if (!byVariant.has(rule.variantId)) byVariant.set(rule.variantId, []);
      byVariant.get(rule.variantId)!.push(rule);
    }

    const flat: any[] = [];
    for (const category of hierarchy || []) {
      for (const product of category.products || []) {
        for (const productRegion of product.productRegions || []) {
          for (const variant of productRegion.variants || []) {
            flat.push({
              variant,
              product,
              region: productRegion.region,
              denominations: product.denominations || [],
              rules: byVariant.get(variant.id) || [],
            });
          }
        }
      }
    }

    const term = search.trim().toLowerCase();
    return flat
      .filter((item) =>
        !term ||
        `${item.variant.name} ${item.product.name} ${item.region?.code ?? ''}`.toLowerCase().includes(term))
      .sort((a, b) =>
        a.product.name.localeCompare(b.product.name) || a.variant.name.localeCompare(b.variant.name));
  }, [hierarchy, rules, search]);

  const missing = items.filter((item) => !item.rules.some((rule: any) => rule.active)).length;
  const loading = loadingCatalog || loadingRules;

  return (
    <div className="space-y-6 animate-slide-up">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Delivery rules</h1>
        <p className="text-sm text-muted-foreground">
          For each thing you sell, which codes get delivered when someone buys it. An item with no
          rule cannot be delivered.
        </p>
      </div>

      {missing > 0 && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
            <div>
              <p className="font-semibold">
                {missing} item{missing === 1 ? '' : 's'} cannot be delivered
              </p>
              <p className="text-sm text-muted-foreground">
                Orders for these will fail until you set a rule. They are marked below.
              </p>
            </div>
          </div>
        </Card>
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search item, product or region..."
          className="w-full rounded-lg border border-input bg-background py-2.5 pl-10 pr-3 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
        />
      </div>

      {loading && <p role="status" className="text-muted-foreground">Loading...</p>}

      <div className="space-y-3">
        {items.map((item) => (
          <ItemRow
            key={item.variant.id}
            item={item}
            onEdit={() => setEditing(item)}
            onPriceSaved={() => {
              queryClient.invalidateQueries({ queryKey: ['catalog-hierarchy'] });
              queryClient.invalidateQueries({ queryKey: ['all-combinations'] });
            }}
          />
        ))}
        {!loading && items.length === 0 && (
          <Card className="py-12 text-center text-muted-foreground">
            Nothing to configure yet. Items appear here once a product has variants.
          </Card>
        )}
      </div>

      {editing && (
        <RuleEditor
          item={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['all-combinations'] });
            queryClient.invalidateQueries({ queryKey: ['catalog-hierarchy'] });
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

/** One sellable item and, in plain words, what it delivers. */
function ItemRow({ item, onEdit, onPriceSaved }: { item: any; onEdit: () => void; onPriceSaved: () => void }) {
  const active = item.rules.filter((rule: any) => rule.active);
  const main = active[0];
  const deliverable = !!main;

  return (
    <Card className={deliverable ? '' : 'border-amber-500/40'}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{item.variant.name}</h3>
            <Badge className="bg-muted text-muted-foreground">
              {item.product.name} · {item.region?.code || item.product.region}
            </Badge>
            <PriceEditor item={item} onSaved={onPriceSaved} />
          </div>

          {deliverable ? (
            <div className="mt-2 space-y-1">
              <p className="text-sm">
                <span className="text-muted-foreground">Delivers </span>
                <span className="font-medium">{describe(main)}</span>
                {main.fulfillable ? (
                  <span className="ml-2 inline-flex items-center gap-1 text-xs text-emerald-500">
                    <CheckCircle2 className="h-3.5 w-3.5" /> in stock
                  </span>
                ) : (
                  <span className="ml-2 inline-flex items-center gap-1 text-xs text-amber-500">
                    <AlertTriangle className="h-3.5 w-3.5" /> not enough stock
                  </span>
                )}
              </p>
              {active.slice(1).map((rule: any) => (
                <p key={rule.id} className="text-xs text-muted-foreground">
                  or, if that runs out: {describe(rule)}
                </p>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-amber-500">
              No rule set — an order for this would fail.
            </p>
          )}
        </div>

        <Button variant={deliverable ? 'outline' : 'primary'} onClick={onEdit}>
          {deliverable ? 'Change' : 'Set rule'}
        </Button>
      </div>
    </Card>
  );
}

/** "$10 × 1 + $20 × 1" */
function describe(rule: any): string {
  if (!rule.items?.length) return 'nothing';
  return rule.items
    .map((item: any) => {
      const value = formatPrice(item.denomination?.faceValue ?? 0, item.denomination?.currency);
      return item.quantity > 1 ? `${value} × ${item.quantity}` : value;
    })
    .join(' + ');
}

/**
 * Build a rule by picking how many of each code value to hand over. The running
 * total is checked against the item's price, because the backend requires them
 * to match and a mismatch is the usual reason saving fails.
 */
function RuleEditor({ item, onClose, onSaved }: { item: any; onClose: () => void; onSaved: () => void }) {
  const existing = item.rules.find((rule: any) => rule.active) || item.rules[0];
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [error, setError] = useState('');

  useEffect(() => {
    const initial: Record<string, number> = {};
    for (const line of existing?.items || []) {
      initial[line.denominationId] = line.quantity;
    }
    setQuantities(initial);
  }, [existing?.id]);

  const price = Number(item.variant.customerPrice);
  const chosen = item.denominations
    .map((denomination: any) => ({ denomination, quantity: quantities[denomination.id] || 0 }))
    .filter((line: any) => line.quantity > 0);
  const totalValue = chosen.reduce(
    (sum: number, line: any) => sum + Number(line.denomination.faceValue) * line.quantity, 0);
  // Kept only to describe the rule, never to block saving it.
  const matches = Math.abs(totalValue - price) < 0.005;

  const save = useMutation({
    mutationFn: async () => {
      const items = chosen.map((line: any) => ({
        denominationId: line.denomination.id,
        quantity: line.quantity,
      }));
      if (existing) {
        return api.updateCombination(existing.id, { items, active: true });
      }
      return api.createCombination({
        variantId: item.variant.id,
        name: `${item.variant.name} delivery`,
        priority: 1,
        active: true,
        items,
      });
    },
    onSuccess: onSaved,
    onError: (err: any) => setError(err.message),
  });

  const remove = useMutation({
    mutationFn: () => api.deleteCombination(existing.id),
    onSuccess: onSaved,
    onError: (err: any) => setError(err.message),
  });

  const step = (denominationId: string, delta: number) =>
    setQuantities((current) => {
      const next = Math.max(0, (current[denominationId] || 0) + delta);
      return { ...current, [denominationId]: next };
    });

  return (
    <Modal open onClose={onClose} title={`When someone buys "${item.variant.name}"`} size="lg">
      <div className="space-y-5">
        <p className="text-sm text-muted-foreground">
          Choose which codes to hand over when someone buys this. The codes do not have to add up
          to the shelf price of{' '}
          <span className="font-medium text-foreground">
            {formatPrice(price, item.variant.currency)}
          </span>{' '}
          — a subscription is priced independently of the cards behind it. The merchant wallet is
          charged the value of the codes actually delivered.
        </p>

        {item.denominations.length === 0 ? (
          <Card className="border-amber-500/40 bg-amber-500/5">
            <div className="flex items-start gap-3">
              <Package className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
              <p className="text-sm">
                <span className="font-medium">{item.product.name}</span> has no code values yet. Add
                denominations to the product first, then set the rule here.
              </p>
            </div>
          </Card>
        ) : (
          <div className="space-y-2">
            {item.denominations.map((denomination: any) => {
              const quantity = quantities[denomination.id] || 0;
              return (
                <div
                  key={denomination.id}
                  className={`flex items-center justify-between rounded-lg border p-3 ${
                    quantity > 0 ? 'border-primary/40 bg-primary/5' : 'border-border'
                  }`}
                >
                  <span className="font-medium">
                    {formatPrice(denomination.faceValue, denomination.currency)}
                    <span className="ml-2 text-xs text-muted-foreground">{denomination.currency}</span>
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline" size="sm"
                      aria-label={`One fewer ${formatPrice(denomination.faceValue, denomination.currency)} code`}
                      disabled={quantity === 0}
                      onClick={() => step(denomination.id, -1)}
                    >
                      −
                    </Button>
                    <span className="w-8 text-center tabular-nums">{quantity}</span>
                    <Button
                      variant="outline" size="sm"
                      aria-label={`One more ${formatPrice(denomination.faceValue, denomination.currency)} code`}
                      onClick={() => step(denomination.id, 1)}
                    >
                      +
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="rounded-lg bg-muted p-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Delivering</span>
            <span className="font-medium">{chosen.length ? describeLines(chosen) : 'nothing yet'}</span>
          </div>
          <div className="mt-1 flex items-center justify-between">
            <span className="text-muted-foreground">Merchant wallet charged</span>
            <span className="font-semibold">{formatPrice(totalValue, item.variant.currency)}</span>
          </div>
          <div className="mt-1 flex items-center justify-between">
            <span className="text-muted-foreground">Shelf price</span>
            <span>{formatPrice(price, item.variant.currency)}</span>
          </div>
        </div>

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
          {existing && (
            <Button
              variant="outline"
              disabled={remove.isPending}
              onClick={() => remove.mutate()}
              title="Remove this rule — the item can no longer be delivered"
            >
              <Trash2 className="mr-2 h-4 w-4" /> Remove rule
            </Button>
          )}
          <Button
            className="flex-1"
            disabled={chosen.length === 0 || save.isPending}
            onClick={() => save.mutate()}
          >
            <Plus className="mr-2 h-4 w-4" />
            {save.isPending ? 'Saving...' : existing ? 'Save rule' : 'Create rule'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function describeLines(chosen: { denomination: any; quantity: number }[]): string {
  return chosen
    .map(({ denomination, quantity }) => {
      const value = formatPrice(denomination.faceValue, denomination.currency);
      return quantity > 1 ? `${value} × ${quantity}` : value;
    })
    .join(' + ');
}

/**
 * The price of one item, editable in place.
 *
 * The seed gave every region the same US dollar price, so a Saudi item read
 * "$9.99" when it should be priced in riyals. The currency defaults to the
 * region's own, and both the amount and the currency are editable, because only
 * the operator knows what an item actually sells for locally.
 *
 * A rule's codes must add up to this price, so changing it can leave an existing
 * rule mismatched — that shows up as a warning in the rule editor rather than
 * being silently corrected, since which side is wrong is the operator's call.
 */
function PriceEditor({ item, onSaved }: { item: any; onSaved: () => void }) {
  const regionCurrency = item.region?.currency || item.variant.currency || 'USD';
  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState(String(Number(item.variant.customerPrice)));
  const [currency, setCurrency] = useState(item.variant.currency || regionCurrency);
  const [error, setError] = useState('');

  useEffect(() => {
    setPrice(String(Number(item.variant.customerPrice)));
    setCurrency(item.variant.currency || regionCurrency);
  }, [item.variant.id, item.variant.customerPrice, item.variant.currency, regionCurrency]);

  const amount = Number(price);
  const valid = Number.isFinite(amount) && amount > 0 && /^[A-Za-z]{3}$/.test(currency.trim());

  const save = useMutation({
    mutationFn: () => api.updateVariant(item.variant.id, {
      customerPrice: amount,
      currency: currency.trim().toUpperCase(),
    }),
    onSuccess: () => { setError(''); setOpen(false); onSaved(); },
    onError: (err: any) => setError(err.message),
  });

  const mismatched = (item.variant.currency || 'USD') !== regionCurrency;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Edit this price"
        className="group/price inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        {formatPrice(item.variant.customerPrice, item.variant.currency)}
        {mismatched && (
          <span className="text-xs text-amber-500" title={`This region prices in ${regionCurrency}`}>
            (not {regionCurrency})
          </span>
        )}
        <Pencil className="h-3 w-3 opacity-0 transition-opacity group-hover/price:opacity-100" />
      </button>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <input
        type="number" min="0" step="0.01" value={price}
        aria-label={`Price for ${item.variant.name}`}
        onChange={(e) => setPrice(e.target.value)}
        className="w-24 rounded border border-input bg-background px-2 py-1 text-sm"
      />
      <input
        value={currency}
        aria-label={`Currency for ${item.variant.name}`}
        onChange={(e) => setCurrency(e.target.value.toUpperCase().slice(0, 3))}
        className="w-16 rounded border border-input bg-background px-2 py-1 font-mono text-xs"
      />
      {currency !== regionCurrency && (
        <button
          type="button"
          className="rounded border border-input px-2 py-1 text-xs hover:bg-muted"
          onClick={() => setCurrency(regionCurrency)}
        >
          Use {regionCurrency}
        </button>
      )}
      <Button size="sm" disabled={!valid || save.isPending} onClick={() => save.mutate()}>Save</Button>
      <Button size="sm" variant="ghost" onClick={() => { setOpen(false); setError(''); }}>Cancel</Button>
      {error && <span role="alert" className="text-xs text-destructive">{error}</span>}
    </span>
  );
}
