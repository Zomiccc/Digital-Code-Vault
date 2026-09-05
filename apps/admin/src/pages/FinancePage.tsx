import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Wallet, TrendingUp, TrendingDown, DollarSign, Check, X, AlertTriangle,
  Download, Zap, CreditCard, Database, ChevronRight,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Card, StatCard, Badge, Button, Table, Th, Td, Modal, Input } from '@/components/ui';
import { formatCurrency, formatDate, statusColor } from '@/lib/utils';

export function FinancePage() {
  const queryClient = useQueryClient();
  const [approveModal, setApproveModal] = useState<any>(null);
  const [rejectModal, setRejectModal] = useState<any>(null);
  const [adminNote, setAdminNote] = useState('');
  const [editedAmount, setEditedAmount] = useState('');
  const [tab, setTab] = useState<'overview' | 'costs' | 'funding' | 'reconciliation' | 'transactions'>('overview');
  const [displayCurrency, setDisplayCurrency] = useState<'USD' | 'PKR'>('USD');
  const [batchDetailCurrency, setBatchDetailCurrency] = useState<string | null>(null);

  const { data: wallet, isLoading } = useQuery({
    queryKey: ['admin-wallet'],
    queryFn: api.getAdminWallet,
  });

  const { data: financeOverview } = useQuery({
    queryKey: ['platform-finance-overview'],
    queryFn: api.getPlatformFinanceOverview,
  });

  const { data: costBasis } = useQuery({
    queryKey: ['cost-basis'],
    queryFn: api.getCostBasis,
    enabled: tab === 'costs' || tab === 'overview',
  });

  const { data: reconciliation } = useQuery({
    queryKey: ['reconciliation'],
    queryFn: () => api.getReconciliationReport(100, 0),
    enabled: tab === 'reconciliation',
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => api.approveFundingRequest(id, adminNote || undefined, editedAmount ? parseFloat(editedAmount) : undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-wallet'] });
      queryClient.invalidateQueries({ queryKey: ['reconciliation'] });
      queryClient.invalidateQueries({ queryKey: ['platform-finance-overview'] });
      queryClient.invalidateQueries({ queryKey: ['cost-basis'] });
      setApproveModal(null);
      setAdminNote('');
      setEditedAmount('');
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => api.rejectFundingRequest(id, adminNote || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-wallet'] });
      queryClient.invalidateQueries({ queryKey: ['reconciliation'] });
      queryClient.invalidateQueries({ queryKey: ['platform-finance-overview'] });
      setRejectModal(null);
      setAdminNote('');
    },
  });

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Zap className="h-5 w-5 animate-pulse" />
          Loading finance...
        </div>
      </div>
    );
  }

  const pendingRequests = wallet?.funding_requests?.filter((r: any) => r.status === 'PENDING') || [];

  return (
    <div className="space-y-8 animate-slide-up">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">Wallet & Finance</h1>
        <p className="text-sm text-muted-foreground">Platform wallet, merchant funding, and reconciliation</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg border border-border bg-card p-1 overflow-x-auto">
        {(['overview', 'costs', 'funding', 'reconciliation', 'transactions'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-md px-4 py-2 text-sm font-medium capitalize transition-all ${
              tab === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            {t === 'funding' ? `Funding Requests${pendingRequests.length > 0 ? ` (${pendingRequests.length})` : ''}` : t}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <>
          {/* Currency toggle + exchange rate */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Display currency:</span>
              <div className="flex gap-1 rounded-lg border border-border bg-card p-1">
                {(['USD', 'PKR'] as const).map((c) => (
                  <button
                    key={c}
                    onClick={() => setDisplayCurrency(c)}
                    className={`rounded-md px-3 py-1 text-sm font-medium transition-all ${
                      displayCurrency === c ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <ExchangeRatesCard />

          {/* Stats */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label={`Total Merchant Balances (${displayCurrency})`}
              value={formatCurrency(
                displayCurrency === 'USD'
                  ? (financeOverview?.total_usd_balance || 0) + (financeOverview?.total_eur_balance || 0)
                  : ((financeOverview?.total_usd_balance || 0) + (financeOverview?.total_eur_balance || 0)) * (financeOverview?.usd_to_pkr_rate || 280) + (financeOverview?.total_pkr_balance || 0)
              )}
              icon={DollarSign}
              color="text-blue-400"
            />
            <StatCard label="Cost Basis (USDT)" value={formatCurrency(financeOverview?.cost_basis_usdt || 0)} icon={TrendingDown} color="text-amber-400" />
            <StatCard label="Fulfillment Revenue" value={formatCurrency(financeOverview?.fulfillment_revenue || 0)} icon={TrendingUp} color="text-emerald-400" />
            <StatCard label="Funding Disbursed" value={formatCurrency(financeOverview?.funding_disbursed || 0)} icon={TrendingDown} color="text-amber-400" />
          </div>

          {/* Currency breakdown */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">USD Balances</div>
              <p className="mt-2 text-2xl font-semibold text-primary">{formatCurrency(financeOverview?.total_usd_balance || 0)}</p>
            </Card>
            <Card>
              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">PKR Balances</div>
              <p className="mt-2 text-2xl font-semibold text-primary">{formatCurrency(financeOverview?.total_pkr_balance || 0)}</p>
            </Card>
            <Card>
              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">EUR Balances</div>
              <p className="mt-2 text-2xl font-semibold text-primary">{formatCurrency(financeOverview?.total_eur_balance || 0)}</p>
            </Card>
          </div>

          {/* Recent transactions */}
          <Card>
            <h2 className="mb-4 text-lg font-semibold tracking-tight">Recent Transactions</h2>
            {wallet?.recent_transactions?.length > 0 ? (
              <Table>
                <thead>
                  <tr>
                    <Th>Type</Th>
                    <Th>Amount</Th>
                    <Th>Source</Th>
                    <Th>Balance After</Th>
                    <Th>Reference</Th>
                    <Th>Date</Th>
                  </tr>
                </thead>
                <tbody>
                  {wallet.recent_transactions.map((t: any) => (
                    <tr key={t.id}>
                      <Td>
                        <Badge className={t.type === 'CREDIT' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}>
                          {t.type}
                        </Badge>
                      </Td>
                      <Td className="font-semibold">{formatCurrency(t.amount)}</Td>
                      <Td><Badge className="bg-muted text-muted-foreground">{t.source}</Badge></Td>
                      <Td>{formatCurrency(t.balance_after)}</Td>
                      <Td className="font-mono text-xs text-muted-foreground">{t.reference_id?.substring(0, 8) || '—'}</Td>
                      <Td className="text-muted-foreground">{formatDate(t.created_at)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground">No transactions yet</p>
            )}
          </Card>
        </>
      )}

      {tab === 'costs' && (
        <>
          {/* Grand totals */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Total Cost (USD)"
              value={formatCurrency(costBasis?.total_usd || 0)}
              icon={DollarSign}
              color="text-blue-400"
            />
            <StatCard
              label="Total Cost (PKR)"
              value={formatCurrency(costBasis?.total_pkr || 0)}
              icon={DollarSign}
              color="text-emerald-400"
            />
            <StatCard
              label="Total Batches"
              value={costBasis?.total_batches || 0}
              icon={Database}
              color="text-amber-400"
            />
            <StatCard
              label="Total Codes"
              value={costBasis?.total_codes || 0}
              icon={Database}
              color="text-purple-400"
            />
          </div>

          {/* Cost by currency — clickable cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {costBasis?.by_currency && Object.entries(costBasis.by_currency).map(([cur, data]: [string, any]) => (
              <Card key={cur} hover className="cursor-pointer" >
                <div className="flex items-center justify-between" onClick={() => setBatchDetailCurrency(cur)}>
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge className={cur === 'USD' ? 'bg-blue-500/20 text-blue-400' : cur === 'PKR' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}>
                        {cur}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{data.batch_count} batches · {data.total_codes} codes</span>
                    </div>
                    <p className="mt-2 text-2xl font-semibold">{formatCurrency(data.total_cost)}</p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </div>
              </Card>
            ))}
            {(!costBasis?.by_currency || Object.keys(costBasis.by_currency).length === 0) && (
              <Card>
                <p className="text-sm text-muted-foreground">No cost data yet. Upload codes with cost info to see batch costs here.</p>
              </Card>
            )}
          </div>
        </>
      )}

      {tab === 'funding' && (
        <Card>
          <h2 className="mb-4 text-lg font-semibold tracking-tight">Merchant Funding Requests</h2>
          {wallet?.funding_requests?.length > 0 ? (
            <Table>
              <thead>
                <tr>
                  <Th>Merchant</Th>
                  <Th>Amount</Th>
                  <Th>Proof</Th>
                  <Th>Note</Th>
                  <Th>Status</Th>
                  <Th>Admin Note</Th>
                  <Th>Created</Th>
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {wallet.funding_requests.map((r: any) => (
                  <tr key={r.id}>
                    <Td>
                      <div className="font-medium">{r.merchant?.name}</div>
                      <div className="text-xs text-muted-foreground">{r.merchant?.email}</div>
                    </Td>
                    <Td className="font-semibold">
                      {formatCurrency(r.amount, r.currency)}
                      <div className="text-xs text-muted-foreground">{r.currency}</div>
                    </Td>
                    <Td>
                      {r.screenshot ? (
                        <a href={r.screenshot} target="_blank" rel="noreferrer" className="text-primary hover:underline text-sm">View proof</a>
                      ) : <span className="text-muted-foreground text-sm">—</span>}
                    </Td>
                    <Td className="text-sm text-muted-foreground">{r.note || '—'}</Td>
                    <Td><Badge className={statusColor(r.status)}>{r.status}</Badge></Td>
                    <Td className="text-sm text-muted-foreground">{r.admin_note || '—'}</Td>
                    <Td className="text-muted-foreground">{formatDate(r.created_at)}</Td>
                    <Td>
                      {r.status === 'PENDING' && (
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => { setApproveModal(r); setAdminNote(''); setEditedAmount(''); }}>
                            <Check className="h-3.5 w-3.5" /> Approve
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => { setRejectModal(r); setAdminNote(''); }}>
                            <X className="h-3.5 w-3.5" /> Reject
                          </Button>
                        </div>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">No funding requests</p>
          )}
        </Card>
      )}

      {tab === 'reconciliation' && (
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight">Reconciliation Report</h2>
            {reconciliation && (
              <Badge className={reconciliation.all_matched ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}>
                {reconciliation.all_matched ? 'All Matched' : `${reconciliation.mismatch_count} Mismatches`}
              </Badge>
            )}
          </div>
          {reconciliation?.items?.length > 0 ? (
            <Table>
              <thead>
                <tr>
                  <Th>Fulfillment</Th>
                  <Th>Merchant</Th>
                  <Th>Amount</Th>
                  <Th>Merchant Debit</Th>
                  <Th>Admin Credit</Th>
                  <Th>Matched</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {reconciliation.items.map((r: any) => (
                  <tr key={r.fulfillment_id}>
                    <Td className="font-mono text-xs">{r.fulfillment_id.substring(0, 8)}</Td>
                    <Td>{r.merchant?.name}</Td>
                    <Td className="font-semibold">{formatCurrency(r.amount)}</Td>
                    <Td>{r.merchant_debit !== null ? formatCurrency(r.merchant_debit) : '—'}</Td>
                    <Td>{r.admin_credit !== null ? formatCurrency(r.admin_credit) : '—'}</Td>
                    <Td>
                      {r.matched ? (
                        <Badge className="bg-emerald-500/20 text-emerald-400"><Check className="h-3 w-3" /></Badge>
                      ) : (
                        <Badge className="bg-red-500/20 text-red-400"><AlertTriangle className="h-3 w-3" /></Badge>
                      )}
                    </Td>
                    <Td><Badge className={statusColor(r.status)}>{r.status}</Badge></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">No fulfillment transactions to reconcile</p>
          )}
        </Card>
      )}

      {tab === 'transactions' && (
        <Card>
          <h2 className="mb-4 text-lg font-semibold tracking-tight">All Admin Wallet Transactions</h2>
          <AdminTransactions />
        </Card>
      )}

      {/* Approve Modal */}
      <Modal open={!!approveModal} onClose={() => setApproveModal(null)} title="Approve Funding Request">
        <div className="space-y-4">
          <div className="rounded-lg bg-muted/50 p-3">
            <p className="text-sm"><span className="text-muted-foreground">Merchant:</span> {approveModal?.merchant?.name}</p>
            <p className="text-sm"><span className="text-muted-foreground">Requested Amount:</span> <span className="font-semibold">{formatCurrency(approveModal?.amount)}</span></p>
            <p className="text-sm"><span className="text-muted-foreground">Note:</span> {approveModal?.note || '—'}</p>
            {approveModal?.screenshot && (
              <a href={approveModal.screenshot} target="_blank" rel="noreferrer">
                <img src={approveModal.screenshot} alt="payment proof" className="mt-2 max-h-56 rounded-lg border border-border object-contain" />
                <p className="mt-1 text-xs text-primary">Open full size ↗</p>
              </a>
            )}
          </div>
          <Input label="Edit Amount (optional — leave blank to approve as requested)" type="number" value={editedAmount} onChange={(e: any) => setEditedAmount(e.target.value)} placeholder={String(approveModal?.amount || '')} />
          <Input label="Admin Note (optional)" value={adminNote} onChange={(e: any) => setAdminNote(e.target.value)} placeholder="Approval note..." />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setApproveModal(null)}>Cancel</Button>
            <Button onClick={() => approveMutation.mutate(approveModal?.id)} disabled={approveMutation.isPending}>
              <Check className="h-4 w-4" /> Approve{editedAmount && parseFloat(editedAmount) !== approveModal?.amount ? ` (${formatCurrency(parseFloat(editedAmount))})` : ''}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Reject Modal */}
      <Modal open={!!rejectModal} onClose={() => setRejectModal(null)} title="Reject Funding Request">
        <div className="space-y-4">
          <div className="rounded-lg bg-muted/50 p-3">
            <p className="text-sm"><span className="text-muted-foreground">Merchant:</span> {rejectModal?.merchant?.name}</p>
            <p className="text-sm"><span className="text-muted-foreground">Amount:</span> <span className="font-semibold">{formatCurrency(rejectModal?.amount)}</span></p>
          </div>
          <Input label="Rejection Reason (optional)" value={adminNote} onChange={(e: any) => setAdminNote(e.target.value)} placeholder="Reason for rejection..." />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRejectModal(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => rejectMutation.mutate(rejectModal?.id)} disabled={rejectMutation.isPending}>
              <X className="h-4 w-4" /> Reject
            </Button>
          </div>
        </div>
      </Modal>

      {/* Batch Detail Modal */}
      <Modal
        open={!!batchDetailCurrency}
        onClose={() => setBatchDetailCurrency(null)}
        title={`Batch Details — ${batchDetailCurrency || ''}`}
        size="xl"
      >
        {batchDetailCurrency && costBasis?.by_currency?.[batchDetailCurrency] ? (
          <>
            <div className="mb-4 grid grid-cols-3 gap-4">
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">Total Cost</p>
                <p className="text-lg font-semibold">{formatCurrency(costBasis.by_currency[batchDetailCurrency].total_cost)}</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">Total Codes</p>
                <p className="text-lg font-semibold">{costBasis.by_currency[batchDetailCurrency].total_codes}</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">Batches</p>
                <p className="text-lg font-semibold">{costBasis.by_currency[batchDetailCurrency].batch_count}</p>
              </div>
            </div>
            <Table>
              <thead>
                <tr>
                  <Th>Product</Th>
                  <Th>Denom</Th>
                  <Th>Supplier</Th>
                  <Th>Qty</Th>
                  <Th>Cost/Code</Th>
                  <Th>Total</Th>
                  <Th>Date</Th>
                </tr>
              </thead>
              <tbody>
                {costBasis.by_currency[batchDetailCurrency].batches.map((b: any) => (
                  <tr key={b.id}>
                    <Td className="text-sm">
                      <div className="font-medium">{b.product_name}</div>
                      <div className="text-xs text-muted-foreground">{b.product_region}</div>
                    </Td>
                    <Td className="text-sm">${b.denomination_face_value}</Td>
                    <Td className="text-sm">{b.supplier_name}</Td>
                    <Td className="text-sm">{b.quantity}</Td>
                    <Td className="text-sm font-mono">{b.cost_per_code ? formatCurrency(b.cost_per_code) : '—'}</Td>
                    <Td className="text-sm font-semibold">{formatCurrency(b.total_cost)}</Td>
                    <Td className="text-xs text-muted-foreground">{formatDate(b.created_at)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No data</p>
        )}
      </Modal>
    </div>
  );
}

function AdminTransactions() {
  const { data } = useQuery({
    queryKey: ['admin-wallet-transactions'],
    queryFn: () => api.getAdminWalletTransactions(100, 0),
  });

  if (!data?.items?.length) {
    return <p className="text-sm text-muted-foreground">No transactions yet</p>;
  }

  return (
    <Table>
      <thead>
        <tr>
          <Th>Type</Th>
          <Th>Amount</Th>
          <Th>Source</Th>
          <Th>Balance After</Th>
          <Th>Description</Th>
          <Th>Reference</Th>
          <Th>Date</Th>
        </tr>
      </thead>
      <tbody>
        {data.items.map((t: any) => (
          <tr key={t.id}>
            <Td><Badge className={t.type === 'CREDIT' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}>{t.type}</Badge></Td>
            <Td className="font-semibold">{formatCurrency(t.amount)}</Td>
            <Td><Badge className="bg-muted text-muted-foreground">{t.source}</Badge></Td>
            <Td>{formatCurrency(t.balance_after)}</Td>
            <Td className="text-sm text-muted-foreground">{t.description || '—'}</Td>
            <Td className="font-mono text-xs text-muted-foreground">{t.reference_id?.substring(0, 8) || '—'}</Td>
            <Td className="text-muted-foreground">{formatDate(t.created_at)}</Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

/**
 * Every price in the platform is stored in USD. These rates are what the platform
 * converts with — both when charging a merchant wallet held in another currency
 * and when showing a regional price. A rate change applies to future orders only;
 * past orders keep the rate they were charged at.
 */
function ExchangeRatesCard() {
  const queryClient = useQueryClient();
  const { data: rates, isLoading } = useQuery({ queryKey: ['exchange-rates'], queryFn: api.listExchangeRates });
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [newCurrency, setNewCurrency] = useState('');
  const [newRate, setNewRate] = useState('');
  const [error, setError] = useState('');

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['exchange-rates'] });
    queryClient.invalidateQueries({ queryKey: ['platform-finance-overview'] });
  };
  const save = useMutation({
    mutationFn: ({ currency, rate }: { currency: string; rate: number }) => api.setExchangeRate(currency, rate),
    onSuccess: (_d, vars) => {
      setDrafts((current) => { const next = { ...current }; delete next[vars.currency]; return next; });
      setNewCurrency(''); setNewRate(''); setError('');
      invalidate();
    },
    onError: (err: any) => setError(err.message),
  });
  const remove = useMutation({
    mutationFn: (currency: string) => api.deleteExchangeRate(currency),
    onSuccess: () => { setError(''); invalidate(); },
    onError: (err: any) => setError(err.message),
  });

  const codeIsValid = /^[A-Za-z]{3}$/.test(newCurrency.trim());
  const newRateValue = Number(newRate);
  const newRateIsValid = Number.isFinite(newRateValue) && newRateValue > 0;

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="font-semibold">Exchange rates</h2>
        <p className="text-sm text-muted-foreground">
          How many units of each currency one US dollar buys. Set PKR to 300 and a $100 code
          costs a PKR wallet 30,000.
        </p>
      </div>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {isLoading && <p role="status" className="text-sm text-muted-foreground">Loading rates...</p>}

      <Table>
        <thead>
          <tr><Th>Currency</Th><Th>Units per $1</Th><Th>Last updated</Th><Th className="text-right">Actions</Th></tr>
        </thead>
        <tbody>
          {(rates || []).map((rate: any) => {
            const draft = drafts[rate.currency];
            const draftValue = Number(draft);
            const draftIsValid = draft !== undefined && Number.isFinite(draftValue) && draftValue > 0;
            return (
              <tr key={rate.currency}>
                <Td className="font-medium">
                  {rate.currency}
                  {rate.is_base && <span className="ml-2 text-xs text-muted-foreground">base currency</span>}
                </Td>
                <Td>
                  {rate.is_base ? (
                    <span className="text-muted-foreground">1.00</span>
                  ) : (
                    <input
                      type="number" min="0" step="0.0001"
                      aria-label={`Units of ${rate.currency} per US dollar`}
                      value={draft ?? String(rate.units_per_usd)}
                      onChange={(e) => setDrafts({ ...drafts, [rate.currency]: e.target.value })}
                      className="w-32 rounded border border-input bg-background px-2 py-1 text-sm"
                    />
                  )}
                </Td>
                <Td className="text-muted-foreground">{rate.updated_at ? formatDate(rate.updated_at) : '—'}</Td>
                <Td className="text-right">
                  {!rate.is_base && (
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm" variant="outline"
                        disabled={!draftIsValid || save.isPending}
                        onClick={() => save.mutate({ currency: rate.currency, rate: draftValue })}
                      >
                        Save
                      </Button>
                      <Button
                        size="sm" variant="ghost"
                        disabled={remove.isPending}
                        onClick={() => remove.mutate(rate.currency)}
                      >
                        Remove
                      </Button>
                    </div>
                  )}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>

      <div className="flex flex-wrap items-end gap-3 border-t border-border pt-4">
        <div className="w-32">
          <Input
            label="Add currency"
            value={newCurrency}
            onChange={(e: any) => setNewCurrency(e.target.value.toUpperCase().slice(0, 3))}
            placeholder="TRY"
          />
        </div>
        <div className="w-40">
          <Input
            label="Units per $1"
            type="number" min="0" step="0.0001"
            value={newRate}
            onChange={(e: any) => setNewRate(e.target.value)}
            placeholder="34.20"
          />
        </div>
        <Button
          disabled={!codeIsValid || !newRateIsValid || save.isPending}
          onClick={() => save.mutate({ currency: newCurrency.trim().toUpperCase(), rate: newRateValue })}
        >
          Add rate
        </Button>
      </div>
    </Card>
  );
}
