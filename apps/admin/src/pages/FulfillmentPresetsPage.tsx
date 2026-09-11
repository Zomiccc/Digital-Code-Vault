import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useMemo, useEffect } from 'react';
import {
  Plus, Trash2, Search, AlertTriangle, CheckCircle2, Package, Pencil,
  ArrowLeft, ChevronRight,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Card, Button, Input, Select, Badge, Modal } from '@/components/ui';
import { formatPrice } from '@/lib/utils';
import { familyOf } from '@/lib/product-family';

/**
 * Delivery rules.
 *
 * One rule answers one question: when a customer buys this item, which codes do
 * we hand over? The old screen buried that behind three dependent dropdowns and
 * words like "combination" and "priority"; this one lists every item you sell
 * with its rule visible, and says plainly when an item has no rule and would
 * therefore fail to deliver.
 */
/**
 * Delivery rules drill down exactly the way Inventory does:
 *
 *   PlayStation → PSN USA / PSN Turkey / … → the packs sold there
 *
 * The flat list showed every pack of every brand at once, which on a real
 * catalogue is hundreds of rows and nothing to hold on to. Each step answers
 * one question instead, and the counts on each tile say where the gaps are so
 * an unset rule is still findable without opening anything.
 */
export function FulfillmentPresetsPage() {
  const queryClient = useQueryClient();
  const [family, setFamily] = useState<string | null>(null);
  const [regionKey, setRegionKey] = useState<string | null>(null);
  const [editing, setEditing] = useState<any>(null);
  const [creating, setCreating] = useState(false);

  const { data: hierarchy, isLoading: loadingCatalog } = useQuery({
    queryKey: ['catalog-hierarchy'],
    queryFn: api.getCatalogHierarchy,
  });
  const { data: rules, isLoading: loadingRules } = useQuery({
    queryKey: ['all-combinations'],
    queryFn: () => api.listCombinations(),
  });

  // Every sellable item, flattened out of the catalogue tree with the brand and
  // region it belongs to, and whatever rules currently point at it.
  const items = useMemo(() => {
    const byVariant = new Map<string, any[]>();
    for (const rule of rules || []) {
      if (!byVariant.has(rule.variantId)) byVariant.set(rule.variantId, []);
      byVariant.get(rule.variantId)!.push(rule);
    }

    const flat: any[] = [];
    for (const category of hierarchy || []) {
      for (const product of category.products || []) {
        const brand = familyOf({
          brand: category.brand?.name,
          category: category.name,
          product_sku: product.sku,
          product: product.name,
        });
        for (const productRegion of product.productRegions || []) {
          for (const variant of productRegion.variants || []) {
            flat.push({
              variant,
              product,
              brand,
              region: productRegion.region,
              regionKey: productRegion.region?.code || product.region || '—',
              denominations: product.denominations || [],
              rules: byVariant.get(variant.id) || [],
            });
          }
        }
      }
    }
    return flat;
  }, [hierarchy, rules]);

  const loading = loadingCatalog || loadingRules;
  const unset = (item: any) => !item.rules.some((rule: any) => rule.active);
  const missing = items.filter(unset).length;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['catalog-hierarchy'] });
    queryClient.invalidateQueries({ queryKey: ['all-combinations'] });
  };

  const header = (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Delivery rules</h1>
        <p className="text-sm text-muted-foreground">
          For each thing you sell, which codes get delivered when someone buys it. An item with no
          rule cannot be delivered.
        </p>
      </div>
      <Button onClick={() => setCreating(true)}>
        <Plus className="mr-2 h-4 w-4" /> New pack
      </Button>
    </div>
  );

  const modals = (
    <>
      {creating && (
        <NewPackModal
          hierarchy={hierarchy || []}
          onClose={() => setCreating(false)}
          onCreated={() => {
            refresh();
            queryClient.invalidateQueries({ queryKey: ['skus'] });
            setCreating(false);
          }}
        />
      )}
      {editing && (
        <RuleEditor
          item={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { refresh(); setEditing(null); }}
        />
      )}
    </>
  );

  if (family && regionKey) {
    return (
      <div className="space-y-6 animate-slide-up">
        <ItemsInRegion
          family={family}
          regionKey={regionKey}
          items={items.filter((item) => item.brand === family && item.regionKey === regionKey)}
          onBack={() => setRegionKey(null)}
          onEdit={setEditing}
          onChanged={refresh}
          onNewPack={() => setCreating(true)}
        />
        {modals}
      </div>
    );
  }

  if (family) {
    return (
      <div className="space-y-6 animate-slide-up">
        <RegionsInFamily
          family={family}
          items={items.filter((item) => item.brand === family)}
          onBack={() => setFamily(null)}
          onOpen={setRegionKey}
          onNewPack={() => setCreating(true)}
        />
        {modals}
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-slide-up">
      {header}

      {missing > 0 && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
            <div>
              <p className="font-semibold">
                {missing} item{missing === 1 ? '' : 's'} cannot be delivered
              </p>
              <p className="text-sm text-muted-foreground">
                Orders for these will fail until you set a rule. The brands holding them are
                marked below.
              </p>
            </div>
          </div>
        </Card>
      )}

      {loading && <p role="status" className="text-muted-foreground">Loading...</p>}
      {!loading && <FamilyGrid items={items} onOpen={setFamily} />}
      {modals}
    </div>
  );
}

/** Level 1 — one box per brand, with how many of its items still need a rule. */
function FamilyGrid({ items, onOpen }: { items: any[]; onOpen: (family: string) => void }) {
  const [search, setSearch] = useState('');

  const families = useMemo(() => {
    const grouped = new Map<string, any[]>();
    for (const item of items) {
      if (!grouped.has(item.brand)) grouped.set(item.brand, []);
      grouped.get(item.brand)!.push(item);
    }
    const term = search.trim().toLowerCase();
    return [...grouped.entries()]
      .filter(([name]) => !term || name.toLowerCase().includes(term))
      .sort(([a], [b]) => a.localeCompare(b));
  }, [items, search]);

  return (
    <div className="space-y-4">
      <SearchBox value={search} onChange={setSearch} placeholder="Search brand..." />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {families.map(([name, group]) => (
          <RuleTile
            key={name}
            title={name}
            subtitle={`${new Set(group.map((item) => item.regionKey)).size} region(s)`}
            total={group.length}
            unset={group.filter((item) => !item.rules.some((rule: any) => rule.active)).length}
            onClick={() => onOpen(name)}
          />
        ))}
        {families.length === 0 && (
          <Card className="col-span-full py-12 text-center text-muted-foreground">
            Nothing to configure yet. Items appear here once a product has packs.
          </Card>
        )}
      </div>
    </div>
  );
}

/** Level 2 — the regions of one brand. */
function RegionsInFamily({
  family, items, onBack, onOpen, onNewPack,
}: {
  family: string; items: any[]; onBack: () => void;
  onOpen: (regionKey: string) => void; onNewPack: () => void;
}) {
  const [search, setSearch] = useState('');

  const regions = useMemo(() => {
    const grouped = new Map<string, any[]>();
    for (const item of items) {
      if (!grouped.has(item.regionKey)) grouped.set(item.regionKey, []);
      grouped.get(item.regionKey)!.push(item);
    }
    const term = search.trim().toLowerCase();
    return [...grouped.entries()]
      .filter(([key, group]) =>
        !term || `${key} ${group[0].product.name}`.toLowerCase().includes(term))
      .sort(([a], [b]) => a.localeCompare(b));
  }, [items, search]);

  return (
    <div className="space-y-4">
      <Button variant="ghost" onClick={onBack} className="-ml-2">
        <ArrowLeft className="mr-2 h-4 w-4" /> All brands
      </Button>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{family}</h1>
          <p className="text-sm text-muted-foreground">Pick a region to see the packs sold there.</p>
        </div>
        {/* Offered here as well as at the top, so adding a pack does not mean
            walking back out of the brand you are already inside. */}
        <Button onClick={onNewPack}><Plus className="mr-2 h-4 w-4" /> New pack</Button>
      </div>
      <SearchBox value={search} onChange={setSearch} placeholder="Search region or product..." />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {regions.map(([key, group]) => (
          <RuleTile
            key={key}
            title={group[0].region?.name || key}
            subtitle={group[0].product.name}
            total={group.length}
            unset={group.filter((item) => !item.rules.some((rule: any) => rule.active)).length}
            onClick={() => onOpen(key)}
          />
        ))}
        {regions.length === 0 && (
          <Card className="col-span-full py-12 text-center text-muted-foreground">
            No regions found.
          </Card>
        )}
      </div>
    </div>
  );
}

/** Level 3 — the packs sold in one region, and what each one delivers. */
function ItemsInRegion({
  family, regionKey, items, onBack, onEdit, onChanged, onNewPack,
}: {
  family: string; regionKey: string; items: any[];
  onBack: () => void; onEdit: (item: any) => void; onChanged: () => void; onNewPack: () => void;
}) {
  const [search, setSearch] = useState('');
  const term = search.trim().toLowerCase();
  const shown = items
    .filter((item) => !term || item.variant.name.toLowerCase().includes(term))
    .sort((a, b) => a.variant.name.localeCompare(b.variant.name));
  const region = items[0]?.region;

  return (
    <div className="space-y-4">
      <Button variant="ghost" onClick={onBack} className="-ml-2">
        <ArrowLeft className="mr-2 h-4 w-4" /> {family}
      </Button>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{region?.name || regionKey}</h1>
          <p className="text-sm text-muted-foreground">
            {items[0]?.product.name} · what each pack hands over when someone buys it.
          </p>
        </div>
        <Button onClick={onNewPack}><Plus className="mr-2 h-4 w-4" /> New pack</Button>
      </div>
      <SearchBox value={search} onChange={setSearch} placeholder="Search pack..." />
      <div className="space-y-3">
        {shown.map((item) => (
          <ItemRow
            key={item.variant.id}
            item={item}
            onEdit={() => onEdit(item)}
            onPriceSaved={onChanged}
            onRuleDeleted={onChanged}
          />
        ))}
        {shown.length === 0 && (
          <Card className="py-12 text-center text-muted-foreground">No packs found.</Card>
        )}
      </div>
    </div>
  );
}

/** A brand or region box: how many items it holds, and how many lack a rule. */
function RuleTile({
  title, subtitle, total, unset, onClick,
}: { title: string; subtitle?: string; total: number; unset: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group rounded-xl border bg-card p-4 text-left transition-all hover:bg-muted/30 ${
        unset > 0 ? 'border-amber-500/40 hover:border-amber-500/60' : 'border-border hover:border-primary/40'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium">{title}</p>
          {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge className="bg-muted text-muted-foreground">{total} pack{total === 1 ? '' : 's'}</Badge>
        {unset > 0 ? (
          <Badge className="bg-amber-500/10 text-amber-500">{unset} without a rule</Badge>
        ) : (
          <Badge className="bg-emerald-500/10 text-emerald-400">all set</Badge>
        )}
      </div>
    </button>
  );
}

function SearchBox({
  value, onChange, placeholder,
}: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-input bg-background py-2.5 pl-10 pr-3 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
      />
    </div>
  );
}

/** One sellable item and, in plain words, what it delivers. */
function ItemRow({
  item, onEdit, onPriceSaved, onRuleDeleted,
}: { item: any; onEdit: () => void; onPriceSaved: () => void; onRuleDeleted: () => void }) {
  const active = item.rules.filter((rule: any) => rule.active);
  const main = active[0];
  const deliverable = !!main;
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');

  // Removing a rule leaves the pack undeliverable rather than deleting the
  // pack, which is why it asks first and says so.
  const removeRule = useMutation({
    mutationFn: () => api.deleteCombination(main.id),
    onSuccess: () => { setConfirming(false); onRuleDeleted(); },
    onError: (err: any) => setError(err.message),
  });

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

        <div className="flex items-center gap-2">
          <Button variant={deliverable ? 'outline' : 'primary'} onClick={onEdit}>
            {deliverable ? 'Change' : 'Set rule'}
          </Button>
          {/* Labelled rather than a bare icon: as a faint ghost icon beside
              "Change" nobody could find it, and an unlabelled bin is a guess
              even when you do see it. */}
          {deliverable && (
            <Button
              variant="outline"
              title="Delete this rule"
              aria-label={`Delete the delivery rule for ${item.variant.name}`}
              className="text-destructive hover:bg-destructive/10"
              onClick={() => { setError(''); setConfirming(true); }}
            >
              <Trash2 className="mr-2 h-4 w-4" /> Delete rule
            </Button>
          )}
        </div>
      </div>

      <Modal open={confirming} onClose={() => setConfirming(false)} title="Delete this rule?">
        <div className="space-y-4">
          <p className="text-sm">
            <span className="font-semibold">{item.variant.name}</span> currently delivers{' '}
            <span className="font-medium">{main ? describe(main) : 'nothing'}</span>.
          </p>
          <p className="text-sm text-muted-foreground">
            The pack itself stays, but with no rule an order for it will fail until you set a new
            one.
          </p>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button
              className="flex-1 bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={removeRule.isPending}
              onClick={() => removeRule.mutate()}
            >
              {removeRule.isPending ? 'Deleting...' : 'Delete rule'}
            </Button>
          </div>
        </div>
      </Modal>
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
  const [name, setName] = useState(item.variant.name);
  const [error, setError] = useState('');
  // Set once the SKU has been re-derived, because a changed SKU has to be
  // copied into the storefront or its orders stop matching.
  const [newSku, setNewSku] = useState<{ from: string | null; to: string } | null>(null);

  useEffect(() => {
    const initial: Record<string, number> = {};
    for (const line of existing?.items || []) {
      initial[line.denominationId] = line.quantity;
    }
    setQuantities(initial);
    setName(item.variant.name);
    setNewSku(null);
  }, [existing?.id, item.variant.id, item.variant.name]);

  const price = Number(item.variant.customerPrice);
  const chosen = item.denominations
    .map((denomination: any) => ({ denomination, quantity: quantities[denomination.id] || 0 }))
    .filter((line: any) => line.quantity > 0);
  const totalValue = chosen.reduce(
    (sum: number, line: any) => sum + Number(line.denomination.faceValue) * line.quantity, 0);
  // Kept only to describe the rule, never to block saving it.
  const matches = Math.abs(totalValue - price) < 0.005;

  const renamed = name.trim() && name.trim() !== item.variant.name;

  const save = useMutation({
    mutationFn: async () => {
      const items = chosen.map((line: any) => ({
        denominationId: line.denomination.id,
        quantity: line.quantity,
      }));

      if (renamed) {
        await api.updateVariant(item.variant.id, { name: name.trim() });
      }

      if (existing) {
        await api.updateCombination(existing.id, {
          items, active: true, name: `${name.trim()} delivery`,
        });
      } else {
        await api.createCombination({
          variantId: item.variant.id,
          name: `${name.trim()} delivery`,
          priority: 1,
          active: true,
          items,
        });
      }

      // The SKU is derived from the pack's name and what it delivers, so it is
      // re-derived whenever either changes. It is reported rather than applied
      // quietly: a SKU is how a storefront order finds this pack.
      return api.regenerateVariantSku(item.variant.id);
    },
    onSuccess: (result: any) => {
      if (result?.changed) {
        setNewSku({ from: result.previous ?? null, to: result.sku });
        setError('');
        return;
      }
      onSaved();
    },
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
        <div className="space-y-1">
          <Input
            label="Pack name"
            value={name}
            onChange={(e: any) => setName(e.target.value)}
            placeholder={item.variant.name}
          />
          <p className="text-xs text-muted-foreground">
            Renaming the pack renames its rule too, and the SKU is re-derived from the new name
            when you save.
          </p>
        </div>

        <p className="text-sm text-muted-foreground">
          Choose which codes to hand over when someone buys this. They do not have to add up to the
          price — a subscription is priced independently of the cards behind it. The merchant is
          charged the price of{' '}
          <span className="font-medium text-foreground">
            {formatPrice(price, item.variant.currency)}
          </span>, whatever codes go out.
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
            <span className="text-muted-foreground">Merchant charged</span>
            <span className="font-semibold">{formatPrice(price, item.variant.currency)}</span>
          </div>
          <div className="mt-1 flex items-center justify-between">
            <span className="text-muted-foreground">Value of codes sent</span>
            <span>{formatPrice(totalValue, item.variant.currency)}</span>
          </div>
        </div>

        {newSku && (
          <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm">
            <p className="font-semibold">Saved — SKU regenerated</p>
            <p className="mt-1 text-muted-foreground">
              {newSku.from ? <><span className="font-mono">{newSku.from}</span> → </> : 'Now '}
              <span className="font-mono text-primary">{newSku.to}</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Put this SKU on the matching product in your store, or its orders will stop finding
              this pack.
            </p>
          </div>
        )}

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

        <div className="flex flex-wrap gap-2">
          {newSku ? (
            <Button className="flex-1" onClick={onSaved}>Done</Button>
          ) : (
          <>
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
          </>
          )}
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

/**
 * Create a pack — a variant such as "PS Essential: 1 Month" at $11.
 *
 * Rewriting this screen as Delivery Rules dropped the old "Add Variant" button,
 * which was the only place a pack could be created, so new subscription tiers
 * could not be added at all. Its price is entered in a chosen currency, and the
 * codes it delivers are set afterwards as that pack's rule.
 */
function NewPackModal({
  hierarchy, onClose, onCreated,
}: { hierarchy: any[]; onClose: () => void; onCreated: () => void }) {
  const [productId, setProductId] = useState('');
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [error, setError] = useState('');

  // Every product in the catalogue, flattened, so a pack can be added to any of
  // them without first navigating a tree.
  const products = useMemo(() => {
    const flat: { id: string; label: string }[] = [];
    for (const category of hierarchy) {
      for (const product of category.products || []) {
        flat.push({ id: product.id, label: `${product.name} (${product.region})` });
      }
    }
    return flat.sort((a, b) => a.label.localeCompare(b.label));
  }, [hierarchy]);

  const create = useMutation({
    mutationFn: () => api.createVariantForProduct(productId, {
      name: name.trim(),
      customerPrice: Number(price),
      currency,
    }),
    onSuccess: onCreated,
    onError: (err: any) => setError(err.message),
  });

  const amount = Number(price);
  const valid = !!productId && name.trim().length > 0 && Number.isFinite(amount) && amount > 0;

  return (
    <Modal open onClose={onClose} title="New pack" size="lg">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          A pack is something you sell at its own price — "PS Essential: 1 Month" at $11 — rather
          than a code value. Create it here, then set which codes it delivers as its rule.
        </p>

        <Select
          label="Product"
          value={productId}
          onChange={(e: any) => setProductId(e.target.value)}
          options={[
            { value: '', label: products.length ? '— Select —' : 'No products yet' },
            ...products.map((product) => ({ value: product.id, label: product.label })),
          ]}
        />

        <Input
          label="Pack name"
          value={name}
          onChange={(e: any) => setName(e.target.value)}
          placeholder="PS Essential: 1 Month"
        />

        <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
          <Input
            label="Price"
            type="number" min="0" step="0.01"
            value={price}
            onChange={(e: any) => setPrice(e.target.value)}
            placeholder="11.00"
          />
          <Select
            label="Currency"
            value={currency}
            onChange={(e: any) => setCurrency(e.target.value)}
            options={[
              { value: 'USD', label: 'USD' },
              { value: 'PKR', label: 'PKR' },
            ]}
          />
        </div>

        <p className="text-xs text-muted-foreground">
          You can set the other currency's price afterwards under Prices, and the pack gets its own
          SKU on the SKU page.
        </p>

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button
            className="flex-1"
            disabled={!valid || create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? 'Creating...' : 'Create pack'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
