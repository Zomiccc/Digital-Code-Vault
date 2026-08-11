import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Wallet, FileText, Package, Key, Plus, Trash2, Loader2, ShoppingCart,
  Webhook, Copy, Check, Clock,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Card, Button, Badge, Table, Th, Td, Input, AddressWithMapsLink, Modal } from '@/components/ui';
import { formatCurrency, formatDate, statusColor } from '@/lib/utils';

export function MerchantDashboardPage() {
  const { data: wallet, isLoading } = useQuery({ queryKey: ['wallet'], queryFn: api.getWallet });
  const { data: orders } = useQuery({ queryKey: ['orders'], queryFn: () => api.listOrders(5, 0) });

  if (isLoading) return <div className="text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Wallet balance and recent activity</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Wallet Balance</p>
          <p className="mt-2 text-3xl font-semibold text-primary">{formatCurrency(wallet?.balance || 0)}</p>
          <p className="mt-1 text-xs text-muted-foreground">{wallet?.currency}</p>
          {wallet?.address && (
            <div className="mt-2">
              <AddressWithMapsLink address={wallet.address} label="Merchant Address" />
            </div>
          )}
        </Card>
        <Card>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total Orders</p>
          <p className="mt-2 text-3xl font-semibold">{orders?.total || 0}</p>
        </Card>
        <Card>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Recent Transactions</p>
          <div className="mt-2 space-y-1">
            {wallet?.recent_transactions?.slice(0, 3).map((t: any) => (
              <div key={t.id} className="flex justify-between text-xs">
                <span className="text-muted-foreground">{t.type}</span>
                <span className={t.type === 'CREDIT' ? 'text-emerald-400' : 'text-red-400'}>
                  {t.type === 'CREDIT' ? '+' : '-'}{formatCurrency(t.amount)}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <Card>
        <h2 className="text-lg font-semibold mb-4">Recent Orders</h2>
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

export function MerchantOrdersPage() {
  const { data, isLoading } = useQuery({ queryKey: ['orders-all'], queryFn: () => api.listOrders(100, 0) });
  if (isLoading) return <div className="text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Orders</h1>
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

export function MerchantProductsPage() {
  const { data: products, isLoading } = useQuery({ queryKey: ['merchant-products'], queryFn: api.listMerchantProducts });
  if (isLoading) return <div className="text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Available Products</h1>
        <p className="text-sm text-muted-foreground">Products and denominations available to you</p>
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

export function MerchantCreateOrderPage() {
  const queryClient = useQueryClient();
  const { data: products, isLoading: productsLoading } = useQuery({ queryKey: ['merchant-products'], queryFn: api.listMerchantProducts });
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
    onError: (err: any) => {
      const msg = err.message || 'Failed to create order';
      setError(msg.includes('{') ? JSON.parse(msg).message || msg : msg);
    },
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
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Create Order</h1>
        <p className="text-sm text-muted-foreground">Create a fulfillment request and get a delivery link</p>
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
                  ${d.face_value} ({d.available_stock} in stock)
                </button>
              ))}
            </div>
          )}

          <Input label="Amount (USD)" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="10.00" required />
          <Input label="Reference ID (optional)" value={referenceId} onChange={(e) => setReferenceId(e.target.value)} placeholder="order-12345" />

          {error && <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}

          <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !selectedProduct || !amount || parseFloat(amount) <= 0}>
            {createMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {createMutation.isPending ? 'Creating...' : 'Create Order'}
          </Button>
        </div>
      </Card>

      {result && (
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <h3 className="font-semibold text-emerald-400">Order Created Successfully</h3>
          <div className="mt-3 space-y-2 text-sm">
            <div><span className="text-muted-foreground">Fulfillment ID:</span> <span className="font-mono">{result.fulfillment_id}</span></div>
            <div><span className="text-muted-foreground">Status:</span> <span className="font-medium">{result.status}</span></div>
            <div><span className="text-muted-foreground">Wallet Balance After:</span> {formatCurrency(result.wallet_balance_after)}</div>
            {result.delivery_link && (
              <div className="pt-2">
                <div className="text-muted-foreground mb-1">Delivery Link:</div>
                <div className="flex items-center gap-2 rounded-lg bg-background p-3 font-mono text-sm break-all">
                  <span className="flex-1">{result.delivery_link}</span>
                  <button onClick={handleCopy} className="shrink-0 rounded p-1 hover:bg-secondary">
                    {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
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

export function MerchantApiKeysPage() {
  const queryClient = useQueryClient();
  const { data: apiKeysData, isLoading } = useQuery({ queryKey: ['api-keys'], queryFn: api.listApiKeys });
  const [newKey, setNewKey] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  const keys = apiKeysData?.keys || [];
  const rateLimit = apiKeysData?.rate_limit;

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

  const handleCopyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Calculate cooldown countdown
  const [timeRemaining, setTimeRemaining] = useState<string>('');
  const [canGenerate, setCanGenerate] = useState(true);

  useEffect(() => {
    if (!rateLimit) return;

    const checkCooldown = () => {
      if (rateLimit.next_available_key) {
        const now = new Date();
        const cooldownEnd = new Date(rateLimit.next_available_key);
        const remainingMs = cooldownEnd.getTime() - now.getTime();

        if (remainingMs > 0) {
          const hours = Math.floor(remainingMs / (1000 * 60 * 60));
          const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
          const seconds = Math.floor((remainingMs % (1000 * 60)) / 1000);
          setTimeRemaining(`${hours}h ${minutes}m ${seconds}s`);
          setCanGenerate(false);
        } else {
          setTimeRemaining('');
          setCanGenerate(true);
        }
      } else {
        setCanGenerate(rateLimit.remaining_keys > 0);
        setTimeRemaining('');
      }
    };

    checkCooldown();
    const interval = setInterval(checkCooldown, 1000);
    return () => clearInterval(interval);
  }, [rateLimit]);

  if (isLoading) return <div className="text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">API Keys</h1>
          <p className="text-sm text-muted-foreground">Manage API keys for programmatic access</p>
        </div>
        <Button 
          onClick={() => createMutation.mutate()} 
          disabled={createMutation.isPending || !canGenerate}
        >
          {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 
           !canGenerate ? <><Clock className="mr-2 h-4 w-4" /> {timeRemaining}</> :
           <><Plus className="mr-2 h-4 w-4" /> Generate Key</>}
        </Button>
      </div>

      {/* Rate Limit Dashboard */}
      {rateLimit && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="p-4">
            <div className="text-sm text-muted-foreground">Active Keys</div>
            <div className="text-2xl font-bold">{rateLimit.active_keys}</div>
          </Card>
          <Card className="p-4">
            <div className="text-sm text-muted-foreground">Total Generated</div>
            <div className="text-2xl font-bold">{rateLimit.total_keys_generated}</div>
          </Card>
          <Card className="p-4">
            <div className="text-sm text-muted-foreground">Remaining Keys</div>
            <div className="text-2xl font-bold">{rateLimit.remaining_keys}</div>
          </Card>
          <Card className="p-4">
            <div className="text-sm text-muted-foreground">Last Generated</div>
            <div className="text-sm font-semibold">{rateLimit.last_generated_at ? formatDate(rateLimit.last_generated_at) : 'Never'}</div>
          </Card>
        </div>
      )}

      {newKey && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <p className="font-semibold text-amber-400">Save your new API key — it won't be shown again!</p>
          <div className="mt-2 rounded-lg bg-background p-3 font-mono text-sm break-all flex items-center justify-between gap-2">
            <span>{newKey.key}</span>
            <Button variant="ghost" size="sm" onClick={() => handleCopyKey(newKey.key)}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <Button variant="secondary" className="mt-3" onClick={() => setNewKey(null)}>I've saved it</Button>
        </Card>
      )}

      <Card>
        <Table>
          <thead><tr><Th>Prefix</Th><Th>Scopes</Th><Th>Status</Th><Th>Last Used</Th><Th>Created</Th><Th>Actions</Th></tr></thead>
          <tbody>
            {Array.isArray(keys) && keys?.map((k: any) => (
              <tr key={k.id}>
                <Td className="font-mono">{k.keyPrefix}...</Td>
                <Td>{(() => { try { return JSON.parse(k.scopes).join(', '); } catch { return k.scopes; } })()}</Td>
                <Td><Badge className={statusColor(k.status)}>{k.status}</Badge></Td>
                <Td>{formatDate(k.lastUsedAt)}</Td>
                <Td>{formatDate(k.createdAt)}</Td>
                <Td>
                  {k.status === 'ACTIVE' && (
                    <Button variant="destructive" size="sm" onClick={() => revokeMutation.mutate(k.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </Td>
              </tr>
            ))}
            {!Array.isArray(keys) && (
              <tr><td colSpan={6} className="px-4 py-3 border-t border-border text-muted-foreground text-center">Unable to load API keys</td></tr>
            )}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}

export function MerchantWebhooksPage() {
  const queryClient = useQueryClient();
  const { data: webhooks, isLoading } = useQuery({ queryKey: ['webhooks'], queryFn: api.listWebhooks });
  const [url, setUrl] = useState('');
  const [skipVerification, setSkipVerification] = useState(false);
  const [error, setError] = useState('');
  const [newSecret, setNewSecret] = useState<any>(null);

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

  if (isLoading) return <div className="text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Webhooks</h1>
        <p className="text-sm text-muted-foreground">Receive real-time notifications for fulfillment events</p>
      </div>

      {newSecret && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <p className="font-semibold text-amber-400">Save your webhook secret — it won't be shown again!</p>
          <div className="mt-2 rounded-lg bg-background p-3 font-mono text-sm break-all">{newSecret.secret}</div>
          <Button variant="secondary" className="mt-3" onClick={() => setNewSecret(null)}>I've saved it</Button>
        </Card>
      )}

      <Card>
        <div className="space-y-4">
          <Input label="Webhook URL (HTTPS or http://localhost for testing)" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://localhost:9876 or https://your-site.com/webhooks" />
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="skipVerification"
              checked={skipVerification}
              onChange={(e) => setSkipVerification(e.target.checked)}
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
        <h2 className="text-lg font-semibold mb-4">Registered Endpoints</h2>
        <Table>
          <thead><tr><Th>URL</Th><Th>Status</Th><Th>Created</Th><Th>Actions</Th></tr></thead>
          <tbody>
            {webhooks?.length === 0 && (
              <tr><Td colSpan={4} className="text-center text-muted-foreground">No webhooks registered</Td></tr>
            )}
            {webhooks?.map((w: any) => (
              <tr key={w.id}>
                <Td className="font-mono text-xs">{w.url}</Td>
                <Td><Badge className={statusColor(w.status)}>{w.status}</Badge></Td>
                <Td>{formatDate(w.createdAt)}</Td>
                <Td>
                  <Button variant="destructive" size="sm" onClick={() => deleteMutation.mutate(w.id)}>
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

export function IncomingWebhooksPage() {
  const queryClient = useQueryClient();
  const { data: webhooks, isLoading } = useQuery({ queryKey: ['incoming-webhooks'], queryFn: api.listIncomingWebhooks });
  const { data: stats } = useQuery({ queryKey: ['webhook-statistics'], queryFn: api.getWebhookStatistics });
  const [selectedWebhook, setSelectedWebhook] = useState<any>(null);

  const retryMutation = useMutation({
    mutationFn: (id: string) => api.retryIncomingWebhook(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incoming-webhooks'] });
      queryClient.invalidateQueries({ queryKey: ['webhook-statistics'] });
    },
  });

  const webhookStatusColor = (status: string) => {
    switch (status) {
      case 'COMPLETED': return 'bg-green-500/10 text-green-500';
      case 'FAILED': return 'bg-red-500/10 text-red-500';
      case 'PENDING': return 'bg-yellow-500/10 text-yellow-500';
      case 'SKIPPED': return 'bg-gray-500/10 text-gray-500';
      default: return 'bg-gray-500/10 text-gray-500';
    }
  };

  if (isLoading) return <div className="text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Incoming Webhooks</h1>
        <p className="text-sm text-muted-foreground">View webhook events from external platforms</p>
      </div>

      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <Card className="p-6">
            <div className="text-sm text-muted-foreground">Total Webhooks</div>
            <div className="text-2xl font-bold">{stats.totalWebhooks}</div>
          </Card>
          <Card className="p-6">
            <div className="text-sm text-muted-foreground">Completed</div>
            <div className="text-2xl font-bold text-green-500">{stats.completedWebhooks}</div>
          </Card>
          <Card className="p-6">
            <div className="text-sm text-muted-foreground">Failed</div>
            <div className="text-2xl font-bold text-red-500">{stats.failedWebhooks}</div>
          </Card>
          <Card className="p-6">
            <div className="text-sm text-muted-foreground">Connected Products</div>
            <div className="text-2xl font-bold">{stats.connectedProducts}</div>
          </Card>
          <Card className="p-6">
            <div className="text-sm text-muted-foreground">Emails Sent / Failed</div>
            <div className="text-2xl font-bold">
              <span className="text-green-500">{stats.emailsSent || 0}</span>
              <span className="text-muted-foreground mx-1">/</span>
              <span className="text-red-500">{stats.emailsFailed || 0}</span>
            </div>
          </Card>
        </div>
      )}

      {stats && stats.platforms && stats.platforms.length > 0 && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Webhooks by Platform</h3>
          <div className="space-y-2">
            {stats.platforms.map((p: any) => (
              <div key={p.platform} className="flex justify-between items-center">
                <span className="text-sm">{p.platform}</span>
                <Badge className="bg-muted">{p.count}</Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Event ID</Th>
              <Th>Platform</Th>
              <Th>Provider</Th>
              <Th>Order ID</Th>
              <Th>Product</Th>
              <Th>Customer</Th>
              <Th>Amount</Th>
              <Th>Status</Th>
              <Th>Retries</Th>
              <Th>Received</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {Array.isArray(webhooks) && webhooks.map((w: any) => (
              <tr key={w.id}>
                <Td className="font-mono text-xs">{w.eventId ? `${w.eventId.slice(0, 12)}...` : '-'}</Td>
                <Td>{w.platform}</Td>
                <Td>{w.provider || '-'}</Td>
                <Td>{w.orderId || '-'}</Td>
                <Td>{w.productName || '-'}</Td>
                <Td>{w.customerEmail || '-'}</Td>
                <Td>{w.amount ? `${w.currency || ''} ${w.amount}` : '-'}</Td>
                <Td><Badge className={webhookStatusColor(w.processingStatus)}>{w.processingStatus}</Badge></Td>
                <Td>{w.retryCount || 0}</Td>
                <Td>{formatDate(w.createdAt)}</Td>
                <Td>
                  {(w.processingStatus === 'FAILED' || w.processingStatus === 'SKIPPED') && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => retryMutation.mutate(w.id)}
                      disabled={retryMutation.isPending}
                    >
                      {retryMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Retry'}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedWebhook(w)}
                  >
                    View
                  </Button>
                </Td>
              </tr>
            ))}
            {!Array.isArray(webhooks) && (
              <tr><td colSpan={11} className="px-4 py-3 border-t border-border text-muted-foreground text-center">Unable to load webhooks</td></tr>
            )}
          </tbody>
        </Table>
      </Card>

      <Modal
        open={!!selectedWebhook}
        onClose={() => setSelectedWebhook(null)}
        title="Webhook Details"
        size="lg"
      >
        {selectedWebhook && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-muted-foreground">Event ID</div>
                <div className="font-mono text-sm">{selectedWebhook.eventId}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Platform</div>
                <div>{selectedWebhook.platform}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Provider</div>
                <div>{selectedWebhook.provider || '-'}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Order ID</div>
                <div>{selectedWebhook.orderId || '-'}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Product</div>
                <div>{selectedWebhook.productName || '-'}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Customer Email</div>
                <div>{selectedWebhook.customerEmail || '-'}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Amount</div>
                <div>{selectedWebhook.amount ? `${selectedWebhook.currency} ${selectedWebhook.amount}` : '-'}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Payment Status</div>
                <div>{selectedWebhook.paymentStatus || '-'}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Processing Status</div>
                <Badge className={webhookStatusColor(selectedWebhook.processingStatus)}>{selectedWebhook.processingStatus}</Badge>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Retry Count</div>
                <div>{selectedWebhook.retryCount || 0}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Source IP</div>
                <div className="font-mono text-xs">{selectedWebhook.sourceIp || '-'}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Response Code</div>
                <div>{selectedWebhook.responseCode || '-'}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Received At</div>
                <div>{formatDate(selectedWebhook.createdAt)}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Processed At</div>
                <div>{selectedWebhook.processedAt ? formatDate(selectedWebhook.processedAt) : '-'}</div>
              </div>
            </div>
            {selectedWebhook.errorMessage && (
              <div>
                <div className="text-sm text-muted-foreground mb-1">Error Message</div>
                <div className="text-sm text-red-500">{selectedWebhook.errorMessage}</div>
              </div>
            )}
            {selectedWebhook.rawHeaders && (
              <div>
                <div className="text-sm text-muted-foreground mb-2">Headers</div>
                <pre className="bg-muted p-4 rounded-lg text-xs overflow-auto max-h-48">
                  {(() => {
                    try {
                      return JSON.stringify(JSON.parse(selectedWebhook.rawHeaders), null, 2);
                    } catch {
                      return selectedWebhook.rawHeaders;
                    }
                  })()}
                </pre>
              </div>
            )}
            {selectedWebhook.signature && (
              <div>
                <div className="text-sm text-muted-foreground mb-1">Signature</div>
                <div className="font-mono text-xs text-muted-foreground break-all">{selectedWebhook.signature}</div>
              </div>
            )}
            <div>
              <div className="text-sm text-muted-foreground mb-2">Raw Payload</div>
              <pre className="bg-muted p-4 rounded-lg text-xs overflow-auto max-h-96">
                {(() => {
                  if (!selectedWebhook.rawPayload) return '-';
                  try {
                    return JSON.stringify(JSON.parse(selectedWebhook.rawPayload), null, 2);
                  } catch {
                    return selectedWebhook.rawPayload;
                  }
                })()}
              </pre>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

export function ConnectedProductsPage() {
  const queryClient = useQueryClient();
  const { data: products, isLoading } = useQuery({ queryKey: ['connected-products'], queryFn: api.listConnectedProducts });
  const { data: dcvProducts } = useQuery({ queryKey: ['merchant-products'], queryFn: api.listMerchantProducts });
  const [mappingTarget, setMappingTarget] = useState<any>(null);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedDenominationId, setSelectedDenominationId] = useState('');
  const [mapError, setMapError] = useState('');

  const mapMutation = useMutation({
    mutationFn: (data: { id: string; dcv_product_id: string; dcv_denomination_id: string | null }) =>
      api.updateConnectedProduct(data.id, { dcv_product_id: data.dcv_product_id, dcv_denomination_id: data.dcv_denomination_id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connected-products'] });
      setMappingTarget(null);
      setSelectedProductId('');
      setSelectedDenominationId('');
      setMapError('');
    },
    onError: (err: any) => {
      setMapError(err.message || 'Failed to save mapping');
    },
  });

  const statusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'bg-green-500/10 text-green-500';
      case 'INACTIVE': return 'bg-red-500/10 text-red-500';
      default: return 'bg-gray-500/10 text-gray-500';
    }
  };

  const openMappingModal = (p: any) => {
    setMappingTarget(p);
    setSelectedProductId(p.dcvProductId || '');
    setSelectedDenominationId(p.dcvDenominationId || '');
    setMapError('');
  };

  const selectedDcvProduct = Array.isArray(dcvProducts)
    ? dcvProducts.find((dp: any) => dp.id === selectedProductId)
    : null;

  const handleSaveMapping = () => {
    if (!mappingTarget) return;
    if (!selectedProductId) {
      setMapError('Please select a DCV product to map to.');
      return;
    }
    mapMutation.mutate({
      id: mappingTarget.id,
      dcv_product_id: selectedProductId,
      dcv_denomination_id: selectedDenominationId || null,
    });
  };

  if (isLoading) return <div className="text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Connected Products</h1>
        <p className="text-sm text-muted-foreground">Products synced from external platforms via webhooks. Map each product to a DCV product/denomination so orders can be fulfilled.</p>
      </div>

      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Platform</Th>
              <Th>Provider</Th>
              <Th>Platform Product ID</Th>
              <Th>Product Name</Th>
              <Th>SKU</Th>
              <Th>Category</Th>
              <Th>Price</Th>
              <Th>Stock</Th>
              <Th>Status</Th>
              <Th>Mapping</Th>
              <Th>Last Synced</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {Array.isArray(products) && products.map((p: any) => (
              <tr key={p.id}>
                <Td>{p.platform}</Td>
                <Td>{p.provider || '-'}</Td>
                <Td className="font-mono text-xs">{p.platformProductId || '-'}</Td>
                <Td>{p.name}</Td>
                <Td>{p.sku || '-'}</Td>
                <Td>{p.category || '-'}</Td>
                <Td>{p.price ? `${p.currency || 'USD'} ${p.price}` : '-'}</Td>
                <Td>{p.stock ?? 0}</Td>
                <Td><Badge className={statusColor(p.status)}>{p.status}</Badge></Td>
                <Td>
                  {p.dcvProductId ? (
                    <Badge className="bg-emerald-500/10 text-emerald-500">Mapped: {p.dcvProduct?.name || p.dcvProductId}</Badge>
                  ) : (
                    <Badge className="bg-amber-500/10 text-amber-500">Unmapped</Badge>
                  )}
                </Td>
                <Td>{p.lastSyncedAt ? formatDate(p.lastSyncedAt) : '-'}</Td>
                <Td>
                  <Button variant={p.dcvProductId ? 'outline' : 'primary'} size="sm" onClick={() => openMappingModal(p)}>
                    {p.dcvProductId ? 'Edit Mapping' : 'Map Product'}
                  </Button>
                </Td>
              </tr>
            ))}
            {!Array.isArray(products) && (
              <tr><td colSpan={12} className="px-4 py-3 border-t border-border text-muted-foreground text-center">Unable to load products</td></tr>
            )}
            {Array.isArray(products) && products.length === 0 && (
              <tr><td colSpan={12} className="px-4 py-3 border-t border-border text-muted-foreground text-center">No connected products yet. Products will appear here when webhooks are received.</td></tr>
            )}
          </tbody>
        </Table>
      </Card>

      <Modal
        open={!!mappingTarget}
        onClose={() => { setMappingTarget(null); setMapError(''); }}
        title="Map Connected Product"
      >
        {mappingTarget && (
          <div className="space-y-4">
            <div className="rounded-lg bg-muted/50 p-3 text-sm">
              <div className="font-semibold">{mappingTarget.name}</div>
              <div className="text-xs text-muted-foreground mt-1">
                Platform: {mappingTarget.platform} &middot; SKU: {mappingTarget.sku || '-'} &middot; Platform ID: {mappingTarget.platformProductId || '-'}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">DCV Product</label>
              <select
                value={selectedProductId}
                onChange={(e) => { setSelectedProductId(e.target.value); setSelectedDenominationId(''); }}
                className="w-full appearance-none rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none transition-all duration-200 focus:border-primary focus:ring-1 focus:ring-primary/30"
              >
                <option value="">Select a product...</option>
                {Array.isArray(dcvProducts) && dcvProducts.map((dp: any) => (
                  <option key={dp.id} value={dp.id}>{dp.name} ({dp.region})</option>
                ))}
              </select>
            </div>

            {selectedDcvProduct && Array.isArray(selectedDcvProduct.denominations) && selectedDcvProduct.denominations.length > 0 && (
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Denomination (optional)</label>
                <select
                  value={selectedDenominationId}
                  onChange={(e) => setSelectedDenominationId(e.target.value)}
                  className="w-full appearance-none rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none transition-all duration-200 focus:border-primary focus:ring-1 focus:ring-primary/30"
                >
                  <option value="">Any denomination (match by amount)</option>
                  {selectedDcvProduct.denominations.map((d: any) => (
                    <option key={d.id} value={d.id}>{d.currency} {d.faceValue}</option>
                  ))}
                </select>
              </div>
            )}

            {mapError && <div className="text-sm text-red-500">{mapError}</div>}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => { setMappingTarget(null); setMapError(''); }}>Cancel</Button>
              <Button onClick={handleSaveMapping} disabled={mapMutation.isPending}>
                {mapMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save Mapping'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
