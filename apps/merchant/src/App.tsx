import { Routes, Route, Navigate, NavLink, useNavigate } from 'react-router-dom';
import { ReactNode, useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Wallet, FileText, Package, Key, LogOut, Menu, X, Store, Plus, Trash2, Loader2, ShoppingCart, Webhook, Copy, Check, ExternalLink, Inbox, Send, Plug,
} from 'lucide-react';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import { cn, formatCurrency, formatDate, statusColor, getGoogleMapsUrl } from '@/lib/utils';

// ─── UI Components ───
function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('rounded-xl border border-border bg-card p-6 shadow-sm', className)}>{children}</div>;
}

function Button({ children, onClick, variant = 'primary', className, type = 'button', disabled }: any) {
  const variants: Record<string, string> = {
    primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
    secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
    destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
    ghost: 'hover:bg-secondary text-foreground',
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      className={cn('inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50', variants[variant], className)}>
      {children}
    </button>
  );
}

function Input({ label, type = 'text', value, onChange, placeholder, required }: any) {
  return (
    <div className="space-y-1.5">
      {label && <label className="text-sm font-medium text-muted-foreground">{label}</label>}
      <input type={type} value={value} onChange={onChange} placeholder={placeholder} required={required}
        className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
    </div>
  );
}

function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', className)}>{children}</span>;
}

function Table({ children }: { children: ReactNode }) {
  return <div className="overflow-x-auto"><table className="w-full text-sm">{children}</table></div>;
}
function Th({ children }: { children: ReactNode }) {
  return <th className="px-4 py-3 text-left font-medium text-muted-foreground">{children}</th>;
}
function Td({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={cn('px-4 py-3 border-t border-border', className)}>{children}</td>;
}

function AddressWithMapsLink({ address, label }: { address: string | null; label?: string }) {
  if (!address) return <span className="text-muted-foreground">—</span>;
  const mapsUrl = getGoogleMapsUrl(address);
  return (
    <div className="flex flex-col gap-1">
      {label && <span className="text-xs font-medium text-muted-foreground">{label}</span>}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground break-words">{address}</span>
        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80"
          title={`Open "${address}" in Google Maps`}
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Open in Maps
        </a>
      </div>
    </div>
  );
}

// ─── Login Page ───
function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try { await login(email, password); navigate('/'); }
    catch (err: any) { setError(err.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2">
          <Store className="h-12 w-12 text-primary" />
          <h1 className="text-2xl font-bold">Merchant Portal</h1>
          <p className="text-sm text-muted-foreground">Digital Code Vault</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm">
          {error && <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}
          <Input label="Email" type="email" value={email} onChange={(e: any) => setEmail(e.target.value)} placeholder="merchant@test.com" required />
          <Input label="Password" type="password" value={password} onChange={(e: any) => setPassword(e.target.value)} required />
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Sign In'}
          </Button>
        </form>
      </div>
    </div>
  );
}

// ─── Layout ───
const navItems = [
  { to: '/', label: 'Dashboard', icon: Wallet },
  { to: '/orders', label: 'Orders', icon: FileText },
  { to: '/products', label: 'Products', icon: Package },
  { to: '/create-order', label: 'Create Order', icon: ShoppingCart },
  { to: '/api-keys', label: 'API Keys', icon: Key },
  { to: '/connect-site', label: 'Connect Your Site', icon: Plug },
  { to: '/incoming-webhooks', label: 'Incoming Webhooks', icon: Inbox },
  { to: '/outgoing-webhooks', label: 'Outgoing Webhooks', icon: Send },
];

function Layout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className={cn('fixed inset-y-0 left-0 z-50 w-64 transform border-r border-border bg-card transition-transform lg:relative lg:translate-x-0',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full')}>
        <div className="flex h-16 items-center gap-2 border-b border-border px-6">
          <Store className="h-6 w-6 text-primary" />
          <span className="font-bold">Merchant</span>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) => cn('flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-secondary hover:text-foreground')}>
              <item.icon className="h-5 w-5" /> {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-border p-4">
          <div className="mb-2 text-xs text-muted-foreground">{user?.name}</div>
          <Button variant="ghost" onClick={() => { logout(); navigate('/login'); }} className="w-full justify-start">
            <LogOut className="mr-2 h-4 w-4" /> Logout
          </Button>
        </div>
      </aside>
      {sidebarOpen && <div className="fixed inset-0 z-40 bg-black/30 lg:hidden" onClick={() => setSidebarOpen(false)} />}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 items-center gap-4 border-b border-border bg-card px-4 lg:px-6">
          <button className="lg:hidden" onClick={() => setSidebarOpen(!sidebarOpen)}>
            {sidebarOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
          <div className="flex-1" />
          <span className="text-sm text-muted-foreground">Merchant Dashboard</span>
        </header>
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}

// ─── Dashboard Page ───
function DashboardPage() {
  const { data: wallet, isLoading } = useQuery({ queryKey: ['wallet'], queryFn: api.getWallet });
  const { data: orders } = useQuery({ queryKey: ['orders'], queryFn: () => api.listOrders(5, 0) });

  if (isLoading) return <div className="text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Wallet balance and recent activity</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-sm text-muted-foreground">Wallet Balance</p>
          <p className="text-3xl font-bold text-primary mt-1">{formatCurrency(wallet?.balance || 0)}</p>
          <p className="text-xs text-muted-foreground mt-1">{wallet?.currency}</p>
          {wallet?.address && (
            <div className="mt-2">
              <AddressWithMapsLink address={wallet.address} label="Merchant Address" />
            </div>
          )}
        </Card>
        <Card>
          <p className="text-sm text-muted-foreground">Total Orders</p>
          <p className="text-3xl font-bold mt-1">{orders?.total || 0}</p>
        </Card>
        <Card>
          <p className="text-sm text-muted-foreground">Recent Transactions</p>
          <div className="mt-2 space-y-1">
            {wallet?.recent_transactions?.slice(0, 3).map((t: any) => (
              <div key={t.id} className="flex justify-between text-xs">
                <span className="text-muted-foreground">{t.type}</span>
                <span className={t.type === 'CREDIT' ? 'text-emerald-600' : 'text-red-600'}>
                  {t.type === 'CREDIT' ? '+' : '-'}{formatCurrency(t.amount)}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <Card>
        <h2 className="text-lg font-bold mb-4">Recent Orders</h2>
        <Table>
          <thead><tr><Th>Product</Th><Th>Amount</Th><Th>Status</Th><Th>Date</Th></tr></thead>
          <tbody>
            {orders?.items?.map((o: any) => (
              <tr key={o.id}>
                <Td>{o.product}</Td>
                <Td>{formatCurrency(o.amount)}</Td>
                <Td><Badge className={statusColor(o.status)}>{o.status}</Badge></Td>
                <Td>{formatDate(o.created_at)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}

// ─── Orders Page ───
function OrdersPage() {
  const { data, isLoading } = useQuery({ queryKey: ['orders-all'], queryFn: () => api.listOrders(100, 0) });
  if (isLoading) return <div className="text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Orders</h1>
        <p className="text-sm text-muted-foreground">All fulfillment requests</p>
      </div>
      <Card>
        <Table>
          <thead><tr><Th>Product</Th><Th>Amount</Th><Th>Status</Th><Th>Customer Address</Th><Th>Reference</Th><Th>Revealed</Th><Th>Date</Th></tr></thead>
          <tbody>
            {data?.items?.map((o: any) => (
              <tr key={o.id}>
                <Td>{o.product}</Td>
                <Td>{formatCurrency(o.amount)}</Td>
                <Td><Badge className={statusColor(o.status)}>{o.status}</Badge></Td>
                <Td><AddressWithMapsLink address={o.customer_address} /></Td>
                <Td className="font-mono text-xs">{o.reference_id?.slice(0, 16) || '—'}</Td>
                <Td>{o.revealed ? '✅' : '—'}</Td>
                <Td>{formatDate(o.created_at)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}

// ─── Products Page ───
function ProductsPage() {
  const { data: products, isLoading } = useQuery({ queryKey: ['products'], queryFn: api.listProducts });
  if (isLoading) return <div className="text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Available Products</h1>
        <p className="text-sm text-muted-foreground">Products and denominations available to you</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {products?.map((p: any) => (
          <Card key={p.id}>
            <h3 className="font-bold">{p.name}</h3>
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

// ─── API Keys Page ───
function ApiKeysPage() {
  const queryClient = useQueryClient();
  const { data: keysData, isLoading } = useQuery({ queryKey: ['api-keys'], queryFn: api.listApiKeys });
  const [newKey, setNewKey] = useState<any>(null);
  const [countdown, setCountdown] = useState<string>('');

  const createMutation = useMutation({
    mutationFn: () => api.createApiKey(['fulfillment', 'read']),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      setNewKey(data);
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => api.revokeApiKey(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['api-keys'] }),
  });

  // Countdown timer effect
  useEffect(() => {
    if (!keysData?.rate_limit?.next_available_key) {
      setCountdown('');
      return;
    }

    const updateCountdown = () => {
      const now = new Date();
      const nextAvailable = new Date(keysData.rate_limit.next_available_key);
      const diff = nextAvailable.getTime() - now.getTime();

      if (diff <= 0) {
        setCountdown('');
        return;
      }

      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      setCountdown(`${hours}h ${minutes}m ${seconds}s`);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);

    return () => clearInterval(interval);
  }, [keysData]);

  const rateLimit = keysData?.rate_limit;
  const keys = keysData?.keys || [];
  const isRateLimited = rateLimit?.remaining_keys === 0 && countdown;

  if (isLoading) return <div className="text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">API Keys</h1>
          <p className="text-sm text-muted-foreground">Manage API keys for programmatic access</p>
        </div>
        <Button 
          onClick={() => createMutation.mutate()} 
          disabled={createMutation.isPending || isRateLimited}
        >
          {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="mr-2 h-4 w-4" /> Generate Key</>}
        </Button>
      </div>

      {/* Rate Limiting Info Card */}
      {rateLimit && (
        <Card className="bg-secondary/50">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-sm text-muted-foreground">Active Keys</p>
              <p className="text-2xl font-bold">{rateLimit.active_keys} / {rateLimit.max_active_keys}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Remaining Keys</p>
              <p className="text-2xl font-bold">{rateLimit.remaining_keys}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Next Key Available</p>
              <p className="text-2xl font-bold">{countdown || 'Now'}</p>
            </div>
          </div>
          {isRateLimited && (
            <div className="mt-4 rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
              You have reached today's API key limit. You can generate another API key after 24 hours.
            </div>
          )}
        </Card>
      )}

      {newKey && (
        <Card className="border-amber-300 bg-amber-50">
          <p className="font-bold text-amber-800">⚠️ Save your new API key — it won't be shown again!</p>
          <div className="mt-2 rounded-lg bg-white p-3 font-mono text-sm break-all">{newKey.key}</div>
          <p className="mt-2 text-xs text-amber-700">Key prefix: {newKey.keyPrefix}</p>
          <Button variant="secondary" className="mt-3" onClick={() => setNewKey(null)}>I've saved it</Button>
        </Card>
      )}

      <Card>
        <Table>
          <thead><tr><Th>Prefix</Th><Th>Scopes</Th><Th>Status</Th><Th>Last Used</Th><Th>Created</Th><Th>Actions</Th></tr></thead>
          <tbody>
            {keys?.map((k: any) => (
              <tr key={k.id}>
                <Td className="font-mono">{k.keyPrefix}...</Td>
                <Td>{(() => { try { return JSON.parse(k.scopes).join(', '); } catch { return k.scopes; } })()}</Td>
                <Td><Badge className={statusColor(k.status)}>{k.status}</Badge></Td>
                <Td>{formatDate(k.lastUsedAt)}</Td>
                <Td>{formatDate(k.createdAt)}</Td>
                <Td>
                  {k.status === 'ACTIVE' && (
                    <Button variant="destructive" onClick={() => revokeMutation.mutate(k.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}

// ─── Create Order Page ───
function CreateOrderPage() {
  const queryClient = useQueryClient();
  const { data: products, isLoading: productsLoading } = useQuery({ queryKey: ['products'], queryFn: api.listProducts });
  const [selectedProduct, setSelectedProduct] = useState('');
  const [amount, setAmount] = useState('');
  const [referenceId, setReferenceId] = useState('');
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const { data: denominations } = useQuery({
    queryKey: ['denominations', selectedProduct],
    queryFn: () => api.getDenominations(selectedProduct),
    enabled: !!selectedProduct,
  });

  const createMutation = useMutation({
    mutationFn: () => api.createDashboardFulfillment(selectedProduct, parseFloat(amount), referenceId || undefined),
    onSuccess: (data) => {
      setResult(data);
      setError('');
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
    },
    onError: (err: any) => setError(err.message),
  });

  const handleCopy = () => {
    if (result?.delivery_link) {
      navigator.clipboard.writeText(result.delivery_link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (productsLoading) return <div className="text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Create Order</h1>
        <p className="text-sm text-muted-foreground">Manually create a fulfillment request and get a delivery link</p>
      </div>

      <Card>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-muted-foreground">Product</label>
            <select
              value={selectedProduct}
              onChange={(e) => { setSelectedProduct(e.target.value); setAmount(''); }}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
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
                  className={cn(
                    'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                    amount === String(d.face_value)
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                  )}
                >
                  ${d.face_value} ({d.available_stock} in stock)
                </button>
              ))}
            </div>
          )}

          <Input label="Amount (USD)" type="number" value={amount} onChange={(e: any) => setAmount(e.target.value)} placeholder="10.00" required />
          <Input label="Reference ID (optional)" value={referenceId} onChange={(e: any) => setReferenceId(e.target.value)} placeholder="order-12345" />

          {error && <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}

          <Button
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending || !selectedProduct || !amount}
          >
            {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create Order'}
          </Button>
        </div>
      </Card>

      {result && (
        <Card className="border-emerald-300 bg-emerald-50">
          <h3 className="font-bold text-emerald-800">Order Created Successfully</h3>
          <div className="mt-3 space-y-2 text-sm">
            <div><span className="text-muted-foreground">Fulfillment ID:</span> <span className="font-mono">{result.fulfillment_id}</span></div>
            <div><span className="text-muted-foreground">Status:</span> <span className="font-medium">{result.status}</span></div>
            <div><span className="text-muted-foreground">Allocation:</span> {result.allocation?.join(', ')}</div>
            <div><span className="text-muted-foreground">Wallet Balance After:</span> {formatCurrency(result.wallet_balance_after)}</div>
            {result.delivery_link && (
              <div className="pt-2">
                <div className="text-muted-foreground mb-1">Delivery Link (send this to your customer):</div>
                <div className="flex items-center gap-2 rounded-lg bg-white p-3 font-mono text-sm break-all">
                  <span className="flex-1">{result.delivery_link}</span>
                  <button onClick={handleCopy} className="shrink-0 rounded p-1 hover:bg-secondary">
                    {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

// ─── Connect Site Page ───
function ConnectSitePage() {
  const { data: secretData } = useQuery({ queryKey: ['webhook-secret'], queryFn: api.getWebhookSecret });
  const [secretCopied, setSecretCopied] = useState(false);
  const [activeTab, setActiveTab] = useState('woocommerce');

  const handleCopySecret = () => {
    const secret = secretData?.webhook_secret;
    if (secret) {
      navigator.clipboard.writeText(secret);
      setSecretCopied(true);
      setTimeout(() => setSecretCopied(false), 2000);
    }
  };

  const webhookSecret = secretData?.webhook_secret || '';
  const incomingUrl = 'https://your-api.com/api/v1/webhooks/incoming';

  const platforms = [
    { id: 'woocommerce', label: 'WooCommerce / WordPress', desc: 'Install our WordPress plugin' },
    { id: 'shopify', label: 'Shopify', desc: 'Add a webhook in Shopify admin' },
    { id: 'stripe', label: 'Stripe', desc: 'Configure Stripe webhook endpoint' },
    { id: 'paypal', label: 'PayPal', desc: 'Set up PayPal webhook listener' },
    { id: 'elementor', label: 'Elementor Forms', desc: 'Use the WordPress plugin' },
    { id: 'custom', label: 'Custom / Hard-coded Site', desc: 'Send a POST request from your code' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Connect Your Site</h1>
        <p className="text-sm text-muted-foreground">Connect your e-commerce platform to automatically fulfill orders</p>
      </div>

      {/* Webhook Secret — needed for all platforms */}
      <Card className="border-blue-300 bg-blue-50">
        <div className="space-y-3">
          <div>
            <h3 className="font-bold text-blue-800">Your Webhook Secret</h3>
            <p className="text-sm text-blue-700 mt-1">
              This secret authenticates webhooks from your site. Include it in the
              <code className="bg-white px-1 rounded mx-1">X-Webhook-Secret</code> header of every webhook you send.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-white p-3 font-mono text-sm break-all">
            <span className="flex-1">{webhookSecret || 'Loading...'}</span>
            <button onClick={handleCopySecret} className="shrink-0 rounded p-1 hover:bg-secondary">
              {secretCopied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </Card>

      {/* Platform Tabs */}
      <Card>
        <div className="flex flex-wrap gap-2 mb-6 border-b border-border pb-4">
          {platforms.map((p) => (
            <button
              key={p.id}
              onClick={() => setActiveTab(p.id)}
              className={cn(
                'rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                activeTab === p.id
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* WooCommerce / WordPress */}
        {activeTab === 'woocommerce' && (
          <div className="space-y-4">
            <h3 className="text-lg font-bold">Connect WooCommerce / WordPress</h3>
            <ol className="list-decimal pl-5 space-y-3 text-sm">
              <li>
                <strong>Download the plugin:</strong>
                <div className="mt-2 flex items-center gap-3">
                  <a
                    href="https://github.com/Zomiccc/digitalvaul/tree/main/connectors/wp-dcv-webhook"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    <ExternalLink className="h-4 w-4" /> Download WordPress Plugin
                  </a>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Download the <code>wp-dcv-webhook</code> folder, zip it as <code>dcv-webhook.zip</code>
                </p>
              </li>
              <li>
                <strong>Install the plugin:</strong>
                <p className="mt-1 text-muted-foreground">
                  WordPress Admin → Plugins → Add New → Upload Plugin → choose <code>dcv-webhook.zip</code> → Activate
                </p>
              </li>
              <li>
                <strong>Configure the plugin:</strong>
                <p className="mt-1 text-muted-foreground">
                  Go to WooCommerce → DCV Webhook (or Settings → DCV Webhook) and enter:
                </p>
                <ul className="mt-2 list-disc pl-5 space-y-1 text-muted-foreground">
                  <li><strong>API Key:</strong> Your API key from the API Keys page (starts with <code>pk_</code>)</li>
                  <li><strong>API Base URL:</strong> <code>https://your-api.com/api/v1</code></li>
                  <li><strong>Webhook Secret:</strong> The secret shown above</li>
                </ul>
              </li>
              <li>
                <strong>Click "Register this site"</strong> — your WooCommerce store is now connected!
              </li>
              <li>
                <strong>Test it:</strong> Create a test order in WooCommerce with status "completed".
                Check the <NavLink to="/incoming-webhooks" className="text-primary underline">Incoming Webhooks</NavLink> page to see it arrive.
              </li>
            </ol>
          </div>
        )}

        {/* Shopify */}
        {activeTab === 'shopify' && (
          <div className="space-y-4">
            <h3 className="text-lg font-bold">Connect Shopify</h3>
            <ol className="list-decimal pl-5 space-y-3 text-sm">
              <li>
                <strong>Create a Shopify app or use a webhook automation:</strong>
                <p className="mt-1 text-muted-foreground">
                  Shopify Admin → Settings → Notifications → Webhooks → Create webhook
                </p>
              </li>
              <li>
                <strong>Set the webhook URL:</strong>
                <div className="mt-2 rounded-lg bg-secondary p-3 font-mono text-xs break-all">
                  {incomingUrl}
                </div>
              </li>
              <li>
                <strong>Select event:</strong> <code>Order payment</code> (triggers when payment is captured)
              </li>
              <li>
                <strong>Add the authentication header:</strong>
                <p className="mt-1 text-muted-foreground">
                  Shopify doesn't allow custom headers natively. Use a Shopify Flow app or a middleware
                  service (like Zapier/Make) to add the <code>X-Webhook-Secret</code> header:
                </p>
                <div className="mt-2 rounded-lg bg-secondary p-3 font-mono text-xs">
                  X-Webhook-Secret: {webhookSecret ? webhookSecret.substring(0, 16) + '...' : 'your-secret-here'}
                </div>
              </li>
              <li>
                <strong>Alternatively, use our webhook SDK:</strong>
                <p className="mt-1 text-muted-foreground">
                  Install <code>@digitalcodevault/webhook-sdk</code> in a small Node.js middleware that
                  receives Shopify webhooks and forwards them with the secret header.
                </p>
              </li>
              <li>
                <strong>Test it:</strong> Create a paid test order in Shopify.
                Check the <NavLink to="/incoming-webhooks" className="text-primary underline">Incoming Webhooks</NavLink> page.
              </li>
            </ol>
          </div>
        )}

        {/* Stripe */}
        {activeTab === 'stripe' && (
          <div className="space-y-4">
            <h3 className="text-lg font-bold">Connect Stripe</h3>
            <ol className="list-decimal pl-5 space-y-3 text-sm">
              <li>
                <strong>Stripe Dashboard → Developers → Webhooks → Add endpoint</strong>
              </li>
              <li>
                <strong>Set the endpoint URL:</strong>
                <div className="mt-2 rounded-lg bg-secondary p-3 font-mono text-xs break-all">
                  {incomingUrl}
                </div>
              </li>
              <li>
                <strong>Select events to listen for:</strong>
                <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                  <li><code>payment_intent.succeeded</code></li>
                </ul>
              </li>
              <li>
                <strong>Add authentication header:</strong>
                <p className="mt-1 text-muted-foreground">
                  Stripe doesn't support custom headers in the dashboard. Use a small middleware
                  (Node.js with our SDK, or Zapier/Make) to add the <code>X-Webhook-Secret</code> header.
                </p>
                <div className="mt-2 rounded-lg bg-secondary p-3 font-mono text-xs">
                  X-Webhook-Secret: {webhookSecret ? webhookSecret.substring(0, 16) + '...' : 'your-secret-here'}
                </div>
              </li>
              <li>
                <strong>Include product metadata:</strong>
                <p className="mt-1 text-muted-foreground">
                  When creating the Stripe PaymentIntent, add <code>metadata.product_sku</code> with your
                  product SKU (e.g., <code>PSN-USD-10</code>) so the platform can match it.
                </p>
              </li>
              <li>
                <strong>Test it:</strong> Use Stripe's "Send test webhook" button.
                Check the <NavLink to="/incoming-webhooks" className="text-primary underline">Incoming Webhooks</NavLink> page.
              </li>
            </ol>
          </div>
        )}

        {/* PayPal */}
        {activeTab === 'paypal' && (
          <div className="space-y-4">
            <h3 className="text-lg font-bold">Connect PayPal</h3>
            <ol className="list-decimal pl-5 space-y-3 text-sm">
              <li>
                <strong>PayPal Developer Dashboard → My Apps → your app → Webhooks</strong>
              </li>
              <li>
                <strong>Set the webhook URL:</strong>
                <div className="mt-2 rounded-lg bg-secondary p-3 font-mono text-xs break-all">
                  {incomingUrl}
                </div>
              </li>
              <li>
                <strong>Select event type:</strong> <code>PAYMENT.CAPTURE.COMPLETED</code>
              </li>
              <li>
                <strong>Add authentication header:</strong>
                <p className="mt-1 text-muted-foreground">
                  PayPal doesn't support custom headers. Use a middleware service or our webhook SDK
                  to add the <code>X-Webhook-Secret</code> header.
                </p>
                <div className="mt-2 rounded-lg bg-secondary p-3 font-mono text-xs">
                  X-Webhook-Secret: {webhookSecret ? webhookSecret.substring(0, 16) + '...' : 'your-secret-here'}
                </div>
              </li>
              <li>
                <strong>Include <code>custom_id</code> in the PayPal order</strong> with your product SKU
                (e.g., <code>PSN-USD-10</code>) so the platform can match it.
              </li>
              <li>
                <strong>Test it:</strong> Use PayPal's sandbox to simulate a payment.
                Check the <NavLink to="/incoming-webhooks" className="text-primary underline">Incoming Webhooks</NavLink> page.
              </li>
            </ol>
          </div>
        )}

        {/* Elementor */}
        {activeTab === 'elementor' && (
          <div className="space-y-4">
            <h3 className="text-lg font-bold">Connect Elementor Forms</h3>
            <ol className="list-decimal pl-5 space-y-3 text-sm">
              <li>
                <strong>Download and install the same WordPress plugin</strong> as WooCommerce:
                <div className="mt-2">
                  <a
                    href="https://github.com/Zomiccc/digitalvaul/tree/main/connectors/wp-dcv-webhook"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    <ExternalLink className="h-4 w-4" /> Download WordPress Plugin
                  </a>
                </div>
              </li>
              <li>
                The plugin automatically forwards <strong>Elementor Pro form submissions</strong> to the platform.
              </li>
              <li>
                <strong>Configure the plugin</strong> with your API Key, API Base URL, and Webhook Secret (same as WooCommerce setup).
              </li>
              <li>
                <strong>In your Elementor form:</strong> Add fields for <code>email</code>, <code>name</code>,
                <code>product</code> (product SKU), and <code>amount</code>.
              </li>
              <li>
                <strong>Test it:</strong> Submit the Elementor form on your site.
                Check the <NavLink to="/incoming-webhooks" className="text-primary underline">Incoming Webhooks</NavLink> page.
              </li>
            </ol>
          </div>
        )}

        {/* Custom */}
        {activeTab === 'custom' && (
          <div className="space-y-4">
            <h3 className="text-lg font-bold">Connect a Custom / Hard-coded Site</h3>
            <p className="text-sm text-muted-foreground">
              Any website that can send an HTTP POST can connect. Just send order data to our webhook endpoint.
            </p>
            <ol className="list-decimal pl-5 space-y-3 text-sm">
              <li>
                <strong>Send a POST request to:</strong>
                <div className="mt-2 rounded-lg bg-secondary p-3 font-mono text-xs break-all">
                  {incomingUrl}
                </div>
              </li>
              <li>
                <strong>Include these headers:</strong>
                <div className="mt-2 rounded-lg bg-secondary p-3 font-mono text-xs space-y-1">
                  <div>Content-Type: application/json</div>
                  <div>X-Webhook-Secret: {webhookSecret ? webhookSecret.substring(0, 16) + '...' : 'your-secret-here'}</div>
                  <div>X-Platform: custom_store</div>
                </div>
              </li>
              <li>
                <strong>Send order data as JSON body:</strong>
                <div className="mt-2 rounded-lg bg-secondary p-3 font-mono text-xs overflow-x-auto">
                  <pre>{`{
  "order_id": "ORDER-123",
  "status": "paid",
  "total": "10",
  "currency": "USD",
  "customer": {
    "email": "customer@example.com",
    "name": "John Doe"
  },
  "items": [
    {
      "sku": "PSN-USD-10",
      "quantity": 1,
      "price": "10"
    }
  ]
}`}</pre>
                </div>
              </li>
              <li>
                <strong>Or use our webhook SDK (Node.js):</strong>
                <div className="mt-2 rounded-lg bg-secondary p-3 font-mono text-xs overflow-x-auto">
                  <pre>{`import { sendIncomingWebhook } from '@digitalcodevault/webhook-sdk';

await sendIncomingWebhook({
  webhookSecret: '${webhookSecret ? webhookSecret.substring(0, 12) + '...' : 'YOUR_SECRET'}',
  payload: { order_id: 'ORDER-123', /* ... */ },
  extraHeaders: { 'X-Platform': 'custom_store' },
});`}</pre>
                </div>
              </li>
              <li>
                <strong>Test it:</strong> Send a test request and check the
                <NavLink to="/incoming-webhooks" className="text-primary underline mx-1">Incoming Webhooks</NavLink> page.
              </li>
            </ol>
          </div>
        )}
      </Card>

      {/* Quick Reference */}
      <Card className="bg-secondary/50">
        <h3 className="font-bold mb-3">Quick Reference</h3>
        <div className="grid gap-3 sm:grid-cols-2 text-sm">
          <div>
            <p className="text-muted-foreground">Webhook Endpoint:</p>
            <p className="font-mono text-xs break-all">{incomingUrl}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Required Header:</p>
            <p className="font-mono text-xs">X-Webhook-Secret: your-secret</p>
          </div>
          <div>
            <p className="text-muted-foreground">Platform Auto-Detection:</p>
            <p className="text-xs">WooCommerce, Shopify, Stripe, PayPal, Elementor, Custom</p>
          </div>
          <div>
            <p className="text-muted-foreground">Product Matching:</p>
            <p className="text-xs">By SKU (e.g., PSN-USD-10) or product name</p>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ─── Incoming Webhooks Page ───
function IncomingWebhooksPage() {
  const { data: incomingWebhooks, isLoading } = useQuery({ queryKey: ['incoming-webhooks'], queryFn: api.listIncomingWebhooks });
  const { data: secretData } = useQuery({ queryKey: ['webhook-secret'], queryFn: api.getWebhookSecret });
  const [secretCopied, setSecretCopied] = useState(false);

  const handleCopySecret = () => {
    const secret = secretData?.webhook_secret;
    if (secret) {
      navigator.clipboard.writeText(secret);
      setSecretCopied(true);
      setTimeout(() => setSecretCopied(false), 2000);
    }
  };

  if (isLoading) return <div className="text-muted-foreground">Loading...</div>;

  const webhooks = Array.isArray(incomingWebhooks) ? incomingWebhooks : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Incoming Webhooks</h1>
        <p className="text-sm text-muted-foreground">Webhooks received from your connected sites (WooCommerce, Shopify, Stripe, PayPal, etc.)</p>
      </div>

      {/* Webhook Secret Section */}
      <Card className="border-blue-300 bg-blue-50">
        <div className="space-y-3">
          <div>
            <h3 className="font-bold text-blue-800">Webhook Secret — Required for Incoming Webhooks</h3>
            <p className="text-sm text-blue-700 mt-1">
              Your site must send this secret in the <code className="bg-white px-1 rounded">X-Webhook-Secret</code> header
              when sending order webhooks. This proves the webhook came from your authorized site.
            </p>
          </div>
          {secretData?.webhook_secret && (
            <div className="flex items-center gap-2 rounded-lg bg-white p-3 font-mono text-sm break-all">
              <span className="flex-1">{secretData.webhook_secret}</span>
              <button onClick={handleCopySecret} className="shrink-0 rounded p-1 hover:bg-secondary">
                {secretCopied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          )}
          <div className="rounded-lg bg-white p-3 text-sm text-blue-700">
            <p className="font-medium">How to connect your site:</p>
            <ol className="mt-1 list-decimal pl-5 space-y-1">
              <li>Copy your webhook secret above</li>
              <li>Send a POST to <code className="bg-blue-50 px-1 rounded">https://your-api.com/api/v1/webhooks/incoming</code></li>
              <li>Include <code className="bg-blue-50 px-1 rounded">X-Webhook-Secret: &lt;your secret&gt;</code> header</li>
              <li>Include platform-specific headers (e.g. <code className="bg-blue-50 px-1 rounded">X-WC-Webhook-Source</code> for WooCommerce)</li>
              <li>Send order data as JSON body — platform is auto-detected</li>
            </ol>
          </div>
        </div>
      </Card>

      {/* Incoming Webhook Log */}
      <Card>
        <h3 className="font-bold mb-4">Received Webhooks ({webhooks.length})</h3>
        {webhooks.length === 0 ? (
          <p className="text-sm text-muted-foreground">No incoming webhooks yet. Connect your site to start receiving order events.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Platform</Th>
                <Th>Order ID</Th>
                <Th>Product</Th>
                <Th>Amount</Th>
                <Th>Customer</Th>
                <Th>Status</Th>
                <Th>Received</Th>
              </tr>
            </thead>
            <tbody>
              {webhooks.slice(0, 50).map((wh: any) => (
                <tr key={wh.id}>
                  <Td><Badge className="bg-secondary text-secondary-foreground">{wh.platform}</Badge></Td>
                  <Td className="font-mono text-xs">{wh.orderId || '—'}</Td>
                  <Td>{wh.productName || wh.productSku || '—'}</Td>
                  <Td>{wh.amount ? `$${wh.amount}` : '—'}</Td>
                  <Td className="text-xs">{wh.customerEmail || '—'}</Td>
                  <Td>
                    <Badge className={cn(
                      'text-xs',
                      wh.processingStatus === 'COMPLETED' && 'bg-emerald-100 text-emerald-700',
                      wh.processingStatus === 'PENDING' && 'bg-amber-100 text-amber-700',
                      wh.processingStatus === 'FAILED' && 'bg-red-100 text-red-700',
                      wh.processingStatus === 'SKIPPED' && 'bg-gray-100 text-gray-700',
                    )}>
                      {wh.processingStatus}
                    </Badge>
                  </Td>
                  <Td className="text-xs text-muted-foreground">{wh.createdAt ? formatDate(wh.createdAt) : '—'}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}

// ─── Outgoing Webhooks Page ───
function WebhooksPage() {
  const queryClient = useQueryClient();
  const { data: webhooks, isLoading } = useQuery({ queryKey: ['webhooks'], queryFn: api.listWebhooks });
  const { data: secretData } = useQuery({ queryKey: ['webhook-secret'], queryFn: api.getWebhookSecret });
  const [url, setUrl] = useState('');
  const [skipVerification, setSkipVerification] = useState(false);
  const [error, setError] = useState('');
  const [newSecret, setNewSecret] = useState<any>(null);
  const [secretCopied, setSecretCopied] = useState(false);

  const createMutation = useMutation({
    mutationFn: () => api.createWebhook(url, skipVerification),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['webhooks'] });
      setNewSecret(data);
      setUrl('');
      setError('');
    },
    onError: (err: any) => setError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteWebhook(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['webhooks'] }),
  });

  const regenerateSecretMutation = useMutation({
    mutationFn: () => api.regenerateWebhookSecret(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhook-secret'] });
    },
  });

  const handleCopySecret = () => {
    const secret = secretData?.webhook_secret;
    if (secret) {
      navigator.clipboard.writeText(secret);
      setSecretCopied(true);
      setTimeout(() => setSecretCopied(false), 2000);
    }
  };

  if (isLoading) return <div className="text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Outgoing Webhooks</h1>
        <p className="text-sm text-muted-foreground">Register URLs to receive fulfillment event notifications from the platform</p>
      </div>

      {/* Webhook Secret Section */}
      <Card className="border-blue-300 bg-blue-50">
        <div className="space-y-3">
          <div>
            <h3 className="font-bold text-blue-800">Webhook Secret — Required for Incoming Webhooks</h3>
            <p className="text-sm text-blue-700 mt-1">
              Your site must send this secret in the <code className="bg-white px-1 rounded">X-Webhook-Secret</code> header
              when sending order webhooks. This proves the webhook came from your authorized site.
            </p>
          </div>
          {secretData?.webhook_secret && (
            <div className="flex items-center gap-2 rounded-lg bg-white p-3 font-mono text-sm break-all">
              <span className="flex-1">{secretData.webhook_secret}</span>
              <button onClick={handleCopySecret} className="shrink-0 rounded p-1 hover:bg-secondary">
                {secretCopied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
          )}
          <div className="flex items-center gap-3">
            <Button
              variant="destructive"
              onClick={() => {
                if (confirm('Regenerating your webhook secret will invalidate the old one. Your site will need to be updated with the new secret. Continue?')) {
                  regenerateSecretMutation.mutate();
                }
              }}
              disabled={regenerateSecretMutation.isPending}
            >
              {regenerateSecretMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Regenerate Secret'}
            </Button>
            <span className="text-xs text-blue-600">Only regenerate if your secret has been compromised</span>
          </div>
        </div>
      </Card>

      {newSecret && (
        <Card className="border-amber-300 bg-amber-50">
          <p className="font-bold text-amber-800">Save your webhook secret — it won't be shown again!</p>
          <div className="mt-2 rounded-lg bg-white p-3 font-mono text-sm break-all">{newSecret.secret}</div>
          <Button variant="secondary" className="mt-3" onClick={() => setNewSecret(null)}>I've saved it</Button>
        </Card>
      )}

      <Card>
        <div className="space-y-4">
          <Input label="Webhook URL (HTTPS or http://localhost)" value={url} onChange={(e: any) => setUrl(e.target.value)} placeholder="https://your-site.com/webhooks/digitalcode" />
          <div className="flex items-center gap-2">
            <input 
              type="checkbox" 
              id="skipVerification" 
              checked={skipVerification} 
              onChange={(e: any) => setSkipVerification(e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            <label htmlFor="skipVerification" className="text-sm text-muted-foreground">
              Skip verification (for external endpoints that don't support challenge-response)
            </label>
          </div>
          {error && <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}
          <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !url}>
            {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="mr-2 h-4 w-4" /> Add Webhook</>}
          </Button>
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-bold mb-4">Registered Endpoints</h2>
        <Table>
          <thead><tr><Th>URL</Th><Th>Status</Th><Th>Created</Th><Th>Actions</Th></tr></thead>
          <tbody>
            {webhooks?.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-3 border-t border-border text-muted-foreground text-center">No webhooks registered</td></tr>
            )}
            {webhooks?.map((w: any) => (
              <tr key={w.id}>
                <Td className="font-mono text-xs">{w.url}</Td>
                <Td><Badge className={statusColor(w.status)}>{w.status}</Badge></Td>
                <Td>{formatDate(w.createdAt)}</Td>
                <Td>
                  <Button variant="destructive" onClick={() => deleteMutation.mutate(w.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}

// ─── App ───
function ProtectedRoutes() {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex h-screen items-center justify-center text-muted-foreground">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/orders" element={<OrdersPage />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/create-order" element={<CreateOrderPage />} />
        <Route path="/api-keys" element={<ApiKeysPage />} />
        <Route path="/connect-site" element={<ConnectSitePage />} />
        <Route path="/incoming-webhooks" element={<IncomingWebhooksPage />} />
        <Route path="/outgoing-webhooks" element={<WebhooksPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/*" element={<ProtectedRoutes />} />
      </Routes>
    </AuthProvider>
  );
}
