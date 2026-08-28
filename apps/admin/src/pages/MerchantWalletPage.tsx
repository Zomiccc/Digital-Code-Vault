import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Wallet, Plus, Zap, TrendingUp, TrendingDown, Clock, Check, X,
  Copy, Image as ImageIcon, Smartphone, Landmark, ArrowRight, ArrowLeft, Send, Loader2,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Card, Badge, Button, Table, Th, Td, Modal, Input } from '@/components/ui';
import { formatCurrency, formatDate, statusColor } from '@/lib/utils';

export function MerchantWalletPage() {
  const queryClient = useQueryClient();
  const [showAddFunds, setShowAddFunds] = useState(false);
  const [showCurrencyPrompt, setShowCurrencyPrompt] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [screenshotName, setScreenshotName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: wallet, isLoading } = useQuery({ queryKey: ['wallet'], queryFn: api.getWallet });
  const { data: fundingRequests } = useQuery({ queryKey: ['my-funding-requests'], queryFn: api.listMyFundingRequests });
  const { data: paymentDetails } = useQuery({
    queryKey: ['payment-details'],
    queryFn: api.getPaymentDetails,
    enabled: showAddFunds && step >= 2,
  });

  const merchantCurrency = wallet?.currency || 'USD';
  const curSymbol = merchantCurrency === 'PKR' ? '\u20A8' : '$';

  const currencyMutation = useMutation({
    mutationFn: (currency: string) => api.updateMyCurrency(currency),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      setShowCurrencyPrompt(false);
    },
  });

  const resetWizard = () => {
    setShowAddFunds(false);
    setStep(1);
    setAmount('');
    setNote('');
    setScreenshot(null);
    setScreenshotName('');
  };

  const fundingMutation = useMutation({
    mutationFn: () =>
      api.createFundingRequest({
        amount: parseFloat(amount),
        note: note || undefined,
        screenshot: screenshot!,
        currency: merchantCurrency,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-funding-requests'] });
      queryClient.invalidateQueries({ queryKey: ['support-thread'] });
      setStep(3);
    },
  });

  const pickFile = (file: File | undefined) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert('Image too large - please upload a screenshot under 2 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setScreenshot(reader.result as string);
      setScreenshotName(file.name);
    };
    reader.readAsDataURL(file);
  };

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
  };

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

  const fmt = (val: any) => formatCurrency(val, merchantCurrency);

  return (
    <div className="space-y-8 animate-slide-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Wallet</h1>
          <p className="text-sm text-muted-foreground">Balance, transactions, and funding requests</p>
        </div>
        <Button onClick={() => setShowAddFunds(true)}>
          <Plus className="h-4 w-4" /> Add Funds
        </Button>
      </div>

      {/* Balance cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <Wallet className="h-3.5 w-3.5" /> Current Balance
          </div>
          <p className="mt-2 text-3xl font-semibold text-primary">{fmt(wallet?.balance || 0)}</p>
          <div className="mt-2 flex items-center gap-2">
            <Badge className="bg-primary/10 text-primary">{merchantCurrency}</Badge>
            <button
              onClick={() => setShowCurrencyPrompt(true)}
              className="text-xs text-muted-foreground hover:text-foreground underline"
            >
              Change currency
            </button>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <TrendingUp className="h-3.5 w-3.5" /> Total Deposited
          </div>
          <p className="mt-2 text-3xl font-semibold text-emerald-400">{fmt(totalDeposited)}</p>
        </Card>
        <Card>
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <TrendingDown className="h-3.5 w-3.5" /> Total Spent
          </div>
          <p className="mt-2 text-3xl font-semibold text-amber-400">{fmt(totalSpent)}</p>
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
                <Th>Proof</Th>
                <Th>Note</Th>
                <Th>Status</Th>
                <Th>Admin Note</Th>
                <Th>Created</Th>
              </tr>
            </thead>
            <tbody>
              {fundingRequests.map((r: any) => (
                <tr key={r.id}>
                  <Td className="font-semibold">{formatCurrency(r.amount, r.currency || merchantCurrency)}</Td>
                  <Td>
                    {r.screenshot ? (
                      <a href={r.screenshot} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-primary hover:underline">
                        <ImageIcon className="h-4 w-4" /> View
                      </a>
                    ) : '\u2014'}
                  </Td>
                  <Td className="text-sm text-muted-foreground">{r.note || '\u2014'}</Td>
                  <Td>
                    <Badge className={statusColor(r.status)}>
                      {r.status === 'PENDING' && <Clock className="mr-1 h-3 w-3" />}
                      {r.status === 'APPROVED' && <Check className="mr-1 h-3 w-3" />}
                      {r.status === 'REJECTED' && <X className="mr-1 h-3 w-3" />}
                      {r.status}
                    </Badge>
                  </Td>
                  <Td className="text-sm text-muted-foreground">{r.admin_note || '\u2014'}</Td>
                  <Td className="text-muted-foreground">{formatDate(r.created_at)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <p className="text-sm text-muted-foreground">No funding requests yet. Click "Add Funds" to top up your wallet.</p>
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
                  <Td className="font-semibold">{fmt(t.amount)}</Td>
                  <Td>{fmt(t.balance_after)}</Td>
                  <Td className="font-mono text-xs text-muted-foreground">{t.reference_id?.substring(0, 8) || '\u2014'}</Td>
                  <Td className="text-muted-foreground">{formatDate(t.created_at)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <p className="text-sm text-muted-foreground">No transactions yet</p>
        )}
      </Card>

      {/* Currency Selection Modal */}
      <Modal open={showCurrencyPrompt} onClose={() => setShowCurrencyPrompt(false)} title="Choose Your Account Currency" size="sm">
        <div className="space-y-4">
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 text-sm text-amber-600">
            <strong>Important:</strong> Your currency determines how all balances, funding requests, and transactions are displayed.
            Please choose carefully - you can change it later, but all existing records remain in their original currency.
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              onClick={() => currencyMutation.mutate('USD')}
              disabled={currencyMutation.isPending}
              className={`rounded-lg border p-4 text-left transition-all ${
                merchantCurrency === 'USD' ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold">$</span>
                <div>
                  <p className="font-semibold">USD</p>
                  <p className="text-xs text-muted-foreground">US Dollar</p>
                </div>
              </div>
            </button>
            <button
              onClick={() => currencyMutation.mutate('PKR')}
              disabled={currencyMutation.isPending}
              className={`rounded-lg border p-4 text-left transition-all ${
                merchantCurrency === 'PKR' ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold">PKR</span>
                <div>
                  <p className="font-semibold">PKR</p>
                  <p className="text-xs text-muted-foreground">Pakistani Rupee</p>
                </div>
              </div>
            </button>
          </div>
          {currencyMutation.isPending && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Updating...
            </div>
          )}
          {currencyMutation.isError && (
            <p className="text-sm text-destructive">{(currencyMutation.error as Error).message}</p>
          )}
        </div>
      </Modal>

      {/* Add Funds wizard */}
      <Modal open={showAddFunds} onClose={resetWizard} title="Add Funds to Wallet">
        {/* Step indicator */}
        <div className="mb-5 flex items-center gap-2 text-xs">
          {[['1', 'Amount'], ['2', 'Send & Upload Proof'], ['3', 'Done']].map(([n, label], i) => (
            <div key={n} className="flex items-center gap-2">
              {i > 0 && <ArrowRight className="h-3 w-3 text-muted-foreground/50" />}
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full font-semibold ${
                  step >= Number(n) ? 'bg-primary text-white' : 'bg-secondary text-muted-foreground'
                }`}
              >
                {step > Number(n) ? <Check className="h-3.5 w-3.5" /> : n}
              </span>
              <span className={step >= Number(n) ? 'font-medium' : 'text-muted-foreground'}>{label}</span>
            </div>
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-4">
            <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 text-sm">
              Your account currency is <strong className="text-primary">{merchantCurrency}</strong>.
              All funding requests and balances are in {merchantCurrency}.
            </div>
            <p className="text-sm text-muted-foreground">How much do you want to add to your wallet?</p>
            <Input
              label={`Amount (${merchantCurrency})`}
              type="number"
              value={amount}
              onChange={(e: any) => setAmount(e.target.value)}
              placeholder="100"
              required
            />
            <div className="flex flex-wrap gap-2">
              {(merchantCurrency === 'PKR' ? [5000, 10000, 50000, 100000] : [50, 100, 250, 500]).map((v) => (
                <button
                  key={v}
                  onClick={() => setAmount(String(v))}
                  className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                    amount === String(v) ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary/50'
                  }`}
                >
                  {curSymbol}{v.toLocaleString()}
                </button>
              ))}
            </div>
            <Button className="w-full" disabled={!amount || parseFloat(amount) <= 0} onClick={() => setStep(2)}>
              Continue <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 text-sm">
              Send exactly <strong className="text-primary">{curSymbol}{parseFloat(amount || '0').toLocaleString()} {merchantCurrency}</strong> to any account below.
            </div>

            {(paymentDetails?.accounts || []).map((acc: any) => (
              <Card key={acc.kind} className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-semibold">
                    {acc.kind === 'NayaPay' ? <Smartphone className="h-4 w-4 text-emerald-400" /> : <Landmark className="h-4 w-4 text-sky-400" />}
                    {acc.kind}
                  </div>
                  {acc.accountNumber && (
                    <Button variant="outline" size="sm" onClick={() => copyText(acc.accountNumber)}>
                      <Copy className="mr-1 h-3 w-3" /> Copy
                    </Button>
                  )}
                </div>
                <div className="mt-2 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
                  {acc.accountTitle && <p><span className="text-muted-foreground">A/C Title:</span> {acc.accountTitle}</p>}
                  {acc.merchantTitle && <p><span className="text-muted-foreground">Merchant:</span> <strong>{acc.merchantTitle}</strong></p>}
                  {acc.accountNumber && <p className="font-mono"><span className="text-muted-foreground">A/C #:</span> {acc.accountNumber}</p>}
                  {acc.iban && <p className="font-mono sm:col-span-2 break-all"><span className="text-muted-foreground">IBAN:</span> {acc.iban}</p>}
                  {acc.note && <p className="sm:col-span-2 text-xs text-muted-foreground">{acc.note}</p>}
                </div>
              </Card>
            ))}

            {paymentDetails?.instructions && (
              <p className="text-xs text-muted-foreground">{paymentDetails.instructions}</p>
            )}

            {/* Screenshot upload */}
            <div>
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Payment Screenshot *
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => pickFile(e.target.files?.[0])}
              />
              {screenshot ? (
                <div className="flex items-center gap-3 rounded-lg border border-border p-3">
                  <img src={screenshot} alt="proof" className="h-14 w-14 rounded object-cover" />
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="truncate font-medium">{screenshotName}</p>
                    <button className="text-xs text-red-500 hover:underline" onClick={() => { setScreenshot(null); setScreenshotName(''); }}>
                      Remove
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex w-full flex-col items-center gap-2 rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                >
                  <ImageIcon className="h-6 w-6" />
                  Click to upload payment screenshot (required)
                </button>
              )}
            </div>

            <Input
              label="Message to admin (optional)"
              value={note}
              onChange={(e: any) => setNote(e.target.value)}
              placeholder="e.g. Sent from my EasyPaisa - please approve"
            />

            {fundingMutation.isError && (
              <p className="text-sm text-destructive">{(fundingMutation.error as Error).message}</p>
            )}

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(1)}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
              </Button>
              <Button
                className="flex-1"
                disabled={!screenshot || fundingMutation.isPending}
                onClick={() => fundingMutation.mutate()}
              >
                {fundingMutation.isPending ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Submitting...</>
                ) : (
                  <><Send className="mr-2 h-4 w-4" /> Submit for Approval</>
                )}
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4 py-2 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15">
              <Check className="h-7 w-7 text-emerald-500" />
            </div>
            <div>
              <p className="text-lg font-semibold">Request submitted!</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Admin has been notified with your proof of {curSymbol}{parseFloat(amount).toLocaleString()} {merchantCurrency}.
                Your wallet will be credited once approved - track it under Funding Requests below or in the Help chat.
              </p>
            </div>
            <Button className="w-full" onClick={resetWizard}>Done</Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
