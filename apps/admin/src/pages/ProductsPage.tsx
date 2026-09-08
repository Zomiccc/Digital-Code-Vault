import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useMemo } from 'react';
import { Plus, Package, Tags, Download } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, Button, Input, Select, Modal, Badge, Table, Th, Td } from '@/components/ui';
import { statusColor, formatPrice } from '@/lib/utils';

export function ProductsPage() {
  const { data: products, isLoading } = useQuery({ queryKey: ['products'], queryFn: api.listProducts });
  const { data: suppliers } = useQuery({ queryKey: ['suppliers'], queryFn: api.listSuppliers });
  const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: () => api.listCategories() });
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [showDenom, setShowDenom] = useState<any>(null);
  const [showSkuExport, setShowSkuExport] = useState(false);
  const [skuGenResult, setSkuGenResult] = useState<any>(null);
  const [form, setForm] = useState({ name: '', region: '', supplierId: '', category_id: '', sku: '' });
  const [denomValue, setDenomValue] = useState('');

  // Preview the SKU the product will get, so it is visible before creating it.
  const { data: suggestedSku } = useQuery({
    queryKey: ['suggest-sku', form.name, form.region],
    queryFn: () => api.suggestSku(form.name, form.region),
    enabled: showCreate && form.name.trim().length > 1,
  });

  const createMutation = useMutation({
    mutationFn: () => api.createProduct({ name: form.name, region: form.region, supplierId: form.supplierId || undefined, category_id: form.category_id || undefined, sku: form.sku || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setShowCreate(false);
      setForm({ name: '', region: '', supplierId: '', category_id: '', sku: '' });
    },
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
          <p className="text-sm text-muted-foreground">Manage products and their code values. Which codes each one delivers is set on the Delivery Rules page.</p>
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
                  {p.category && (
                    <Badge className="bg-gray-100 text-gray-600">{p.category.name}</Badge>
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowDenom(p)}>Add Denom</Button>
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

            {/* Which codes a product delivers is set on the Delivery Rules
                page, per denomination and per pack. This screen had a second,
                product-level rule editor that did the same job in a different
                place, so there were two answers to one question. */}
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
            label="Category"
            value={form.category_id}
            onChange={(e) => setForm({ ...form, category_id: e.target.value })}
            options={[
              { value: '', label: '— None —' },
              ...(categories?.map((c: any) => ({ value: c.id, label: c.name })) || []),
            ]}
          />
          <p className="text-xs text-muted-foreground">
            Add the product's code values here, then say which codes it delivers on the
            Delivery Rules page.
          </p>
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
