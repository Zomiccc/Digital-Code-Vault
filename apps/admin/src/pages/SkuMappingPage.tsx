import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, Button, Badge, Table, Th, Td, Input, Select, Modal } from '@/components/ui';
import { formatDate } from '@/lib/utils';

/**
 * SKU Mapping (admin-wide)
 * Every storefront (WooCommerce, etc.) SKU synced from ANY merchant is listed here.
 * Admin maps each SKU to an internal Product / Denomination / Variant so incoming
 * webhook orders resolve to the correct code inventory automatically. Unmapped SKUs
 * are safely rejected at fulfillment time (no wallet debit, no inventory allocation)
 * until mapped here.
 */
export function SkuMappingPage() {
  const queryClient = useQueryClient();
  const [merchantFilter, setMerchantFilter] = useState('');
  const [unmappedOnly, setUnmappedOnly] = useState(false);
  const [mappingTarget, setMappingTarget] = useState<any>(null);
  const [showCreate, setShowCreate] = useState(false);

  const { data: merchants } = useQuery({ queryKey: ['admin-merchants'], queryFn: api.listMerchants });
  const { data: hierarchy } = useQuery({ queryKey: ['catalog-hierarchy'], queryFn: api.getCatalogHierarchy });
  const products = (hierarchy || []).flatMap((c: any) => c.products);

  const { data: connectedProducts, isLoading } = useQuery({
    queryKey: ['admin-connected-products', merchantFilter, unmappedOnly],
    queryFn: () => api.adminListConnectedProducts({ merchantId: merchantFilter || undefined, unmapped: unmappedOnly }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.adminDeleteConnectedProduct(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-connected-products'] }),
  });

  if (isLoading) return <div className="text-muted-foreground">Loading SKU mappings...</div>;

  return (
    <div className="space-y-6 animate-slide-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">SKU Mapping</h1>
          <p className="text-sm text-muted-foreground">
            Map every storefront SKU (WooCommerce, etc.) across all merchants to an internal product, denomination, or variant.
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="mr-2 h-4 w-4" /> Add SKU Mapping
        </Button>
      </div>

      <Card>
        <div className="grid gap-4 md:grid-cols-3">
          <Select
            label="Filter by merchant"
            value={merchantFilter}
            onChange={(e) => setMerchantFilter(e.target.value)}
            options={[
              { value: '', label: 'All merchants' },
              ...(merchants || []).map((m: any) => ({ value: m.id, label: m.name })),
            ]}
          />
          <div className="flex items-end pb-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={unmappedOnly} onChange={(e) => setUnmappedOnly(e.target.checked)} />
              Show unmapped only
            </label>
          </div>
        </div>
      </Card>

      <Card className="p-0">
        <Table>
          <thead>
            <tr>
              <Th>Merchant</Th>
              <Th>Platform</Th>
              <Th>SKU</Th>
              <Th>Product Name</Th>
              <Th>Price</Th>
              <Th>Mapping</Th>
              <Th>Last Synced</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {Array.isArray(connectedProducts) && connectedProducts.map((p: any) => (
              <tr key={p.id} className="group hover:bg-muted/30">
                <Td>{p.merchant?.name || '-'}</Td>
                <Td>{p.platform}</Td>
                <Td className="font-mono text-xs">{p.sku || p.platformSku || '-'}</Td>
                <Td>{p.name}</Td>
                <Td>{p.price ? `${p.currency || 'USD'} ${p.price}` : '-'}</Td>
                <Td>
                  {p.dcvProductId ? (
                    <Badge className="bg-emerald-500/10 text-emerald-500">Mapped: {p.dcvProduct?.name || p.dcvProductId}</Badge>
                  ) : (
                    <Badge className="bg-amber-500/10 text-amber-500">Unmapped</Badge>
                  )}
                </Td>
                <Td className="text-muted-foreground">{p.lastSyncedAt ? formatDate(p.lastSyncedAt) : '-'}</Td>
                <Td className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button variant={p.dcvProductId ? 'outline' : 'primary'} size="sm" onClick={() => setMappingTarget(p)}>
                      {p.dcvProductId ? 'Edit' : 'Map'}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => { if (confirm('Delete this SKU mapping entry?')) deleteMutation.mutate(p.id); }}>
                      Delete
                    </Button>
                  </div>
                </Td>
              </tr>
            ))}
            {(!Array.isArray(connectedProducts) || connectedProducts.length === 0) && (
              <tr>
                <Td colSpan={8} className="py-12 text-center text-muted-foreground">
                  No SKU mappings yet. Add one manually or wait for a webhook to sync a product.
                </Td>
              </tr>
            )}
          </tbody>
        </Table>
      </Card>

      {mappingTarget && (
        <MappingModal
          target={mappingTarget}
          products={products}
          onClose={() => setMappingTarget(null)}
        />
      )}

      {showCreate && (
        <CreateMappingModal
          merchants={merchants || []}
          products={products}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  );
}

function MappingModal({ target, products, onClose }: { target: any; products: any[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [productId, setProductId] = useState(target.dcvProductId || '');
  const [denominationId, setDenominationId] = useState(target.dcvDenominationId || '');
  const [variantId, setVariantId] = useState(target.dcvVariantId || '');

  const selectedProduct = products.find((p: any) => p.id === productId);
  const denominations = selectedProduct?.denominations || [];
  const variants = (selectedProduct?.productRegions || []).flatMap((pr: any) => pr.variants);

  const saveMutation = useMutation({
    mutationFn: () =>
      api.adminUpdateConnectedProduct(target.id, {
        dcv_product_id: productId || null,
        dcv_denomination_id: denominationId || null,
        dcv_variant_id: variantId || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-connected-products'] });
      onClose();
    },
  });

  return (
    <Modal open onClose={onClose} title="Map SKU">
      <div className="space-y-4">
        <div className="rounded-lg bg-muted/50 p-3 text-sm">
          <div className="font-semibold">{target.name}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            Merchant: {target.merchant?.name || '-'} · Platform: {target.platform} · SKU: {target.sku || target.platformSku || '-'}
          </div>
        </div>

        <Select
          label="Internal Product"
          value={productId}
          onChange={(e) => { setProductId(e.target.value); setDenominationId(''); setVariantId(''); }}
          options={[
            { value: '', label: '— Select product —' },
            ...products.map((p: any) => ({ value: p.id, label: `${p.name} (${p.region})` })),
          ]}
        />

        {denominations.length > 0 && (
          <Select
            label="Denomination (optional — match any if blank)"
            value={denominationId}
            onChange={(e) => setDenominationId(e.target.value)}
            options={[
              { value: '', label: 'Any denomination' },
              ...denominations.map((d: any) => ({ value: d.id, label: `${d.currency} ${d.faceValue}` })),
            ]}
          />
        )}

        {variants.length > 0 && (
          <Select
            label="Variant / Plan (optional)"
            value={variantId}
            onChange={(e) => setVariantId(e.target.value)}
            options={[
              { value: '', label: 'None (amount-based)' },
              ...variants.map((v: any) => ({ value: v.id, label: v.name })),
            ]}
          />
        )}

        {saveMutation.isError && (
          <p className="text-sm text-red-600">{(saveMutation.error as any)?.message || 'Failed to save mapping'}</p>
        )}

        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
          <Button onClick={() => saveMutation.mutate()} disabled={!productId || saveMutation.isPending} className="flex-1">
            {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save Mapping'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function CreateMappingModal({ merchants, products, onClose }: { merchants: any[]; products: any[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [merchantId, setMerchantId] = useState('');
  const [platform, setPlatform] = useState('woocommerce');
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [productId, setProductId] = useState('');
  const [denominationId, setDenominationId] = useState('');
  const [variantId, setVariantId] = useState('');

  const selectedProduct = products.find((p: any) => p.id === productId);
  const denominations = selectedProduct?.denominations || [];
  const variants = (selectedProduct?.productRegions || []).flatMap((pr: any) => pr.variants);

  const createMutation = useMutation({
    mutationFn: () =>
      api.adminCreateConnectedProduct({
        merchant_id: merchantId,
        platform,
        platform_sku: sku,
        name,
        dcv_product_id: productId || undefined,
        dcv_denomination_id: denominationId || undefined,
        dcv_variant_id: variantId || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-connected-products'] });
      onClose();
    },
  });

  const valid = merchantId && platform && sku && name;

  return (
    <Modal open onClose={onClose} title="Add SKU Mapping">
      <div className="space-y-4">
        <Select
          label="Merchant"
          value={merchantId}
          onChange={(e) => setMerchantId(e.target.value)}
          options={[
            { value: '', label: '— Select merchant —' },
            ...merchants.map((m: any) => ({ value: m.id, label: m.name })),
          ]}
        />
        <Input label="Platform" value={platform} onChange={(e) => setPlatform(e.target.value)} placeholder="woocommerce" />
        <Input label="Storefront SKU" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="e.g. PSN-USA-10" />
        <Input label="Product name (for display)" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. PSN USA $10 Card" />

        <Select
          label="Internal Product"
          value={productId}
          onChange={(e) => { setProductId(e.target.value); setDenominationId(''); setVariantId(''); }}
          options={[
            { value: '', label: '— Select product —' },
            ...products.map((p: any) => ({ value: p.id, label: `${p.name} (${p.region})` })),
          ]}
        />

        {denominations.length > 0 && (
          <Select
            label="Denomination (optional)"
            value={denominationId}
            onChange={(e) => setDenominationId(e.target.value)}
            options={[
              { value: '', label: 'Any denomination' },
              ...denominations.map((d: any) => ({ value: d.id, label: `${d.currency} ${d.faceValue}` })),
            ]}
          />
        )}

        {variants.length > 0 && (
          <Select
            label="Variant / Plan (optional)"
            value={variantId}
            onChange={(e) => setVariantId(e.target.value)}
            options={[
              { value: '', label: 'None (amount-based)' },
              ...variants.map((v: any) => ({ value: v.id, label: v.name })),
            ]}
          />
        )}

        {createMutation.isError && (
          <p className="text-sm text-red-600">{(createMutation.error as any)?.message || 'Failed to create mapping'}</p>
        )}

        <Button onClick={() => createMutation.mutate()} disabled={!valid || createMutation.isPending} className="w-full">
          {createMutation.isPending ? 'Creating...' : 'Create SKU Mapping'}
        </Button>
      </div>
    </Modal>
  );
}
