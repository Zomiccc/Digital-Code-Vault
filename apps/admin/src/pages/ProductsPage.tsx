import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useMemo } from 'react';
import { Plus, Settings2, Package } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, Button, Input, Select, Modal, Badge } from '@/components/ui';
import { statusColor } from '@/lib/utils';

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
                  <div key={idx} className="flex items-center gap-2">
                    <Select
                      value={row.denominationId}
                      onChange={(e) => updateRow(idx, { denominationId: e.target.value })}
                      options={[
                        { value: '', label: '— Denomination —' },
                        ...denominations
                          .filter((d: any) => d.id === row.denominationId || !usedDenomIds.has(d.id))
                          .map((d: any) => ({ value: d.id, label: `$${d.faceValue}` })),
                      ]}
                    />
                    <div className="flex items-center gap-1">
                      <Button variant="outline" size="sm" onClick={() => updateRow(idx, { quantity: Math.max(1, row.quantity - 1) })}>-</Button>
                      <Input type="number" value={String(row.quantity)} onChange={(e) => updateRow(idx, { quantity: Math.max(1, parseInt(e.target.value) || 1) })} />
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
  const [form, setForm] = useState({ name: '', region: '', supplierId: '', product_type: 'NORMAL', category_id: '', sku: '' });
  const [denomValue, setDenomValue] = useState('');

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
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="mr-2 h-4 w-4" /> Add Product
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {products?.map((p: any) => (
          <Card key={p.id} hover>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold tracking-tight">{p.name}</h3>
                <p className="text-sm text-muted-foreground">{p.region}</p>
                {p.sku && <p className="text-xs text-muted-foreground/70">SKU: {p.sku}</p>}
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
                    ${d.faceValue} <span className="ml-1 text-xs opacity-60">({d.availableCount ?? 0})</span>
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
          <Input label="SKU (optional — for auto-matching webhook orders)" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="e.g. PSN-USA-10" />
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
    </div>
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
            ${item.faceValue} × {item.required}
          </Badge>
        ))}
      </div>
      <Badge className={availability.ready ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}>
        {availability.ready ? 'READY ✓' : 'INSUFFICIENT INVENTORY'}
      </Badge>
    </div>
  );
}
