import { useState, useEffect } from 'react';
import {
  Gift, Lock, Eye, Copy, Check, AlertCircle, Loader2, Shield, Clock,
} from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: any[]) {
  return twMerge(clsx(inputs));
}

function formatCurrency(value: number | string): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);
}

function formatDate(date: string | null): string {
  if (!date) return '—';
  return new Date(date).toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// ─── API ───
const API_BASE = import.meta.env.DEV ? 'http://localhost:3000/api/v1' : '/api/v1';

async function fetchDeliveryInfo(token: string) {
  const res = await fetch(`${API_BASE}/d/${token}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Invalid or expired delivery link' }));
    throw new Error(err.message || 'Invalid or expired delivery link');
  }
  return res.json();
}

async function revealCodes(token: string) {
  const res = await fetch(`${API_BASE}/d/${token}/reveal`, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Failed to reveal codes' }));
    throw new Error(err.message || 'Failed to reveal codes');
  }
  return res.json();
}

// ─── App ───
export default function App() {
  const path = window.location.pathname;
  const token = path.startsWith('/d/') ? path.slice(3) : '';

  if (!token) {
    return <InvalidLink />;
  }

  return <DeliveryPage token={token} />;
}

function InvalidLink() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="max-w-md text-center space-y-4">
        <AlertCircle className="h-16 w-16 text-destructive mx-auto" />
        <h1 className="text-2xl font-bold">Invalid Link</h1>
        <p className="text-muted-foreground">
          This delivery link is not valid. Please check your link and try again.
        </p>
      </div>
    </div>
  );
}

function DeliveryPage({ token }: { token: string }) {
  const [info, setInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revealed, setRevealed] = useState<any>(null);
  const [revealing, setRevealing] = useState(false);
  const [revealError, setRevealError] = useState('');
  const [copied, setCopied] = useState<number | null>(null);

  useEffect(() => {
    fetchDeliveryInfo(token)
      .then((data) => { setInfo(data); setLoading(false); })
      .catch((err) => { setError(err.message); setLoading(false); });
  }, [token]);

  const handleReveal = async () => {
    setRevealing(true);
    setRevealError('');
    try {
      const data = await revealCodes(token);
      setRevealed(data);
    } catch (err: any) {
      setRevealError(err.message);
    } finally {
      setRevealing(false);
    }
  };

  const handleCopy = (code: string, index: number) => {
    navigator.clipboard.writeText(code);
    setCopied(index);
    setTimeout(() => setCopied(null), 2000);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>Loading your delivery...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="max-w-md text-center space-y-4">
          <AlertCircle className="h-16 w-16 text-destructive mx-auto" />
          <h1 className="text-2xl font-bold">Link Expired or Invalid</h1>
          <p className="text-muted-foreground">{error}</p>
          <p className="text-sm text-muted-foreground">
            If you believe this is an error, please contact the merchant who sent you this link.
          </p>
        </div>
      </div>
    );
  }

  const isRevealed = info?.revealed || revealed;
  const codes = revealed?.codes || [];

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10">
            <Gift className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">Your Digital Code Delivery</h1>
          <p className="text-muted-foreground">{info?.merchant_name}</p>
        </div>

        {/* Order Info Card */}
        <div className="rounded-2xl border border-border bg-card p-6 shadow-lg space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Product</p>
              <p className="font-bold text-lg">{info?.product_name}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Total Value</p>
              <p className="font-bold text-lg text-primary">{formatCurrency(info?.amount || 0)}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Reference</p>
              <p className="font-mono text-xs">{info?.reference_id || '—'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Codes</p>
              <p>{info?.code_count || 0} item(s)</p>
            </div>
          </div>

          {info?.expires_at && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>Expires: {formatDate(info.expires_at)}</span>
            </div>
          )}
        </div>

        {/* Reveal Section */}
        {!isRevealed ? (
          <div className="rounded-2xl border border-border bg-card p-6 shadow-lg space-y-4">
            <div className="flex items-center gap-3">
              <Lock className="h-5 w-5 text-primary" />
              <h2 className="font-bold">Your codes are ready</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Click the button below to reveal your digital codes. This action can only be performed once
              and will be logged for security purposes.
            </p>
            {revealError && (
              <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                {revealError}
              </div>
            )}
            <button
              onClick={handleReveal}
              disabled={revealing}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-base font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {revealing ? (
                <><Loader2 className="h-5 w-5 animate-spin" /> Revealing...</>
              ) : (
                <><Eye className="h-5 w-5" /> Reveal My Codes</>
              )}
            </button>
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-card p-6 shadow-lg space-y-4">
            <div className="flex items-center gap-3">
              <Check className="h-5 w-5 text-emerald-500" />
              <h2 className="font-bold">Your Digital Codes</h2>
            </div>
            <p className="text-sm text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
              ⚠️ Save these codes now — this page will not be accessible again after you leave.
            </p>
            <div className="space-y-3">
              {codes.map((item: any, i: number) => (
                <div key={i} className="rounded-xl border border-border bg-background p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-xs text-muted-foreground">
                        {item.product} — {formatCurrency(item.face_value)}
                      </p>
                    </div>
                    <button
                      onClick={() => handleCopy(item.code, i)}
                      className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
                    >
                      {copied === i ? (
                        <><Check className="h-3 w-3" /> Copied</>
                      ) : (
                        <><Copy className="h-3 w-3" /> Copy</>
                      )}
                    </button>
                  </div>
                  <p className="font-mono text-lg font-bold break-all text-primary">{item.code}</p>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2 border-t border-border">
              <Shield className="h-3 w-3" />
              <span>Revealed on {formatDate(revealed?.revealed_at || new Date().toISOString())}</span>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center text-xs text-muted-foreground">
          <p>Secured by Digital Code Vault</p>
        </div>
      </div>
    </div>
  );
}
