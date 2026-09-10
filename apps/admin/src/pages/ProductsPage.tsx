import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useMemo } from 'react';
import { Plus, Package, Tags, Download, Trash2, X } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, Button, Input, Select, Modal, Badge, Table, Th, Td } from '@/components/ui';
import { statusColor, formatPrice } from '@/lib/utils';

export function ProductsPage() {
  const { data: products, isLoading } = useQuery({ queryKey: ['products'], queryFn: api.listProducts });
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [showDenom, setShowDenom] = useState<any>(null);
  const [showSkuExport, setShowSkuExport] = useState(false);
  const [skuGenResult, setSkuGenResult] = useState<any>(null);
  const [denomValue, setDenomValue] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<any>(null);
  const [deleteError, setDeleteError] = useState('');




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

  // A value is deleted from its own chip; a product from its card. Both refuse
  // server-side when there is history behind them, and that refusal is what the
  // admin needs to read, so it is shown rather than swallowed.
  const deleteDenomination = useMutation({
    mutationFn: (denominationId: string) => api.deleteDenomination(denominationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setDeleteError('');
    },
    onError: (err: any) => setDeleteError(err.message),
  });

  const deleteProduct = useMutation({
    mutationFn: (productId: string) => api.deleteProduct(productId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setConfirmDelete(null);
      setDeleteError('');
    },
    onError: (err: any) => setDeleteError(err.message),
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
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setDeleteError(''); setConfirmDelete(p); }}
                >
                  <Trash2 className="mr-1 h-3 w-3" /> Delete
                </Button>
              </div>
            </div>

            {p.denominations && p.denominations.length > 0 && (
              <div className="mt-5 flex flex-wrap gap-2">
                {p.denominations.map((d: any) => (
                  <Badge key={d.id} className="group bg-secondary text-secondary-foreground">
                    {formatPrice(d.faceValue, d.currency)} <span className="ml-1 text-xs opacity-60">({d.availableCount ?? 0})</span>
                    <button
                      type="button"
                      aria-label={`Delete the ${formatPrice(d.faceValue, d.currency)} value`}
                      title="Delete this value"
                      disabled={deleteDenomination.isPending}
                      onClick={() => {
                        setDeleteError('');
                        deleteDenomination.mutate(d.id);
                      }}
                      className="ml-1.5 rounded p-0.5 opacity-40 transition-opacity hover:bg-destructive/20 hover:text-destructive hover:opacity-100"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            {(!p.denominations || p.denominations.length === 0) && (
              <p className="mt-5 text-xs text-muted-foreground">No denominations configured</p>
            )}

            {deleteError && deleteDenomination.variables &&
              p.denominations?.some((d: any) => d.id === deleteDenomination.variables) && (
              <p role="alert" className="mt-3 text-xs text-destructive">{deleteError}</p>
            )}

            {/* Which codes a product delivers is set on the Delivery Rules
                page, per denomination and per pack. This screen had a second,
                product-level rule editor that did the same job in a different
                place, so there were two answers to one question. */}
          </Card>
        ))}
      </div>

      <Modal
        open={!!confirmDelete}
        onClose={() => { setConfirmDelete(null); setDeleteError(''); }}
        title="Delete this product?"
      >
        <div className="space-y-4">
          <p className="text-sm">
            <span className="font-semibold">{confirmDelete?.name}</span>
            {confirmDelete?.region ? ` (${confirmDelete.region})` : ''} will be deleted, along with
            its code values, regions and packs.
          </p>
          <p className="text-sm text-muted-foreground">
            A product with orders against it, or with codes still stored, cannot be deleted — that
            history has to stay. You will be told which it is.
          </p>
          {deleteError && <p role="alert" className="text-sm text-destructive">{deleteError}</p>}
          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => { setConfirmDelete(null); setDeleteError(''); }}
            >
              Cancel
            </Button>
            <Button
              className="flex-1 bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteProduct.isPending}
              onClick={() => deleteProduct.mutate(confirmDelete.id)}
            >
              {deleteProduct.isPending ? 'Deleting...' : 'Delete product'}
            </Button>
          </div>
        </div>
      </Modal>

      {showCreate && (
        <AddProductModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            queryClient.invalidateQueries({ queryKey: ['products'] });
            setShowCreate(false);
          }}
        />
      )}

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

/**
 * Add a product by walking the catalogue rather than retyping it.
 *
 * Pick the category, then the sub-category, and the region comes with it —
 * "Xbox USA" already knows it is the USA region, so the region is no longer a
 * free-text box where a typo quietly created a region of its own. The code
 * values are entered here too, because a product without them cannot be sold
 * and creating them one dialog at a time afterwards was the slow part.
 */
function AddProductModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: () => api.listCategories() });
  const { data: suppliers } = useQuery({ queryKey: ['suppliers'], queryFn: api.listSuppliers });
  const [categoryId, setCategoryId] = useState('');
  const { data: subcategories } = useQuery({
    queryKey: ['subcategories', categoryId],
    queryFn: () => api.listSubcategories(categoryId, true),
    enabled: !!categoryId,
  });

  const [subcategoryId, setSubcategoryId] = useState('');
  const [name, setName] = useState('');
  const [region, setRegion] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [sku, setSku] = useState('');
  const [values, setValues] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const chosen = (subcategories || []).find((row: any) => row.id === subcategoryId);
  // A sub-category with a region supplies it; one without still needs it typed.
  const effectiveRegion = chosen?.region?.code || region;
  const currency = chosen?.region?.currency || 'USD';

  const { data: suggestedSku } = useQuery({
    queryKey: ['suggest-sku', name, effectiveRegion],
    queryFn: () => api.suggestSku(name, effectiveRegion),
    enabled: name.trim().length > 1 && !!effectiveRegion,
  });

  // "10, 20, 50" or one per line — whatever an admin actually types.
  const parsedValues = values
    .split(/[\s,]+/)
    .map((piece) => piece.trim())
    .filter(Boolean)
    .map(Number);
  const valuesValid = parsedValues.every((value) => Number.isFinite(value) && value > 0);

  const canSubmit = !!categoryId && name.trim().length > 0 && !!effectiveRegion && valuesValid;

  const create = async () => {
    setBusy(true);
    setError('');
    try {
      const product = await api.createProduct({
        name: name.trim(),
        region: effectiveRegion,
        category_id: categoryId,
        subcategory_id: subcategoryId || undefined,
        supplier_id: supplierId || undefined,
        sku: sku.trim() || undefined,
      });
      // Values are added one at a time because that is the endpoint that
      // exists; a failure part-way still leaves the product and whatever was
      // created, so the error says how far it got.
      for (const [index, value] of parsedValues.entries()) {
        try {
          await api.createDenomination(product.id, value, currency);
        } catch (err: any) {
          throw new Error(
            `${name.trim()} was created, but its ${index === 0 ? 'first' : `${index + 1}th`} ` +
            `value failed: ${err.message}. Add the rest from the product card.`,
          );
        }
      }
      onCreated();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Add Product" size="lg">
      <div className="space-y-4">
        <Select
          label="Category"
          value={categoryId}
          onChange={(e: any) => { setCategoryId(e.target.value); setSubcategoryId(''); }}
          options={[
            { value: '', label: '— Select —' },
            ...(categories?.map((c: any) => ({
              value: c.id,
              label: c.brand ? `${c.brand.name} › ${c.name}` : c.name,
            })) || []),
          ]}
        />

        <Select
          label="Sub-category"
          value={subcategoryId}
          onChange={(e: any) => setSubcategoryId(e.target.value)}
          options={[
            {
              value: '',
              label: !categoryId
                ? 'Pick a category first'
                : (subcategories || []).length === 0
                  ? 'None yet — add one under Catalog'
                  : '— None —',
            },
            ...((subcategories || []).map((row: any) => ({
              value: row.id,
              label: row.region ? `${row.name} (${row.region.code})` : row.name,
            }))),
          ]}
        />

        {chosen?.region ? (
          <p className="text-xs text-muted-foreground">
            Region <span className="font-medium text-foreground">{chosen.region.name} ({chosen.region.code})</span>,
            pricing in {chosen.region.currency} — taken from the sub-category.
          </p>
        ) : (
          <Input
            label="Region"
            value={region}
            onChange={(e: any) => setRegion(e.target.value)}
            placeholder="e.g. USA"
          />
        )}

        <Input
          label="Name"
          value={name}
          onChange={(e: any) => setName(e.target.value)}
          placeholder="e.g. Xbox Gift Card"
        />

        <div className="space-y-2">
          <Input
            label="SKU — matches storefront orders to this product"
            value={sku}
            onChange={(e: any) => setSku(e.target.value)}
            placeholder={suggestedSku?.sku || 'e.g. XBOX-USA'}
          />
          {suggestedSku?.sku && sku !== suggestedSku.sku && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Suggested: <span className="font-mono text-primary">{suggestedSku.sku}</span></span>
              <button
                type="button"
                className="rounded border border-input px-2 py-0.5 hover:bg-muted"
                onClick={() => setSku(suggestedSku.sku)}
              >
                Use this
              </button>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Leave blank and one is assigned automatically.
          </p>
        </div>

        <div className="space-y-2">
          <Input
            label={`Code values (${currency})`}
            value={values}
            onChange={(e: any) => setValues(e.target.value)}
            placeholder="10, 20, 50, 100"
          />
          {parsedValues.length > 0 && valuesValid && (
            <p className="text-xs text-muted-foreground">
              Creates {parsedValues.length} value(s): {parsedValues.map((v) => formatPrice(v, currency)).join(', ')}
            </p>
          )}
          {!valuesValid && (
            <p role="alert" className="text-xs text-destructive">
              Values must be numbers above zero, separated by commas or spaces.
            </p>
          )}
        </div>

        <Select
          label="Supplier (optional)"
          value={supplierId}
          onChange={(e: any) => setSupplierId(e.target.value)}
          options={[
            { value: '', label: '— None —' },
            ...(suppliers?.map((sup: any) => ({ value: sup.id, label: sup.name })) || []),
          ]}
        />

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" disabled={!canSubmit || busy} onClick={create}>
            {busy ? 'Creating...' : 'Create product'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
