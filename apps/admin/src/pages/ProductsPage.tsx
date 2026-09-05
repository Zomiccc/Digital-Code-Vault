import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useMemo } from 'react';
import { Plus, Settings2, Package, Tags, Download } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, Button, Input, Select, Modal, Badge, Table, Th, Td } from '@/components/ui';
import { statusColor, formatPrice } from '@/lib/utils';

function EssentialsBundleDialog({ product, onClose }: { product: any; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<{ denominationId: string; quantity: number }[] | null>(null);

  const { data: config, isLoading } = useQuery({
    queryKey: ['essentials-delivery-config', product.id],
    queryFn: () => api.getEssentialsDeliveryConfig(product.id),
  });

  useMemo(() => {
    if (config && rows === null) {
      setRows(
        config.items.length > 0
          ? config.items.map((i: any) => ({ denominationId: i.denominationId, quantity: i.quantity }))
          : [{ denominationId: '', quantity: 1 }],
      );
    }
  }, [config, rows]);

  const saveMutation = useMutation({
    mutationFn: () => api.saveEssentialsDeliveryConfig(
      product.id,
      (rows || []).filter((r) => r.denominationId && r.quantity > 0),
    ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['essentials-delivery-config', product.id] });
      queryClient.invalidateQueries({ queryKey: ['essentials-availability', product.id] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      onClose();
    },
  });

  const denominations = product.denominations || [];
  const currentRows = rows || [];
  const usedDenomIds = new Set(currentRows.map((r) => r.denominationId).filter(Boolean));

  const updateRow = (idx: number, patch: Partial<{ denominationId: string; quantity: number }>) => {
    setRows((prev) => (prev || []).map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const removeRow = (idx: number) => {
    setRows((prev) => {
      const next = (prev || []).filter((_, i) => i !== idx);
      return next.length ? next : [{ denominationId: '', quantity: 1 }];
    });
  };

  const validRows = currentRows.filter((r) => r.denominationId && r.quantity > 0);
  const canSave = validRows.length > 0;

  // Calculate total value from valid rows
  const totalValue = validRows.reduce((sum, r) => {
    const denom = denominations.find((d: any) => d.id === r.denominationId);
    return sum + (denom ? Number(denom.faceValue) * r.quantity : 0);
  }, 0);

  return (
    <Modal open={true} onClose={onClose} title={`Delivery Rule — ${product.name}`}>
      <div className="space-y-4">
        <div className="rounded-lg bg-purple-50 p-3 text-sm text-purple-700">
          Define which denominations and how many of each must be delivered for this Essentials product.
          The system automatically picks ANY available code matching each denomination at purchase time — you never select individual codes.
        </div>

        {isLoading ? (
          <p className="text-muted-foreground">Loading delivery rule...</p>
        ) : denominations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Package className="mb-2 h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">This product has no denominations yet.</p>
            <p className="text-xs text-muted-foreground mt-1">Add denominations first, then configure the delivery rule.</p>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                <span className="flex-1">Denomination</span>
                <span className="w-32 text-center">Quantity</span>
                <span className="w-20 text-right">Available</span>
                <span className="w-16" />
              </div>
              {currentRows.map((row, idx) => {
                const denom = denominations.find((d: any) => d.id === row.denominationId);
                const available = denom?.availableCount ?? 0;
                return (
                  <div key={idx} className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <Select
                      className="flex-1"
                      value={row.denominationId}
                      onChange={(e) => updateRow(idx, { denominationId: e.target.value })}
                      options={[
                        { value: '', label: '— Denomination —' },
                        ...denominations
                          .filter((d: any) => d.id === row.denominationId || !usedDenomIds.has(d.id))
                          .map((d: any) => ({ value: d.id, label: formatPrice(d.faceValue, d.currency) })),
                      ]}
                    />
                    <div className="flex items-center gap-1">
                      <Button variant="outline" size="sm" onClick={() => updateRow(idx, { quantity: Math.max(1, row.quantity - 1) })}>-</Button>
                      <Input className="w-16 text-center" type="number" value={String(row.quantity)} onChange={(e) => updateRow(idx, { quantity: Math.max(1, parseInt(e.target.value) || 1) })} />
                      <Button variant="outline" size="sm" onClick={() => updateRow(idx, { quantity: row.quantity + 1 })}>+</Button>
                    </div>
                    <span className={`w-20 text-right text-xs ${available < row.quantity ? 'text-red-600 font-semibold' : 'text-muted-foreground'}`}>{available}</span>
                    <Button variant="outline" size="sm" onClick={() => removeRow(idx)}>Remove</Button>
                  </div>
                );
              })}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRows((prev) => [...(prev || []), { denominationId: '', quantity: 1 }])}
              disabled={usedDenomIds.size >= denominations.length}
            >
              <Plus className="mr-1 h-3 w-3" /> Add Denomination
            </Button>
            <div className="rounded-lg bg-muted p-3 text-sm">
              <span className="font-semibold">Total Value: ${totalValue}</span>
            </div>
          </>
        )}

        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !canSave} className="flex-1">
            {saveMutation.isPending ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function ProductsPage() {
  const { data: products, isLoading } = useQuery({ queryKey: ['products'], queryFn: api.listProducts });
  const { data: suppliers } = useQuery({ queryKey: ['suppliers'], queryFn: api.listSuppliers });
  const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: () => api.listCategories() });
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [showDenom, setShowDenom] = useState<any>(null);
  const [showEssentials, setShowEssentials] = useState<any>(null);
  const [showSkuExport, setShowSkuExport] = useState(false);
  const [skuGenResult, setSkuGenResult] = useState<any>(null);
  const [form, setForm] = useState({ name: '', region: '', supplierId: '', product_type: 'NORMAL', category_id: '', sku: '' });
  const [denomValue, setDenomValue] = useState('');

  // Preview the SKU the product will get, so it is visible before creating it.
  const { data: suggestedSku } = useQuery({
    queryKey: ['suggest-sku', form.name, form.region],
    queryFn: () => api.suggestSku(form.name, form.region),
    enabled: showCreate && form.name.trim().length > 1,
  });

  const createMutation = useMutation({
    mutationFn: () => api.createProduct({ name: form.name, region: form.region, supplierId: form.supplierId || undefined, product_type: form.product_type, category_id: form.category_id || undefined, sku: form.sku || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setShowCreate(false);
      setForm({ name: '', region: '', supplierId: '', product_type: 'NORMAL', category_id: '', sku: '' });
    },
  });

  const updateTypeMutation = useMutation({
    mutationFn: ({ productId, type }: { productId: string; type: string }) => api.updateProductType(productId, type),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['products'] }),
  });

  const updateCategoryMutation = useMutation({
    mutationFn: ({ productId, categoryId }: { productId: string; categoryId: string | null }) => api.updateProductCategory(productId, categoryId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['products'] }),
  });

  const denomMutation = useMutation({
    mutationFn: () => api.createDenomination(showDenom.id, parseFloat(denomValue)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setShowDenom(null);
      setDenomValue('');
    },
  });

  if (isLoading) {
    return <div className="flex h-full items-center justify-center text-muted-foreground">Loading products...</div>;
  }

  return (
    <div className="space-y-6 animate-slide-up">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Products</h1>
          <p className="text-sm text-muted-foreground">Manage products, denominations, and Essentials configurations</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowSkuExport(true)}>
            <Tags className="mr-2 h-4 w-4" /> SKU Export
          </Button>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="mr-2 h-4 w-4" /> Add Product
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {products?.map((p: any) => (
          <Card key={p.id} hover>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold tracking-tight">{p.name}</h3>
                <p className="text-sm text-muted-foreground">{p.region}</p>
                <SkuEditor product={p} />
                <div className="mt-3 flex items-center gap-2">
                  <Badge className={statusColor(p.status)}>{p.status}</Badge>
                  <Badge className={p.productType === 'ESSENTIALS' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}>
                    {p.productType || 'NORMAL'}
                  </Badge>
                  {p.category && (
                    <Badge className="bg-gray-100 text-gray-600">{p.category.name}</Badge>
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowDenom(p)}>Add Denom</Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => updateTypeMutation.mutate({ productId: p.id, type: p.productType === 'ESSENTIALS' ? 'NORMAL' : 'ESSENTIALS' })}
                >
                  <Settings2 className="mr-1 h-3 w-3" />
                  {p.productType === 'ESSENTIALS' ? 'Set NORMAL' : 'Set ESSENTIALS'}
                </Button>
              </div>
            </div>

            {p.denominations && p.denominations.length > 0 && (
              <div className="mt-5 flex flex-wrap gap-2">
                {p.denominations.map((d: any) => (
                  <Badge key={d.id} className="bg-secondary text-secondary-foreground">
                    {formatPrice(d.faceValue, d.currency)} <span className="ml-1 text-xs opacity-60">({d.availableCount ?? 0})</span>
                  </Badge>
                ))}
              </div>
            )}
            {(!p.denominations || p.denominations.length === 0) && (
              <p className="mt-5 text-xs text-muted-foreground">No denominations configured</p>
            )}

            {p.productType === 'ESSENTIALS' && (
              <div className="mt-4 border-t border-border pt-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-purple-700">ESSENTIALS DELIVERY RULE</span>
                  <Button variant="outline" size="sm" onClick={() => setShowEssentials(p)}>
                    <Settings2 className="mr-1 h-3 w-3" /> Configure
                  </Button>
                </div>
                <EssentialsDeliverySummary productId={p.id} />
              </div>
            )}
          </Card>
        ))}
      </div>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Product">
        <div className="space-y-4">
          <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. PSN" />
          <Input label="Region" value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} placeholder="e.g. USA" />
          <div className="space-y-2">
            <Input
              label="SKU — matches storefront orders to this product"
              value={form.sku}
              onChange={(e) => setForm({ ...form, sku: e.target.value })}
              placeholder={suggestedSku?.sku || 'e.g. PSN-USA'}
            />
            {suggestedSku?.sku && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Suggested: <span className="font-mono text-primary">{suggestedSku.sku}</span></span>
                {form.sku !== suggestedSku.sku && (
                  <button
                    type="button"
                    className="rounded border border-input px-2 py-0.5 hover:bg-muted"
                    onClick={() => setForm({ ...form, sku: suggestedSku.sku })}
                  >
                    Use this
                  </button>
                )}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Leave blank and this SKU is assigned automatically. Enter the same SKU on the
              product in your store so its orders match this product.
            </p>
          </div>
          <Select
            label="Supplier"
            value={form.supplierId}
            onChange={(e) => setForm({ ...form, supplierId: e.target.value })}
            options={[
              { value: '', label: '— None —' },
              ...(suppliers?.map((s: any) => ({ value: s.id, label: s.name })) || []),
            ]}
          />
          <Select
            label="Product Type"
            value={form.product_type}
            onChange={(e) => setForm({ ...form, product_type: e.target.value })}
            options={[
              { value: 'NORMAL', label: 'NORMAL — Fixed-value codes (1:1 denomination mapping)' },
              { value: 'ESSENTIALS', label: 'ESSENTIALS — Reusable denomination + quantity delivery rule' },
            ]}
          />
          <Select
            label="Category"
            value={form.category_id}
            onChange={(e) => setForm({ ...form, category_id: e.target.value })}
            options={[
              { value: '', label: '— None —' },
              ...(categories?.map((c: any) => ({ value: c.id, label: c.name })) || []),
            ]}
          />
          {form.product_type === 'ESSENTIALS' && (
            <div className="rounded-lg bg-purple-50 p-3 text-sm text-purple-700">
              Essentials products deliver a fixed combination of denominations (e.g. $10 x1 + $20 x1). The system automatically picks ANY available code per denomination at purchase time — you never select individual codes. After creating the product, click "Configure" to define the rule.
            </div>
          )}
          <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending} className="w-full">
            {createMutation.isPending ? 'Creating...' : 'Create'}
          </Button>
        </div>
      </Modal>

      <Modal open={!!showDenom} onClose={() => setShowDenom(null)} title={`Add Denomination — ${showDenom?.name}`}>
        <div className="space-y-4">
          <Input label="Face Value ($)" type="number" value={denomValue} onChange={(e) => setDenomValue(e.target.value)} />
          <Button onClick={() => denomMutation.mutate()} disabled={denomMutation.isPending || !denomValue} className="w-full">
            {denomMutation.isPending ? 'Adding...' : 'Add'}
          </Button>
        </div>
      </Modal>

      {showEssentials && (
        <EssentialsBundleDialog product={showEssentials} onClose={() => setShowEssentials(null)} />
      )}

      {/* SKU Export Modal */}
      <SkuExportModal open={showSkuExport} onClose={() => setShowSkuExport(false)} />
    </div>
  );
}

function SkuExportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [genResult, setGenResult] = useState<any>(null);

  const { data: skuData, isLoading } = useQuery({
    queryKey: ['sku-export'],
    queryFn: api.adminExportSkus,
    enabled: open,
  });

  const generateMutation = useMutation({
    mutationFn: api.adminAutoGenerateSkus,
    onSuccess: (result) => {
      setGenResult(result);
      queryClient.invalidateQueries({ queryKey: ['sku-export'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });

  const downloadCsv = () => {
    if (!skuData?.items) return;
    const rows = [['Product Name', 'Region', 'Product SKU', 'Denomination FaceValue', 'Denomination SKU']];
    for (const item of skuData.items) {
      if (item.denominations.length === 0) {
        rows.push([item.name, item.region, item.sku, '', '']);
      } else {
        for (const d of item.denominations) {
          rows.push([item.name, item.region, item.sku, String(d.faceValue), d.sku || '']);
        }
      }
    }
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'dcv-skus.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Modal open={open} onClose={onClose} title="SKU Export & Auto-Generation">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Generate SKUs for products that don't have one, or export the full list.</p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={downloadCsv} disabled={!skuData?.items?.length}>
              <Download className="h-3.5 w-3.5" /> CSV
            </Button>
            <Button size="sm" onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending}>
              <Tags className="h-3.5 w-3.5" /> {generateMutation.isPending ? 'Generating...' : 'Auto-Generate'}
            </Button>
          </div>
        </div>

        {genResult && (
          <div className="rounded-lg bg-muted/50 p-3 text-sm">
            <p className="font-medium">Generated: {genResult.generated} | Skipped: {genResult.skipped_count}</p>
            {genResult.updated?.length > 0 && (
              <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                {genResult.updated.map((u: any) => (
                  <div key={u.id} className="text-xs text-muted-foreground">
                    {u.name} → <span className="font-mono text-primary">{u.sku}</span>
                    {u.denominationSkus?.length > 0 && (
                      <span className="ml-2">
                        ({u.denominationSkus.map((ds: any) => ds.sku).join(', ')})
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : skuData?.items?.length > 0 ? (
          <Table>
            <thead>
              <tr>
                <Th>Product</Th>
                <Th>Region</Th>
                <Th>Product SKU</Th>
                <Th>Denomination SKUs</Th>
              </tr>
            </thead>
            <tbody>
              {skuData.items.map((item: any) => (
                <tr key={item.id}>
                  <Td className="font-medium text-sm">{item.name}</Td>
                  <Td className="text-sm">{item.region}</Td>
                  <Td className="font-mono text-xs">{item.sku || <span className="text-muted-foreground">—</span>}</Td>
                  <Td className="text-xs">
                    {item.denominations.length > 0 ? (
                      <div className="space-y-0.5">
                        {item.denominations.map((d: any) => (
                          <div key={d.id} className="font-mono">
                            <span className="text-muted-foreground">{formatPrice(d.faceValue, d.currency)}</span> →{' '}
                            <span className={d.sku ? 'text-primary' : 'text-muted-foreground'}>{d.sku || '—'}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <p className="text-sm text-muted-foreground">No products found</p>
        )}
      </div>
    </Modal>
  );
}

/** Summary shown on the product card — the configured denomination + quantity rule, and whether it's currently fulfillable. */
function EssentialsDeliverySummary({ productId }: { productId: string }) {
  const { data: availability, isLoading } = useQuery({
    queryKey: ['essentials-availability', productId],
    queryFn: () => api.getEssentialsAvailability(productId),
  });

  if (isLoading) return <p className="mt-2 text-xs text-muted-foreground">Loading delivery rule...</p>;

  const items = availability?.items || [];
  if (items.length === 0) {
    return <p className="mt-2 text-xs text-muted-foreground">No delivery rule configured yet. Click "Configure" to define it.</p>;
  }

  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {items.map((item: any) => (
          <Badge key={item.denominationId} className="bg-secondary text-secondary-foreground">
            {formatPrice(item.faceValue, item.currency)} × {item.required}
          </Badge>
        ))}
      </div>
      <Badge className={availability.ready ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}>
        {availability.ready ? 'READY ✓' : 'INSUFFICIENT INVENTORY'}
      </Badge>
    </div>
  );
}

/**
 * The SKU is how a storefront order finds this product, so it is editable in
 * place rather than buried in a separate screen. Saving rejects a SKU already
 * used by another product, because a duplicate would route orders ambiguously.
 */
function SkuEditor({ product }: { product: any }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(product.sku || '');
  const [error, setError] = useState('');

  const save = useMutation({
    mutationFn: () => api.updateProductSku(product.id, value.trim() || null),
    onSuccess: () => {
      setEditing(false);
      setError('');
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['sku-export'] });
    },
    onError: (err: any) => setError(err.message),
  });

  if (!editing) {
    return (
      <p className="text-xs text-muted-foreground/70">
        SKU: {product.sku
          ? <span className="font-mono text-foreground/80">{product.sku}</span>
          : <span className="italic">not set</span>}
        <button
          type="button"
          className="ml-2 underline hover:text-foreground"
          onClick={() => { setValue(product.sku || ''); setEditing(true); }}
        >
          Edit
        </button>
      </p>
    );
  }

  return (
    <div className="mt-1 space-y-1" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-1">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value.toUpperCase())}
          aria-label={`SKU for ${product.name}`}
          className="w-36 rounded border border-input bg-background px-2 py-1 font-mono text-xs"
          placeholder="PSN-KSA"
        />
        <button
          type="button"
          className="rounded bg-primary px-2 py-1 text-xs text-primary-foreground disabled:opacity-50"
          disabled={save.isPending}
          onClick={() => save.mutate()}
        >
          Save
        </button>
        <button
          type="button"
          className="rounded border border-input px-2 py-1 text-xs"
          onClick={() => { setEditing(false); setError(''); }}
        >
          Cancel
        </button>
      </div>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
