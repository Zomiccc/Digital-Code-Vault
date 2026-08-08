import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, Button, Input, Badge, AddressWithMapsLink } from '@/components/ui';
import { Gift, ShoppingBag, Copy, Check, Store, ArrowRight, Package, Loader2 } from 'lucide-react';

export function CustomerDashboardPage() {
  const { data: profile } = useQuery({ queryKey: ['customer-profile'], queryFn: api.customerProfile });
  const { data: orders } = useQuery({ queryKey: ['customer-orders'], queryFn: api.customerOrders });

  const activeOrders = orders?.filter((o: any) => o.status === 'ALLOCATED' || o.status === 'PENDING') || [];
  const pastOrders = orders?.filter((o: any) => o.status !== 'ALLOCATED' && o.status !== 'PENDING') || [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">My Dashboard</h1>
        <p className="text-sm text-muted-foreground">Welcome back, {profile?.name || 'Customer'}</p>
      </div>

      {profile?.isMerchant && (
        <Card className="border-primary/30 bg-primary/5">
          <div className="flex items-center gap-3">
            <Store className="h-5 w-5 text-primary" />
            <div>
              <p className="font-semibold">You have a merchant account</p>
              <p className="text-sm text-muted-foreground">Switch to merchant view from the sidebar to manage your store</p>
            </div>
          </div>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2.5">
              <ShoppingBag className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{orders?.length || 0}</p>
              <p className="text-xs text-muted-foreground">Total Orders</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-emerald-500/10 p-2.5">
              <Gift className="h-5 w-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{activeOrders.length}</p>
              <p className="text-xs text-muted-foreground">Active Deliveries</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-amber-500/10 p-2.5">
              <Package className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{pastOrders.length}</p>
              <p className="text-xs text-muted-foreground">Completed</p>
            </div>
          </div>
        </Card>
      </div>

      <div>
        <h2 className="text-xl font-semibold mb-4">Recent Orders</h2>
        {orders && orders.length > 0 ? (
          <div className="space-y-3">
            {orders.slice(0, 10).map((order: any) => (
              <Card key={order.id}>
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="font-semibold">{order.product_name}</p>
                    <p className="text-sm text-muted-foreground">
                      ${order.amount} • {new Date(order.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge className={
                      order.status === 'ALLOCATED' ? 'bg-emerald-500/10 text-emerald-500' :
                      order.status === 'FAILED' ? 'bg-destructive/10 text-destructive' :
                      'bg-amber-500/10 text-amber-500'
                    }>
                      {order.status}
                    </Badge>
                    {order.delivery_link && (
                      <a href={order.delivery_link} target="_blank" rel="noopener noreferrer">
                        <Button variant="outline" size="sm">
                          <Gift className="mr-1.5 h-3.5 w-3.5" /> View Codes
                        </Button>
                      </a>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <p className="text-center text-muted-foreground py-8">No orders yet. Browse products to get started!</p>
          </Card>
        )}
      </div>
    </div>
  );
}

export function CustomerProductsPage() {
  const { data: products, isLoading } = useQuery({ queryKey: ['customer-products'], queryFn: api.customerProducts });

  if (isLoading) return <div className="text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Browse Products</h1>
        <p className="text-sm text-muted-foreground">Digital codes available for purchase</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {products?.map((p: any) => (
          <Card key={p.id}>
            <h3 className="font-semibold">{p.name}</h3>
            <p className="text-sm text-muted-foreground">{p.region}</p>
            {p.denominations?.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {p.denominations.map((d: any) => (
                  <Badge key={d.id} className="bg-secondary text-secondary-foreground">${d.faceValue}</Badge>
                ))}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

export function CustomerCreateOrderPage() {
  const queryClient = useQueryClient();
  const [selectedProduct, setSelectedProduct] = useState('');
  const [amount, setAmount] = useState('');
  const [referenceId, setReferenceId] = useState('');
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const { data: products, isLoading: productsLoading } = useQuery({ queryKey: ['customer-products'], queryFn: api.customerProducts });
  const { data: denominations } = useQuery({
    queryKey: ['customer-denoms', selectedProduct],
    queryFn: () => api.customerDenominations(selectedProduct),
    enabled: !!selectedProduct,
  });

  const createMutation = useMutation({
    mutationFn: () => api.customerCreateOrder(selectedProduct, parseFloat(amount), referenceId || undefined),
    onSuccess: (data) => {
      setResult(data);
      setError('');
      queryClient.invalidateQueries({ queryKey: ['customer-orders'] });
    },
    onError: (err: any) => {
      const msg = err.message || 'Failed to create order';
      setError(msg);
    },
  });

  const handleCopy = () => {
    if (result?.delivery_link) {
      navigator.clipboard.writeText(result.delivery_link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Order Digital Codes</h1>
        <p className="text-sm text-muted-foreground">Select a product and amount to get instant delivery</p>
      </div>

      <Card>
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Product</label>
            <select
              value={selectedProduct}
              onChange={(e) => { setSelectedProduct(e.target.value); setAmount(''); }}
              className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
            >
              <option value="">Select a product...</option>
              {products?.map((p: any) => (
                <option key={p.id} value={p.id}>{p.name} ({p.region})</option>
              ))}
            </select>
          </div>

          {denominations && denominations.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {denominations.map((d: any) => (
                <button
                  key={d.id}
                  onClick={() => setAmount(String(d.face_value))}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    amount === String(d.face_value)
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                  }`}
                >
                  ${d.face_value}
                </button>
              ))}
            </div>
          )}

          <Input label="Amount (USD)" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="10.00" required />
          <Input label="Reference ID (optional)" value={referenceId} onChange={(e) => setReferenceId(e.target.value)} placeholder="order-12345" />

          {error && <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}

          <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !selectedProduct || !amount || parseFloat(amount) <= 0}>
            {createMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {createMutation.isPending ? 'Creating...' : 'Place Order'}
          </Button>
        </div>
      </Card>

      {result && (
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <h3 className="font-semibold text-emerald-400">Order Created Successfully!</h3>
          <div className="mt-3 space-y-2 text-sm">
            <div><span className="text-muted-foreground">Order ID:</span> <span className="font-mono">{result.fulfillment_id}</span></div>
            <div><span className="text-muted-foreground">Status:</span> <span className="font-medium">{result.status}</span></div>
            {result.allocation && (
              <div><span className="text-muted-foreground">Codes:</span> <span>{result.allocation.join(', ')}</span></div>
            )}
            {result.delivery_link && (
              <div className="pt-2">
                <p className="text-muted-foreground mb-1">Delivery Link:</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded-lg bg-background px-3 py-2 text-xs break-all font-mono">{result.delivery_link}</code>
                  <Button variant="outline" size="sm" onClick={handleCopy}>
                    {copied ? <><Check className="mr-1 h-3 w-3" /> Copied</> : <><Copy className="mr-1 h-3 w-3" /> Copy</>}
                  </Button>
                </div>
                <a href={result.delivery_link} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block">
                  <Button size="sm">
                    <Gift className="mr-1.5 h-3.5 w-3.5" /> Open Delivery Page
                  </Button>
                </a>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

export function CustomerOrdersPage() {
  const { data: orders, isLoading } = useQuery({ queryKey: ['customer-orders'], queryFn: api.customerOrders });

  if (isLoading) return <div className="text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">My Orders</h1>
        <p className="text-sm text-muted-foreground">View your order history and delivery links</p>
      </div>

      {orders && orders.length > 0 ? (
        <div className="space-y-3">
          {orders.map((order: any) => (
            <Card key={order.id}>
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="font-semibold">{order.product_name}</p>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground">
                    <span>${order.amount}</span>
                    <span>•</span>
                    <span>{new Date(order.createdAt).toLocaleString()}</span>
                    {order.reference_id && (
                      <>
                        <span>•</span>
                        <span className="font-mono text-xs">{order.reference_id}</span>
                      </>
                    )}
                  </div>
                  {order.failureReason && (
                    <p className="text-xs text-destructive">{order.failureReason}</p>
                  )}
                  {order.customer_address && (
                    <div className="mt-1">
                      <AddressWithMapsLink address={order.customer_address} label="Customer Address" />
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <Badge className={
                    order.status === 'ALLOCATED' ? 'bg-emerald-500/10 text-emerald-500' :
                    order.status === 'FAILED' ? 'bg-destructive/10 text-destructive' :
                    'bg-amber-500/10 text-amber-500'
                  }>
                    {order.status}
                  </Badge>
                  {order.delivery_link && (
                    <a href={order.delivery_link} target="_blank" rel="noopener noreferrer">
                      <Button variant="outline" size="sm">
                        <Gift className="mr-1.5 h-3.5 w-3.5" /> View Codes
                      </Button>
                    </a>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <p className="text-center text-muted-foreground py-8">No orders yet</p>
        </Card>
      )}
    </div>
  );
}

export function CustomerBecomeMerchantPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const mutation = useMutation({
    mutationFn: () => api.customerBecomeMerchant({ name, email, password }),
    onSuccess: () => {
      setSuccess(true);
      setError('');
      setTimeout(() => {
        window.location.href = '/';
      }, 2000);
    },
    onError: (err: any) => setError(err.message || 'Failed to upgrade account'),
  });

  if (success) {
    return (
      <div className="space-y-8">
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <div className="text-center py-8 space-y-3">
            <Store className="h-12 w-12 text-emerald-500 mx-auto" />
            <h2 className="text-xl font-bold text-emerald-400">Merchant Account Created!</h2>
            <p className="text-muted-foreground">Redirecting you to your merchant dashboard...</p>
            <Loader2 className="h-5 w-5 animate-spin mx-auto" />
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Become a Merchant</h1>
        <p className="text-sm text-muted-foreground">Upgrade your account to start selling digital codes</p>
      </div>

      <Card>
        <div className="space-y-4">
          <div className="rounded-lg bg-primary/5 border border-primary/20 px-4 py-3 text-sm">
            <p className="font-semibold text-primary mb-1">What you get as a merchant:</p>
            <ul className="space-y-1 text-muted-foreground">
              <li>• Wallet-based payment system</li>
              <li>• API keys for programmatic access</li>
              <li>• Webhook notifications for events</li>
              <li>• Order management dashboard</li>
              <li>• Access to all products and denominations</li>
            </ul>
          </div>

          <Input label="Store Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="My Digital Store" required />
          <Input label="Merchant Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="store@example.com" required />
          <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 8 characters" required />

          {error && <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}

          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !name || !email || !password || password.length < 8}>
            {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Store className="mr-2 h-4 w-4" />}
            {mutation.isPending ? 'Creating...' : 'Upgrade to Merchant'}
            {!mutation.isPending && <ArrowRight className="ml-2 h-4 w-4" />}
          </Button>
        </div>
      </Card>
    </div>
  );
}
