import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Plus, Trash2, Pencil, CheckCircle2, XCircle, Layers, Save } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, Button, Input, Select, Modal, Badge } from '@/components/ui';
import { formatPrice, getCurrencySymbol } from '@/lib/utils';

/**
 * Fulfillment Presets
 * Admin picks a variant (e.g. "PS Essential: 1 Month") and pre-sets exactly which
 * denomination codes (and how many of each) get delivered when that variant is ordered.
 * Bundles are tried in priority order; each is verified against live AVAILABLE stock.
 */
export function FulfillmentPresetsPage() {
  return (
    <div className="space-y-6 animate-slide-up">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Fulfillment Presets</h1>
        <p className="text-sm text-muted-foreground">
          Pre-set which codes get delivered for each product variant (e.g. PS Essential 1 Month → $10 ×1 + $20 ×1). Fully editable anytime.
        </p>
      </div>
      <PresetsExplorer />
    </div>
  );
}

function PresetsExplorer() {
  const queryClient = useQueryClient();
  const [categoryId, setCategoryId] = useState('');
  const [productId, setProductId] = useState('');
  const [variantId, setVariantId] = useState('');

  const [showComboModal, setShowComboModal] = useState(false);
  const [editingCombo, setEditingCombo] = useState<any>(null);
  const [showVariantModal, setShowVariantModal] = useState(false);

  const { data: hierarchy, isLoading: hierarchyLoading } = useQuery({
    queryKey: ['catalog-hierarchy'],
    queryFn: api.getCatalogHierarchy,
  });

  const { data: variants, isLoading: variantsLoading } = useQuery({
    queryKey: ['preset-variants', productId],
    queryFn: () => api.listVariantsByProduct(productId),
    enabled: !!productId,
  });

  const { data: combinations, isLoading: combosLoading } = useQuery({
    queryKey: ['preset-combinations', variantId],
    queryFn: () => api.listCombinations(variantId),
    enabled: !!variantId,
  });

  const categories = hierarchy || [];
  const products = categories.find((c: any) => c.id === categoryId)?.products || [];
  const selectedProduct = products.find((p: any) => p.id === productId);
  const selectedVariant = (variants || []).find((v: any) => v.id === variantId);

  const deleteComboMutation = useMutation({
    mutationFn: (id: string) => api.deleteCombination(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['preset-combinations', variantId] });
      queryClient.invalidateQueries({ queryKey: ['catalog-hierarchy'] });
    },
  });

  const toggleComboMutation = useMutation({
    mutationFn: (combo: any) => api.updateCombination(combo.id, { active: !combo.active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['preset-combinations', variantId] }),
  });

  if (hierarchyLoading) return <div className="text-muted-foreground">Loading catalog...</div>;

  return (
    <div className="space-y-4">
      {/* Selection cascade */}
      <Card>
        <div className="grid gap-4 md:grid-cols-3">
          <Select
            label="Category"
            value={categoryId}
            onChange={(e) => {
              setCategoryId(e.target.value);
              setProductId('');
              setVariantId('');
            }}
            options={[
              { value: '', label: '— Select Category —' },
              ...categories.map((c: any) => ({ value: c.id, label: c.name })),
            ]}
          />
          <Select
            label="Product"
            value={productId}
            onChange={(e) => {
              setProductId(e.target.value);
              setVariantId('');
            }}
            options={[
              { value: '', label: categoryId ? '— Select Product —' : 'Select category first' },
              ...products.map((p: any) => ({
                value: p.id,
                label: `${p.name} (${p.region})${p.status !== 'ACTIVE' ? ' ⚠ inactive' : ''}`,
              })),
            ]}
          />
          <Select
            label="Variant"
            value={variantId}
            onChange={(e) => setVariantId(e.target.value)}
            options={[
              { value: '', label: productId ? '— Select Variant —' : 'Select product first' },
              ...(variants || []).map((v: any) => ({
                value: v.id,
                label: `${v.name} — ${formatPrice(v.customerPrice, v.currency)}${v.active ? '' : ' ⚠ inactive'}`,
              })),
            ]}
          />
        </div>
      </Card>

      {selectedProduct && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span>
              Wallet denominations on this product:{' '}
              {(selectedProduct.denominations || []).length === 0 ? (
                <span className="text-red-500">none yet</span>
              ) : (
                <span className="font-medium text-foreground">
                  {(selectedProduct.denominations || []).map((d: any) => `${d.currency === 'USD' ? '$' : d.currency + ' '}${d.faceValue}`).join(', ')}
                </span>
              )}
            </span>
          </div>
          <Button onClick={() => setShowVariantModal(true)}>
            <Plus className="mr-2 h-4 w-4" /> Add Variant
          </Button>
        </div>
      )}

      {variantId && (
        <>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Layers className="h-5 w-5 text-primary" />
              <h2 className="text-xl font-semibold">
                Presets for “{selectedVariant?.name}”
              </h2>
              <Badge className={combinations?.some((c: any) => c.active) ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}>
                {combinations?.some((c: any) => c.active)
                  ? 'ORDER → PRESET CODES'
                  : 'NO PRESET — ORDER WILL FAIL'}
              </Badge>
            </div>
            <Button onClick={() => { setEditingCombo(null); setShowComboModal(true); }}>
              <Plus className="mr-2 h-4 w-4" /> Add Preset
            </Button>
          </div>

          {combosLoading ? (
            <div className="text-muted-foreground">Loading presets...</div>
          ) : !combinations?.length ? (
            <Card>
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Layers className="mb-3 h-10 w-10 text-muted-foreground/50" />
                <p className="font-medium">No preset configured for this variant yet.</p>
                <p className="mt-1 max-w-md text-sm text-muted-foreground">
                  When someone orders “{selectedVariant?.name}”, fulfillment fails until you add a preset telling the system which codes to deliver.
                </p>
              </div>
            </Card>
          ) : (
            <div className="space-y-4">
              {combinations.map((combo: any) => (
                <Card key={combo.id} hover>
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded bg-secondary px-2 py-0.5 text-xs font-semibold text-secondary-foreground">
                          Priority {combo.priority}
                        </span>
                        <h3 className="text-lg font-semibold">{combo.name}</h3>
                        <Badge className={combo.active ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}>
                          {combo.active ? 'ACTIVE' : 'INACTIVE'}
                        </Badge>
                        {combo.fulfillable ? (
                          <span className="flex items-center gap-1 text-sm text-emerald-600">
                            <CheckCircle2 className="h-4 w-4" /> In stock
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-sm text-red-600">
                            <XCircle className="h-4 w-4" /> Not enough stock
                          </span>
                        )}
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {combo.items.map((item: any, idx: number) => (
                          <div key={idx} className="rounded-lg border border-border bg-muted/40 px-3 py-1.5 text-sm">
                            <span className="font-medium">
                              {item.denomination?.currency === 'USD'
                                ? `$${item.denomination?.faceValue}`
                                : `${item.denomination?.faceValue} ${item.denomination?.currency}`}
                            </span>
                            <span className="ml-1 text-muted-foreground">× {item.quantity}</span>
                          </div>
                        ))}
                      </div>

                      <div className="mt-3 flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground">Codes delivered:</span>
                        <Badge className="bg-primary/10 text-primary">
                          {combo.items.reduce((n: number, i: any) => n + i.quantity, 0)} code(s) · value {combo.totalValue}
                        </Badge>
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-col gap-2">
                      <Button variant="outline" size="sm" onClick={() => { setEditingCombo(combo); setShowComboModal(true); }}>
                        <Pencil className="mr-2 h-4 w-4" /> Edit
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => toggleComboMutation.mutate(combo)}>
                        {combo.active ? 'Deactivate' : 'Activate'}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => { if (confirm('Delete this preset?')) deleteComboMutation.mutate(combo.id); }}>
                        <Trash2 className="mr-2 h-4 w-4" /> Delete
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {!variantsLoading && productId && (variants || []).length === 0 && (
        <Card>
          <div className="py-8 text-center text-sm text-muted-foreground">
            This product has no variants yet. Use “Add Variant” above (e.g. “PS Essential: 1 Month”).
          </div>
        </Card>
      )}

      {/* Add / Edit preset modal */}
      {showComboModal && (
        <PresetModal
          variant={selectedVariant}
          denominations={selectedProduct?.denominations || []}
          editing={editingCombo}
          onClose={() => { setShowComboModal(false); setEditingCombo(null); }}
          onSaved={() => { setShowComboModal(false); setEditingCombo(null); }}
        />
      )}

      {/* Add variant modal */}
      {showVariantModal && productId && (
        <VariantModal
          productId={productId}
          regionCurrency={selectedProduct?.productRegions?.[0]?.region?.currency || 'USD'}
          existingCount={(variants || []).length}
          onClose={() => setShowVariantModal(false)}
        />
      )}
    </div>
  );
}

function PresetModal({
  variant,
  denominations,
  editing,
  onClose,
  onSaved,
}: {
  variant: any;
  denominations: any[];
  editing: any;
  onClose: () => void;
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(editing?.name || '');
  const [priority, setPriority] = useState<number>(editing?.priority ?? 1);
  const [items, setItems] = useState<{ denominationId: string; quantity: number }[]>(
    editing?.items?.map((i: any) => ({ denominationId: i.denominationId, quantity: i.quantity })) || [
      { denominationId: '', quantity: 1 },
    ],
  );

  const denomLabel = (d: any) => (d.currency === 'USD' ? `$${d.faceValue}` : `${d.faceValue} ${d.currency}`);

  const saveMutation = useMutation({
    mutationFn: () => {
      const payloadItems = items.filter((i) => i.denominationId && i.quantity > 0);
      if (editing) {
        return api.updateCombination(editing.id, { name, priority, items: payloadItems });
      }
      return api.createCombination({
        variantId: variant.id,
        name: name || `Preset (${payloadItems.length} code type${payloadItems.length === 1 ? '' : 's'})`,
        priority,
        active: true,
        items: payloadItems,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['preset-combinations', variant.id] });
      onSaved();
    },
  });

  const valid = items.some((i) => i.denominationId && i.quantity > 0);

  return (
    <Modal open onClose={onClose} title={editing ? `Edit Preset — ${variant?.name}` : `Add Preset — ${variant?.name}`}>
      <div className="space-y-4">
        <Input label="Preset name (optional)" value={name} onChange={(e) => setName(e.target.value)} placeholder={`e.g. ${variant?.name} bundle`} />
        <Input
          label="Priority (lower = tried first)"
          type="number"
          value={String(priority)}
          onChange={(e) => setPriority(parseInt(e.target.value) || 1)}
        />

        <div>
          <label className="mb-2 block text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Codes to deliver
          </label>
          <div className="space-y-2">
            {items.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <div className="flex-1">
                  <Select
                    value={item.denominationId}
                    onChange={(e) => {
                      const next = [...items];
                      next[idx] = { ...next[idx], denominationId: e.target.value };
                      setItems(next);
                    }}
                    options={[
                      { value: '', label: '— Select code value —' },
                      ...denominations.map((d: any) => ({ value: d.id, label: denomLabel(d) })),
                    ]}
                  />
                </div>
                <div className="w-24">
                  <Input
                    type="number"
                    value={String(item.quantity)}
                    onChange={(e) => {
                      const next = [...items];
                      next[idx] = { ...next[idx], quantity: Math.max(1, parseInt(e.target.value) || 1) };
                      setItems(next);
                    }}
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const next = items.filter((_, i) => i !== idx);
                    setItems(next.length ? next : [{ denominationId: '', quantity: 1 }]);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => setItems([...items, { denominationId: '', quantity: 1 }])}
          >
            <Plus className="mr-1 h-4 w-4" /> Add another code box
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">
            Example: to deliver two codes ($10 + $20), pick $10 qty 1 and $20 qty 1. Need three codes? Click “Add another code box”.
          </p>
        </div>

        {saveMutation.isError && (
          <p className="text-sm text-red-600">{(saveMutation.error as any)?.message || 'Failed to save preset'}</p>
        )}

        <Button onClick={() => saveMutation.mutate()} disabled={!valid || saveMutation.isPending} className="w-full">
          <Save className="mr-2 h-4 w-4" /> {editing ? 'Save Changes' : 'Create Preset'}
        </Button>
      </div>
    </Modal>
  );
}

function VariantModal({ productId, regionCurrency, existingCount, onClose }: { productId: string; regionCurrency: string; existingCount: number; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState(regionCurrency);

  const createMutation = useMutation({
    mutationFn: () =>
      api.createVariantForProduct(productId, {
        name,
        customerPrice: parseFloat(price),
        currency,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['preset-variants', productId] });
      queryClient.invalidateQueries({ queryKey: ['catalog-hierarchy'] });
      onClose();
    },
  });

  return (
    <Modal open onClose={onClose} title="Add Variant">
      <div className="space-y-4">
        <Input label="Variant name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. PS Essential: 1 Month" />
        <Input
          label="Currency (auto-detected from product region — override if needed)"
          value={currency}
          onChange={(e) => setCurrency(e.target.value.toUpperCase())}
          placeholder="e.g. SAR"
        />
        <Input
          label={`Customer price (${currency} ${getCurrencySymbol(currency)})`}
          type="number"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="e.g. 1850"
        />
        {createMutation.isError && (
          <p className="text-sm text-red-600">{(createMutation.error as any)?.message || 'Failed to create variant'}</p>
        )}
        <Button
          onClick={() => createMutation.mutate()}
          disabled={!name || !price || createMutation.isPending}
          className="w-full"
        >
          <Plus className="mr-2 h-4 w-4" /> Create Variant ({existingCount} existing)
        </Button>
      </div>
    </Modal>
  );
}
