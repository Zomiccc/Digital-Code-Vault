import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, Button, Input, Badge, AddressWithMapsLink } from '@/components/ui';
import { Gift, ShoppingBag, Copy, Check, Store, ArrowRight, Package, Loader2, CreditCard, Mail, ShieldCheck } from 'lucide-react';

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
  const [selectedDenom, setSelectedDenom] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [error, setError] = useState('');
  const [redirecting, setRedirecting] = useState(false);

  const { data: profile } = useQuery({ queryKey: ['customer-profile'], queryFn: api.customerProfile });
  const { data: products, isLoading: productsLoading } = useQuery({ queryKey: ['customer-products'], queryFn: api.customerProducts });
  const { data: denominations } = useQuery({
    queryKey: ['customer-denoms', selectedProduct],
    queryFn: () => api.customerDenominations(selectedProduct),
    enabled: !!selectedProduct,
  });

  useEffect(() => {
    if (profile?.email) setCustomerEmail(profile.email);
    if (profile?.name) setCustomerName(profile.name);
  }, [profile]);

  const purchaseMutation = useMutation({
    mutationFn: () => {
      if (profile) {
        return api.createAuthenticatedPurchaseSession({
          product_id: selectedProduct,
          amount: parseFloat(amount),
          denomination_id: selectedDenom || undefined,
        });
      }
      return api.createCustomerPurchaseSession({
        product_id: selectedProduct,
        amount: parseFloat(amount),
        customer_email: customerEmail,
        customer_name: customerName || undefined,
        denomination_id: selectedDenom || undefined,
      });
    },
    onSuccess: (data) => {
      if (data.checkout_url) {
        setRedirecting(true);
        window.location.href = data.checkout_url;
      }
    },
    onError: (err: any) => {
      setError(err.message || 'Failed to create checkout session');
      setRedirecting(false);
    },
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Order Digital Codes</h1>
        <p className="text-sm text-muted-foreground">Select a product and amount — pay securely via Stripe</p>
      </div>

      <Card>
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Product</label>
            <select
              value={selectedProduct}
              onChange={(e) => { setSelectedProduct(e.target.value); setAmount(''); setSelectedDenom(''); }}
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
                  onClick={() => { setAmount(String(d.face_value)); setSelectedDenom(d.id); }}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    selectedDenom === d.id
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                  }`}
                >
                  {`$${d.face_value}`}
                </button>
              ))}
            </div>
          )}

          <Input label="Amount (USD)" type="number" value={amount} onChange={(e) => { setAmount(e.target.value); setSelectedDenom(''); }} placeholder="10.00" required />

          {!profile && (
            <>
              <Input label="Your Email" type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="you@example.com" required />
              <Input label="Your Name (optional)" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="John Doe" />
            </>
          )}

          {error && <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}

          <div className="rounded-lg bg-primary/5 border border-primary/20 px-4 py-3 text-sm">
            <div className="flex items-center gap-2 text-primary font-semibold mb-1">
              <ShieldCheck className="h-4 w-4" /> Secure Checkout
            </div>
            <p className="text-muted-foreground">
              You'll be redirected to Stripe to complete your payment. Your digital code will be delivered via email after payment is confirmed.
            </p>
          </div>

          <Button
            onClick={() => purchaseMutation.mutate()}
            disabled={purchaseMutation.isPending || redirecting || !selectedProduct || !amount || parseFloat(amount) <= 0 || (!profile && !customerEmail)}
          >
            {redirecting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Redirecting to Stripe...</> :
             purchaseMutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating...</> :
             <><CreditCard className="mr-2 h-4 w-4" /> Buy with Stripe</>}
          </Button>
        </div>
      </Card>
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
  const { data: profile } = useQuery({ queryKey: ['customer-profile'], queryFn: api.customerProfile });
  const [storeName, setStoreName] = useState('');
  const [storeEmail, setStoreEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const mutation = useMutation({
    mutationFn: () => api.customerBecomeMerchant({ storeName, storeEmail }),
    onSuccess: () => {
      setSuccess(true);
      setError('');
    },
    onError: (err: any) => setError(err.message || 'Failed to submit application'),
  });

  if (success || profile?.merchantAppStatus === 'PENDING') {
    return (
      <div className="space-y-8">
        <Card className="border-amber-500/30 bg-amber-500/5">
          <div className="text-center py-8 space-y-3">
            <Store className="h-12 w-12 text-amber-500 mx-auto" />
            <h2 className="text-xl font-bold text-amber-500">Application Submitted</h2>
            <p className="text-muted-foreground">Your merchant application is pending admin review. You'll be able to access the merchant dashboard once approved.</p>
          </div>
        </Card>
      </div>
    );
  }

  if (profile?.isMerchant) {
    return (
      <div className="space-y-8">
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <div className="text-center py-8 space-y-3">
            <Store className="h-12 w-12 text-emerald-500 mx-auto" />
            <h2 className="text-xl font-bold text-emerald-400">You are a Merchant!</h2>
            <p className="text-muted-foreground">Switch to merchant view from the sidebar to manage your store.</p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Become a Merchant</h1>
        <p className="text-sm text-muted-foreground">Submit an application to start selling digital codes</p>
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

          <Input label="Store Name" value={storeName} onChange={(e) => setStoreName(e.target.value)} placeholder="My Digital Store" required />
          <Input label="Store Email" type="email" value={storeEmail} onChange={(e) => setStoreEmail(e.target.value)} placeholder="store@example.com" required />

          {error && <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}

          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || !storeName || !storeEmail}>
            {mutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Store className="mr-2 h-4 w-4" />}
            {mutation.isPending ? 'Submitting...' : 'Submit Application'}
            {!mutation.isPending && <ArrowRight className="ml-2 h-4 w-4" />}
          </Button>
          <p className="text-xs text-muted-foreground">Your application will be reviewed by an admin. You'll use your existing login credentials once approved.</p>
        </div>
      </Card>
    </div>
  );
}

export function CustomerPurchaseSuccessPage() {
  const sessionId = new URLSearchParams(window.location.search).get('session_id');
  const [orderInfo, setOrderInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sessionId) {
      setLoading(false);
      return;
    }
    // Try to fetch the payment record — the session_id is the Stripe checkout session ID
    // We can use the Stripe payment lookup to get status
    api.getStripePayment(sessionId).then((data) => {
      setOrderInfo(data);
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });
  }, [sessionId]);

  return (
    <div className="space-y-8">
      <div className="text-center py-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/10 mb-4">
          <Check className="h-8 w-8 text-emerald-500" />
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">Payment Successful!</h1>
        <p className="text-sm text-muted-foreground mt-2">Your order is being processed</p>
      </div>

      <Card>
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-lg bg-primary/5 border border-primary/20 px-4 py-3">
            <Mail className="h-5 w-5 text-primary" />
            <div>
              <p className="font-semibold">Check Your Email</p>
              <p className="text-sm text-muted-foreground">
                Your digital code delivery link has been sent to your email address.
              </p>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : orderInfo ? (
            <div className="space-y-2 text-sm">
              <div><span className="text-muted-foreground">Payment Status:</span> <Badge className="bg-emerald-500/10 text-emerald-500">{orderInfo.status}</Badge></div>
              <div><span className="text-muted-foreground">Amount:</span> <span className="font-semibold">${orderInfo.amount}</span></div>
            </div>
          ) : null}

          <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 px-4 py-3 text-sm">
            <p className="text-amber-500 font-semibold mb-1">Important</p>
            <p className="text-muted-foreground">
              Your code is being allocated and will be delivered to your email shortly.
              Please check your inbox (and spam folder) for the delivery link.
            </p>
          </div>

          <div className="flex gap-2">
            <a href="/customer/my-orders">
              <Button variant="outline">View My Orders</Button>
            </a>
            <a href="/customer/browse">
              <Button>Browse More Products</Button>
            </a>
          </div>
        </div>
      </Card>
    </div>
  );
}
