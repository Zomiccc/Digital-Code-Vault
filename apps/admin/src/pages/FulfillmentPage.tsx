import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { RotateCcw, Plus } from 'lucide-react';
import { Input, Select } from '@/components/ui';
import { api } from '@/lib/api';
import { Card, Button, Table, Th, Td, Badge, Modal, AddressWithMapsLink } from '@/components/ui';
import { formatCurrency, formatDate, statusColor, formatPrice } from '@/lib/utils';

export function FulfillmentPage() {
  const queryClient = useQueryClient();
  const [reverseItem, setReverseItem] = useState<any>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [orderForm, setOrderForm] = useState({ productId: '', variantId: '', amount: '', customerEmail: '', customerName: '' });

  const { data: hierarchyForOrder } = useQuery({ queryKey: ['catalog-hierarchy'], queryFn: api.getCatalogHierarchy, enabled: showCreate });
  const orderProducts = (hierarchyForOrder || []).flatMap((c: any) => c.products);
  const selectedProductVariants = orderProducts.find((p: any) => p.id === orderForm.productId)?.productRegions?.flatMap((pr: any) => pr.variants) || [];

  const createOrderMutation = useMutation({
    mutationFn: () => api.createManualOrder({
      productId: orderForm.productId,
      amount: parseFloat(orderForm.amount),
      variantId: orderForm.variantId || undefined,
      customerEmail: orderForm.customerEmail || undefined,
      customerName: orderForm.customerName || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fulfillment'] });
      setShowCreate(false);
      setOrderForm({ productId: '', variantId: '', amount: '', customerEmail: '', customerName: '' });
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ['fulfillment'],
    queryFn: () => api.listFulfillment(50, 0),
  });

  const reverseMutation = useMutation({
    mutationFn: (id: string) => api.reverseFulfillment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fulfillment'] });
      setReverseItem(null);
    },
  });

  if (isLoading) {
    return <div className="flex h-full items-center justify-center text-muted-foreground">Loading fulfillment...</div>;
  }

  return (
    <div className="space-y-6 animate-slide-up">
      <div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Fulfillment Requests</h1>
            <p className="text-sm text-muted-foreground">Monitor and manage all fulfillment requests</p>
          </div>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="mr-2 h-4 w-4" /> Create Order
          </Button>
        </div>
      </div>

      {/* Manual order modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Order Manually (admin-managed)">
        <div className="space-y-4">
          <p className="rounded-lg bg-primary/5 border border-primary/20 px-4 py-2.5 text-xs text-muted-foreground">
            Admin orders are fulfilled from vault stock at the platform's own responsibility — no merchant wallet is charged.
          </p>
          <Select
            label="Product"
            value={orderForm.productId}
            onChange={(e) => setOrderForm({ ...orderForm, productId: e.target.value, variantId: '', amount: '' })}
            options={[
              { value: '', label: '— Select product —' },
              ...orderProducts.map((p: any) => ({ value: p.id, label: `${p.name} (${p.region})` })),
            ]}
          />
          {(selectedProductVariants.length > 0) && (
            <Select
              label="Variant / Plan (optional)"
              value={orderForm.variantId}
              onChange={(e) => {
                const v = selectedProductVariants.find((x: any) => x.id === e.target.value);
                setOrderForm({ ...orderForm, variantId: e.target.value, amount: v ? String(Number(v.customerPrice)) : orderForm.amount });
              }}
              options={[
                { value: '', label: '— None (amount-based) —' },
                ...selectedProductVariants.map((v: any) => ({ value: v.id, label: `${v.name} — ${formatPrice(v.customerPrice, v.currency)}` })),
              ]}
            />
          )}
          <Input label="Amount (USD charged to wallet)" type="number" value={orderForm.amount} onChange={(e) => setOrderForm({ ...orderForm, amount: e.target.value })} placeholder="30.00" />
          <Input label="Customer email (sends delivery link)" type="email" value={orderForm.customerEmail} onChange={(e) => setOrderForm({ ...orderForm, customerEmail: e.target.value })} placeholder="customer@example.com" />
          <Input label="Customer name (optional)" value={orderForm.customerName} onChange={(e) => setOrderForm({ ...orderForm, customerName: e.target.value })} placeholder="John Doe" />
          {createOrderMutation.isError && (
            <p className="text-sm text-destructive">{(createOrderMutation.error as Error).message}</p>
          )}
          {createOrderMutation.isSuccess && !showCreate ? null : null}
          <Button
            className="w-full"
            disabled={!orderForm.productId || !orderForm.amount || parseFloat(orderForm.amount) <= 0 || createOrderMutation.isPending}
            onClick={() => createOrderMutation.mutate()}
          >
            {createOrderMutation.isPending ? 'Creating...' : 'Create & Deliver'}
          </Button>
        </div>
      </Modal>

      <Card className="p-0">
        <Table>
          <thead>
            <tr>
              <Th>ID</Th>
              <Th>Merchant</Th>
              <Th>Merchant Address</Th>
              <Th>Product</Th>
              <Th>Amount</Th>
              <Th>Status</Th>
              <Th>Customer Address</Th>
              <Th>Created</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {data?.items?.map((req: any) => (
              <tr key={req.id} className="group hover:bg-muted/30">
                <Td className="font-mono text-xs text-muted-foreground">{req.id.slice(0, 12)}</Td>
                <Td className="font-medium">{req.merchant?.name}</Td>
                <Td><AddressWithMapsLink address={req.merchant?.address} /></Td>
                <Td className="text-muted-foreground">{req.product?.name}</Td>
                <Td className="font-medium">{formatCurrency(req.amount)}</Td>
                <Td><Badge className={statusColor(req.status)}>{req.status}</Badge></Td>
                <Td><AddressWithMapsLink address={req.customer_address} /></Td>
                <Td className="text-muted-foreground">{formatDate(req.createdAt)}</Td>
                <Td className="text-right">
                  {(req.status === 'ALLOCATED' || req.status === 'PENDING') && (
                    <Button variant="outline" size="sm" onClick={() => setReverseItem(req)}>
                      <RotateCcw className="mr-1 h-3 w-3" /> Reverse
                    </Button>
                  )}
                </Td>
              </tr>
            ))}
            {(!data?.items || data.items.length === 0) && (
              <tr>
                <Td colSpan={9} className="py-12 text-center text-muted-foreground">
                  No fulfillment requests yet.
                </Td>
              </tr>
            )}
          </tbody>
        </Table>
      </Card>

      <Modal open={!!reverseItem} onClose={() => setReverseItem(null)} title="Reverse Fulfillment">
        <div className="space-y-4">
          <p className="text-sm">
            Are you sure you want to reverse fulfillment <span className="font-mono">{reverseItem?.id?.slice(0, 16)}</span>?
          </p>
          <p className="text-sm text-muted-foreground">
            This will release allocated codes back to inventory and refund {formatCurrency(reverseItem?.amount)} to the merchant wallet.
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setReverseItem(null)} className="flex-1">Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => reverseMutation.mutate(reverseItem.id)}
              disabled={reverseMutation.isPending}
              className="flex-1"
            >
              {reverseMutation.isPending ? 'Reversing...' : 'Confirm Reverse'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
