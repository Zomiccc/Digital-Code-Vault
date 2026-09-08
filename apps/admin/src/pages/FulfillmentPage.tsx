import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { RotateCcw, Plus, Copy, Check, Loader2 } from 'lucide-react';
import { Input, Select } from '@/components/ui';
import { api } from '@/lib/api';
import { Card, Button, Table, Th, Td, Badge, Modal, AddressWithMapsLink } from '@/components/ui';
import { formatCurrency, formatDate, statusColor, formatPrice } from '@/lib/utils';

export function FulfillmentPage() {
  const queryClient = useQueryClient();
  const [reverseItem, setReverseItem] = useState<any>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [orderResult, setOrderResult] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const [orderForm, setOrderForm] = useState({
    productId: '', variantId: '', amount: '', chargeAmount: '',
    chargeCurrency: 'USD', customerEmail: '', customerName: '',
  });
  const amount = Number(orderForm.amount);
  // What to charge is entered; the discount is worked out from it, so the two
  // can never disagree and the admin types the number they actually care about.
  // Whatever the admin types is what gets charged and recorded. Blank means
  // charge the order value, which the server fills in.
  const charge = orderForm.chargeAmount === '' ? amount : Number(orderForm.chargeAmount);
  const validMoney = (value: number) => Number.isFinite(value) && Number.isSafeInteger(Math.round(value * 100)) && Math.abs(value * 100 - Math.round(value * 100)) < 1e-7;
  const validAmount = validMoney(amount) && amount > 0;
  // Any amount may be charged; only the shape is checked.
  const validCharge = validMoney(charge) && charge >= 0;

  const { data: hierarchyForOrder } = useQuery({ queryKey: ['catalog-hierarchy'], queryFn: api.getCatalogHierarchy, enabled: showCreate });
  const orderProducts = (hierarchyForOrder || []).flatMap((c: any) => c.products);
  const selectedProductData = orderProducts.find((p: any) => p.id === orderForm.productId);
  const selectedProductVariants = selectedProductData?.productRegions?.flatMap((pr: any) => pr.variants) || [];
  // The catalogue lists every value ever defined for a product, whether or not
  // a code is left in it. Ordering a value with empty stock failed at
  // allocation with "no combination sums to 150", so the real counts are
  // fetched and shown instead.
  const { data: denominationStock } = useQuery({
    queryKey: ['denomination-stock', orderForm.productId],
    queryFn: () => api.getProductDenominationStock(orderForm.productId),
    enabled: showCreate && !!orderForm.productId,
  });
  const selectedProductDenominations = (denominationStock as any[]) || [];
  // Denominations of one product share a currency, so the first one names it.
  const orderValueCurrency = selectedProductDenominations[0]?.currency || 'USD';
  const inStock = selectedProductDenominations.filter((d: any) => (d.available_stock ?? 0) > 0);
  const stockTotal = inStock.reduce(
    (sum: number, d: any) => sum + Number(d.face_value) * (d.available_stock ?? 0), 0,
  );
  // True when the typed value is not one of the stocked values, so the order
  // will be made up from a combination rather than a single matching code.
  const isCustomAmount = !inStock.some((d: any) => Number(d.face_value) === amount);
  // Nothing on the shelf adds up to this, so the order will be refused.
  const beyondStock = validAmount && amount > stockTotal;

  const createOrderMutation = useMutation({
    mutationFn: () => api.createManualOrder({
      productId: orderForm.productId,
      amount: parseFloat(orderForm.amount),
      chargeAmount: orderForm.chargeAmount === '' ? undefined : charge,
      chargeCurrency: orderForm.chargeCurrency,
      variantId: orderForm.variantId || undefined,
      customerEmail: orderForm.customerEmail || undefined,
      customerName: orderForm.customerName || undefined,
    }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['fulfillment'] });
      setOrderResult(data);
      setOrderForm({
        productId: '', variantId: '', amount: '', chargeAmount: '',
        chargeCurrency: 'USD', customerEmail: '', customerName: '',
      });
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
      <Modal open={showCreate} onClose={() => { setShowCreate(false); setOrderResult(null); }} title="Create Order Manually (admin-managed)">
        {orderResult ? (
          <div className="space-y-4">
            <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-4 py-3">
              <p className="font-semibold text-emerald-500">Order Created Successfully</p>
            </div>
            <div className="space-y-2 text-sm">
              <div><span className="text-muted-foreground">Fulfillment ID:</span> <span className="font-mono">{orderResult.fulfillment_id}</span></div>
              <div><span className="text-muted-foreground">Status:</span> <span className="font-medium">{orderResult.status}</span></div>
              <div><span className="text-muted-foreground">Allocation:</span> {orderResult.allocation?.join(', ')}</div>
              <div>Original value: {formatPrice(orderResult.original_amount, orderResult.currency)}</div>
              <div className="font-semibold">
                Charged: {formatPrice(orderResult.charge_amount ?? orderResult.net_amount, orderResult.currency)}
              </div>
              <div>Discount: {formatPrice(orderResult.discount_amount, orderResult.currency)}</div>
              {orderResult.delivery_link && (
                <div className="pt-2">
                  <div className="text-muted-foreground mb-1">Delivery Link:</div>
                  <div className="flex items-center gap-2 rounded-lg bg-background p-3 font-mono text-sm break-all">
                    <span className="flex-1">{orderResult.delivery_link}</span>
                    <button
                      onClick={() => { navigator.clipboard.writeText(orderResult.delivery_link); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                      className="shrink-0 rounded p-1 hover:bg-secondary"
                    >
                      {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              )}
            </div>
            <Button className="w-full" onClick={() => { setShowCreate(false); setOrderResult(null); }}>Done</Button>
          </div>
        ) : (
        <div className="space-y-4">
          <p className="rounded-lg bg-primary/5 border border-primary/20 px-4 py-2.5 text-xs text-muted-foreground">
            Admin orders are fulfilled from vault stock at the platform's own responsibility — no merchant wallet is charged.
          </p>
          <Select
            label="Product"
            value={orderForm.productId}
            onChange={(e) => setOrderForm({ ...orderForm, productId: e.target.value, variantId: '', amount: '', chargeAmount: '' })}
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
          {selectedProductDenominations.length > 0 && !orderForm.variantId && (
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Quick pick
              </label>
              {/* Every value is orderable, whatever its own stock. A $150 order
                  with no $150 codes left is filled from three $50s, so striking
                  those values out and refusing the click was simply wrong — it
                  hid orders that go through perfectly well. The count is a hint
                  about which single code is on the shelf, nothing more. */}
              <div className="flex flex-wrap gap-2">
                {selectedProductDenominations.map((d: any) => {
                  const left = d.available_stock ?? 0;
                  const selected = orderForm.amount === String(Number(d.face_value));
                  return (
                    <button
                      key={d.id}
                      type="button"
                      title={left > 0
                        ? `${left} code(s) of this value available`
                        : 'No code of this value — the order is made up from other codes'}
                      onClick={() => setOrderForm({ ...orderForm, amount: String(Number(d.face_value)) })}
                      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                        selected
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                      }`}
                    >
                      {formatPrice(d.face_value, d.currency)}
                      {left > 0 && (
                        <span className={`ml-1.5 text-xs ${selected ? 'opacity-80' : 'opacity-60'}`}>
                          {left}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                {inStock.length === 0
                  ? 'No codes are in stock for this product — upload some before ordering.'
                  : `The small number is how many codes of that exact value are left; a value with none is made up from other codes. In stock altogether: ${formatPrice(stockTotal, orderValueCurrency)}.`}
              </p>
            </div>
          )}
          {/* Any amount is allowed, not only the values above: allocation adds up
              available codes to reach it. Only the chips were obvious before, so
              a one-off order for an unlisted amount looked impossible. */}
          <Input
            label={`Order value — any amount (${orderValueCurrency})`}
            type="number" min="0.01" step="0.01"
            value={orderForm.amount}
            onChange={(e) => setOrderForm({ ...orderForm, amount: e.target.value })}
            placeholder="e.g. 37.50"
          />
          {validAmount && !orderForm.variantId && selectedProductDenominations.length > 0 && (
            beyondStock ? (
              <p className="text-xs text-amber-500">
                Only {formatPrice(stockTotal, orderValueCurrency)} of codes are in stock, so
                {' '}{formatPrice(amount, orderValueCurrency)} cannot be delivered.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                {isCustomAmount
                  ? `Will be made up from codes in stock that add up to exactly ${formatPrice(amount, orderValueCurrency)} — if no combination does, the order is refused.`
                  : 'A code of this exact value is in stock.'}
              </p>
            )
          )}
          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Charge in
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              {(['USD', 'PKR'] as const).map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setOrderForm({ ...orderForm, chargeCurrency: code })}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition-all ${
                    orderForm.chargeCurrency === code
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:border-primary/50'
                  }`}
                >
                  {code === 'USD' ? '$ USD' : '\u20a8 PKR'}
                </button>
              ))}
            </div>
          </div>
          <Input
            label={`Amount to charge (${orderForm.chargeCurrency}, optional)`}
            type="number" min="0" step="0.01"
            value={orderForm.chargeAmount}
            onChange={(e) => setOrderForm({ ...orderForm, chargeAmount: e.target.value })}
            placeholder={validAmount ? String(amount) : '0.00'}
          />
          {!validCharge && (
            <p role="alert" className="text-sm text-destructive">
              The amount to charge must be zero or more, with at most two decimal places.
            </p>
          )}
          <Input label="Customer email (sends delivery link)" type="email" value={orderForm.customerEmail} onChange={(e) => setOrderForm({ ...orderForm, customerEmail: e.target.value })} placeholder="customer@example.com" />
          <Input label="Customer name (optional)" value={orderForm.customerName} onChange={(e) => setOrderForm({ ...orderForm, customerName: e.target.value })} placeholder="John Doe" />
          {createOrderMutation.isError && (
            <p className="text-sm text-destructive">{(createOrderMutation.error as Error).message}</p>
          )}
          {createOrderMutation.isSuccess && !showCreate ? null : null}
          <Button
            className="w-full"
            disabled={!orderForm.productId || !validAmount || !validCharge || createOrderMutation.isPending}
            onClick={() => createOrderMutation.mutate()}
          >
            {createOrderMutation.isPending ? 'Creating...' : 'Create & Deliver'}
          </Button>
        </div>
        )}
      </Modal>

      <Card className="p-0">
        <Table>
          <thead>
            <tr>
              <Th>ID</Th>
              <Th>Merchant</Th>
              <Th>Merchant Address</Th>
              <Th>Product</Th>
              <Th>Order value</Th>
              <Th>Charged</Th>
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
                <Td className="font-medium">{formatPrice(req.amount, req.currency)}</Td>
                <ChargedCell req={req} />
                <Td><Badge className={statusColor(req.status)}>{req.status}</Badge></Td>
                <Td><AddressWithMapsLink address={req.customer_address} /></Td>
                {/* The API returns created_at; reading createdAt left this blank. */}
                <Td className="text-muted-foreground">{formatDate(req.created_at)}</Td>
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
                <Td colSpan={10} className="py-12 text-center text-muted-foreground">
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
            {reverseItem?.walletCharged
              ? `This will release allocated codes back to inventory and refund ${formatCurrency(reverseItem?.amount)} to the merchant wallet.`
              : 'This will release allocated codes back to inventory and reverse any recorded platform revenue. No merchant wallet refund is due.'}
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

/**
 * What was actually taken for this order, in the currency it was taken in.
 *
 * A manual sale is priced by hand — an admin can charge 45,000 rupees for a
 * $170 order — and the only record of that figure was buried on the order row.
 * The discount underneath is shown only when the charge and the order value are
 * in the same currency, because rupees minus dollars is not a discount.
 */
function ChargedCell({ req }: { req: any }) {
  const charged = Number(req.chargedAmount ?? 0);
  if (!charged) {
    return <Td className="text-muted-foreground">—</Td>;
  }

  const currency = req.chargedCurrency || req.currency;
  const sameCurrency = currency === req.currency;
  const difference = sameCurrency
    ? (Math.round(Number(req.amount) * 100) - Math.round(charged * 100)) / 100
    : 0;

  return (
    <Td className="font-medium">
      {formatPrice(charged, currency)}
      {!sameCurrency && (
        <div className="text-xs text-muted-foreground">charged in {currency}</div>
      )}
      {difference > 0 && (
        <div className="text-xs text-emerald-500">
          Discount {formatPrice(difference, currency)}
        </div>
      )}
      {difference < 0 && (
        <div className="text-xs text-amber-500">
          Markup {formatPrice(Math.abs(difference), currency)}
        </div>
      )}
    </Td>
  );
}
