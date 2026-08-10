import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Wallet, Plus, Zap, TrendingUp, TrendingDown, Clock, Check, X, CreditCard, Loader2,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Card, Badge, Button, Table, Th, Td, Modal, Input } from '@/components/ui';
import { formatCurrency, formatDate, statusColor } from '@/lib/utils';

export function MerchantWalletPage() {
  const queryClient = useQueryClient();
  const [showFundingModal, setShowFundingModal] = useState(false);
  const [showStripeModal, setShowStripeModal] = useState(false);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [stripeAmount, setStripeAmount] = useState('');
  const [stripeError, setStripeError] = useState('');

  // Check for Stripe redirect status
  const stripeStatus = new URLSearchParams(window.location.search).get('stripe_status');

  const stripeFundingMutation = useMutation({
    mutationFn: () => api.createMerchantFundingSession(parseFloat(stripeAmount)),
    onSuccess: (data) => {
      if (data.checkout_url) {
        window.location.href = data.checkout_url;
      }
    },
    onError: (err: any) => {
      setStripeError(err.message || 'Failed to create Stripe session');
    },
  });

  const { data: wallet, isLoading } = useQuery({ queryKey: ['wallet'], queryFn: api.getWallet });
  const { data: fundingRequests } = useQuery({ queryKey: ['my-funding-requests'], queryFn: api.listMyFundingRequests });

  const fundingMutation = useMutation({
    mutationFn: () => api.createFundingRequest(parseFloat(amount), note || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-funding-requests'] });
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      setShowFundingModal(false);
      setAmount('');
      setNote('');
    },
  });

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Zap className="h-5 w-5 animate-pulse" />
          Loading wallet...
        </div>
      </div>
    );
  }

  const credits = wallet?.recent_transactions?.filter((t: any) => t.type === 'CREDIT') || [];
  const debits = wallet?.recent_transactions?.filter((t: any) => t.type === 'DEBIT') || [];
  const totalDeposited = credits.reduce((sum: number, t: any) => sum + parseFloat(t.amount), 0);
  const totalSpent = debits.reduce((sum: number, t: any) => sum + parseFloat(t.amount), 0);

  return (
    <div className="space-y-8 animate-slide-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Wallet</h1>
          <p className="text-sm text-muted-foreground">Balance, transactions, and funding requests</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setShowStripeModal(true)}>
            <CreditCard className="h-4 w-4" /> Add Funds via Stripe
          </Button>
          <Button variant="outline" onClick={() => setShowFundingModal(true)}>
            <Plus className="h-4 w-4" /> Request Funds
          </Button>
        </div>
      </div>

      {/* Balance cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <Wallet className="h-3.5 w-3.5" /> Current Balance
          </div>
          <p className="mt-2 text-3xl font-semibold text-primary">{formatCurrency(wallet?.balance || 0)}</p>
          <p className="mt-1 text-xs text-muted-foreground">{wallet?.currency}</p>
        </Card>
        <Card>
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <TrendingUp className="h-3.5 w-3.5" /> Total Deposited
          </div>
          <p className="mt-2 text-3xl font-semibold text-emerald-400">{formatCurrency(totalDeposited)}</p>
        </Card>
        <Card>
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <TrendingDown className="h-3.5 w-3.5" /> Total Spent
          </div>
          <p className="mt-2 text-3xl font-semibold text-amber-400">{formatCurrency(totalSpent)}</p>
        </Card>
      </div>

      {/* Funding requests */}
      <Card>
        <h2 className="mb-4 text-lg font-semibold tracking-tight">Funding Requests</h2>
        {fundingRequests?.length > 0 ? (
          <Table>
            <thead>
              <tr>
                <Th>Amount</Th>
                <Th>Note</Th>
                <Th>Status</Th>
                <Th>Admin Note</Th>
                <Th>Created</Th>
                <Th>Reviewed</Th>
              </tr>
            </thead>
            <tbody>
              {fundingRequests.map((r: any) => (
                <tr key={r.id}>
                  <Td className="font-semibold">{formatCurrency(r.amount)}</Td>
                  <Td className="text-sm text-muted-foreground">{r.note || '—'}</Td>
                  <Td>
                    <Badge className={statusColor(r.status)}>
                      {r.status === 'PENDING' && <Clock className="mr-1 h-3 w-3" />}
                      {r.status === 'APPROVED' && <Check className="mr-1 h-3 w-3" />}
                      {r.status === 'REJECTED' && <X className="mr-1 h-3 w-3" />}
                      {r.status}
                    </Badge>
                  </Td>
                  <Td className="text-sm text-muted-foreground">{r.admin_note || '—'}</Td>
                  <Td className="text-muted-foreground">{formatDate(r.created_at)}</Td>
                  <Td className="text-muted-foreground">{formatDate(r.reviewed_at)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <p className="text-sm text-muted-foreground">No funding requests yet. Click "Request Funds" to add balance.</p>
        )}
      </Card>

      {/* Transaction history */}
      <Card>
        <h2 className="mb-4 text-lg font-semibold tracking-tight">Transaction History</h2>
        {wallet?.recent_transactions?.length > 0 ? (
          <Table>
            <thead>
              <tr>
                <Th>Type</Th>
                <Th>Amount</Th>
                <Th>Balance After</Th>
                <Th>Reference</Th>
                <Th>Date</Th>
              </tr>
            </thead>
            <tbody>
              {wallet.recent_transactions.map((t: any) => (
                <tr key={t.id}>
                  <Td>
                    <Badge className={t.type === 'CREDIT' ? 'bg-emerald-500/20 text-emerald-400' : t.type === 'REFUND' ? 'bg-blue-500/20 text-blue-400' : 'bg-red-500/20 text-red-400'}>
                      {t.type}
                    </Badge>
                  </Td>
                  <Td className="font-semibold">{formatCurrency(t.amount)}</Td>
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

      {/* Stripe Funding Success/Cancel Banner */}
      {stripeStatus === 'success' && (
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <div className="flex items-center gap-3">
            <Check className="h-5 w-5 text-emerald-500" />
            <div>
              <p className="font-semibold text-emerald-400">Payment Successful!</p>
              <p className="text-sm text-muted-foreground">Your wallet has been credited. It may take a moment to reflect.</p>
            </div>
          </div>
        </Card>
      )}
      {stripeStatus === 'canceled' && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <div className="flex items-center gap-3">
            <X className="h-5 w-5 text-amber-500" />
            <div>
              <p className="font-semibold text-amber-500">Payment Canceled</p>
              <p className="text-sm text-muted-foreground">Your Stripe payment was canceled. No charges were made.</p>
            </div>
          </div>
        </Card>
      )}

      {/* Stripe Funding Modal */}
      <Modal open={showStripeModal} onClose={() => setShowStripeModal(false)} title="Add Funds via Stripe">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Add funds to your wallet instantly via Stripe. Your wallet will be credited automatically after payment confirmation.
          </p>
          <Input
            label="Amount (USD)"
            type="number"
            value={stripeAmount}
            onChange={(e: any) => { setStripeAmount(e.target.value); setStripeError(''); }}
            placeholder="100.00"
            required
          />
          {stripeError && <p className="text-sm text-destructive">{stripeError}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowStripeModal(false)}>Cancel</Button>
            <Button
              onClick={() => stripeFundingMutation.mutate()}
              disabled={!stripeAmount || parseFloat(stripeAmount) <= 0 || stripeFundingMutation.isPending}
            >
              {stripeFundingMutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Redirecting...</> : <><CreditCard className="mr-2 h-4 w-4" /> Pay with Stripe</>}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Funding Request Modal */}
      <Modal open={showFundingModal} onClose={() => setShowFundingModal(false)} title="Request Funds">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Submit a funding request. An admin will review and approve it. Your wallet will be credited once approved.
          </p>
          <Input
            label="Amount (USD)"
            type="number"
            value={amount}
            onChange={(e: any) => setAmount(e.target.value)}
            placeholder="100.00"
            required
          />
          <Input
            label="Note (optional)"
            value={note}
            onChange={(e: any) => setNote(e.target.value)}
            placeholder="Reason for funding request..."
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowFundingModal(false)}>Cancel</Button>
            <Button
              onClick={() => fundingMutation.mutate()}
              disabled={!amount || parseFloat(amount) <= 0 || fundingMutation.isPending}
            >
              {fundingMutation.isPending ? 'Submitting...' : 'Submit Request'}
            </Button>
          </div>
          {fundingMutation.isError && (
            <p className="text-sm text-destructive">{(fundingMutation.error as Error).message}</p>
          )}
        </div>
      </Modal>
    </div>
  );
}
