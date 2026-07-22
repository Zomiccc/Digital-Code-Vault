import { Routes, Route, Navigate, NavLink, useNavigate } from 'react-router-dom';
import { ReactNode, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Wallet, FileText, Package, Key, LogOut, Menu, X, Store, Plus, Trash2, Loader2, ShoppingCart, Webhook, Copy, Check,
} from 'lucide-react';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import { cn, formatCurrency, formatDate, statusColor } from '@/lib/utils';

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
  { to: '/webhooks', label: 'Webhooks', icon: Webhook },
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
          <thead><tr><Th>Product</Th><Th>Amount</Th><Th>Status</Th><Th>Reference</Th><Th>Revealed</Th><Th>Date</Th></tr></thead>
          <tbody>
            {data?.items?.map((o: any) => (
              <tr key={o.id}>
                <Td>{o.product}</Td>
                <Td>{formatCurrency(o.amount)}</Td>
                <Td><Badge className={statusColor(o.status)}>{o.status}</Badge></Td>
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
  const { data: keys, isLoading } = useQuery({ queryKey: ['api-keys'], queryFn: api.listApiKeys });
  const [newKey, setNewKey] = useState<any>(null);

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

  if (isLoading) return <div className="text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">API Keys</h1>
          <p className="text-sm text-muted-foreground">Manage API keys for programmatic access</p>
        </div>
        <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
          {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="mr-2 h-4 w-4" /> Generate Key</>}
        </Button>
      </div>

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

// ─── Webhooks Page ───
function WebhooksPage() {
  const queryClient = useQueryClient();
  const { data: webhooks, isLoading } = useQuery({ queryKey: ['webhooks'], queryFn: api.listWebhooks });
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [newSecret, setNewSecret] = useState<any>(null);

  const createMutation = useMutation({
    mutationFn: () => api.createWebhook(url),
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

  if (isLoading) return <div className="text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Webhooks</h1>
        <p className="text-sm text-muted-foreground">Receive real-time notifications for fulfillment events</p>
      </div>

      {newSecret && (
        <Card className="border-amber-300 bg-amber-50">
          <p className="font-bold text-amber-800">Save your webhook secret — it won't be shown again!</p>
          <div className="mt-2 rounded-lg bg-white p-3 font-mono text-sm break-all">{newSecret.secret}</div>
          <Button variant="secondary" className="mt-3" onClick={() => setNewSecret(null)}>I've saved it</Button>
        </Card>
      )}

      <Card>
        <div className="space-y-4">
          <Input label="Webhook URL (must be HTTPS)" value={url} onChange={(e: any) => setUrl(e.target.value)} placeholder="https://your-site.com/webhooks/digitalcode" />
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
        <Route path="/webhooks" element={<WebhooksPage />} />
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
