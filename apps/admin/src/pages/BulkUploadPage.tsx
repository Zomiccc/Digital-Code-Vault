import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Upload, CheckCircle, AlertCircle, Shield, FileDigit } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, Button, Select, Input, Badge } from '@/components/ui';

// Sentinel for the supplier dropdown; never sent to the API as an id.
const NEW_SUPPLIER = '__new__';

export function BulkUploadPage() {
  const queryClient = useQueryClient();
  const [productId, setProductId] = useState('');
  const [denomId, setDenomId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [newSupplierName, setNewSupplierName] = useState('');
  const [newSupplierContact, setNewSupplierContact] = useState('');
  const [codesText, setCodesText] = useState('');
  const [costPerCode, setCostPerCode] = useState('');
  const [costCurrency, setCostCurrency] = useState('USD');
  const [costNote, setCostNote] = useState('');
  const [batchName, setBatchName] = useState('');
  const [result, setResult] = useState<any>(null);

  const { data: products, isLoading: productsLoading } = useQuery({ queryKey: ['products'], queryFn: api.listProducts });
  const { data: suppliers } = useQuery({ queryKey: ['suppliers'], queryFn: api.listSuppliers });

  const selectedProduct = products?.find((p: any) => p.id === productId);
  const denominations = selectedProduct?.denominations || [];

  const codeCount = codesText.split('\n').map((c) => c.trim()).filter(Boolean).length;

  const uploadMutation = useMutation({
    mutationFn: async () => {
      const codes = codesText.split('\n').map((c) => c.trim()).filter(Boolean);
      // A newly typed supplier is created first so the batch can reference it.
      let resolvedSupplierId = supplierId;
      if (supplierId === NEW_SUPPLIER) {
        const created = await api.createSupplier({
          name: newSupplierName.trim(),
          contact_info: newSupplierContact.trim() || undefined,
        });
        resolvedSupplierId = created.id;
        queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      }
      return api.bulkUpload(denomId, codes, resolvedSupplierId || undefined, {
        cost_per_code: costPerCode ? parseFloat(costPerCode) : undefined,
        currency: costCurrency,
        note: costNote || undefined,
        batch_name: batchName || undefined,
      });
    },
    onSuccess: (data) => {
      setResult(data);
      queryClient.invalidateQueries({ queryKey: ['codes'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-stats'] });
      queryClient.invalidateQueries({ queryKey: ['cost-basis'] });
      queryClient.invalidateQueries({ queryKey: ['platform-finance-overview'] });
      queryClient.invalidateQueries({ queryKey: ['batches'] });
      queryClient.invalidateQueries({ queryKey: ['denomination-stock'] });
    },
    onError: (err: any) => setResult({ error: err.message }),
  });

  const reset = () => {
    setProductId('');
    setDenomId('');
    setSupplierId('');
    setNewSupplierName('');
    setNewSupplierContact('');
    setCodesText('');
    setCostPerCode('');
    setCostCurrency('USD');
    setCostNote('');
    setBatchName('');
    setResult(null);
  };

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Bulk Upload</h1>
        <p className="text-sm text-muted-foreground">Upload codes for AES-256-GCM encryption and secure storage</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Upload form */}
        <Card className="lg:col-span-2 space-y-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Upload className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-semibold">Upload Codes</h2>
              <p className="text-xs text-muted-foreground">Codes are encrypted before storage</p>
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <Select
              label="Product"
              value={productId}
              onChange={(e) => { setProductId(e.target.value); setDenomId(''); }}
              options={[
                { value: '', label: productsLoading ? 'Loading...' : '— Select —' },
                ...(products?.map((p: any) => ({ value: p.id, label: `${p.name} (${p.region})` })) || []),
              ]}
            />
            <Select
              label="Denomination"
              value={denomId}
              onChange={(e) => setDenomId(e.target.value)}
              options={[
                { value: '', label: productId ? '— Select —' : 'Select product first' },
                ...denominations.map((d: any) => ({ value: d.id, label: `$${d.faceValue} ${d.currency || 'USD'}` })),
              ]}
            />
          </div>

          <Select
            label="Supplier (optional)"
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            options={[
              { value: '', label: '— None —' },
              ...(suppliers?.map((s: any) => ({ value: s.id, label: s.name })) || []),
              { value: NEW_SUPPLIER, label: '+ Add a new supplier' },
            ]}
          />

          {supplierId === NEW_SUPPLIER && (
            <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-4">
              <Input
                label="New supplier name"
                value={newSupplierName}
                onChange={(e: any) => setNewSupplierName(e.target.value)}
                placeholder="e.g. Gulf Digital Trading"
              />
              <Input
                label="Contact info (optional)"
                value={newSupplierContact}
                onChange={(e: any) => setNewSupplierContact(e.target.value)}
                placeholder="email, phone or account manager"
              />
              <p className="text-xs text-muted-foreground">
                The supplier is created and saved when you upload, then reusable for later batches.
              </p>
            </div>
          )}

          {/* Batch name */}
          <Input
            label="Batch name (optional)"
            value={batchName}
            onChange={(e: any) => setBatchName(e.target.value)}
            placeholder="e.g. PSN KSA Batch #5 — Jan 2026"
          />

          {/* Cost bookkeeping — remember what this batch cost */}
          <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Batch cost & supplier record (for your books)
            </p>
            <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
              <Input
                label="Cost per code"
                type="number"
                value={costPerCode}
                onChange={(e: any) => setCostPerCode(e.target.value)}
                placeholder="e.g. 2.50"
              />
              <Select
                label="Currency"
                value={costCurrency}
                onChange={(e: any) => setCostCurrency(e.target.value)}
                options={[
                  { value: 'USD', label: 'USD' },
                  { value: 'PKR', label: 'PKR' },
                  { value: 'EUR', label: 'EUR' },
                ]}
              />
            </div>
            <Input
              label="Note (optional)"
              value={costNote}
              onChange={(e: any) => setCostNote(e.target.value)}
              placeholder="e.g. Paid via bank transfer, invoice #123"
            />
            {costPerCode && codeCount > 0 && (
              <p className="text-xs text-muted-foreground">
                Total batch cost: <strong>{(parseFloat(costPerCode || '0') * codeCount).toFixed(2)} {costCurrency}</strong> ({codeCount} codes)
              </p>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Codes</label>
              <Badge className="bg-secondary text-secondary-foreground">{codeCount} detected</Badge>
            </div>
            <textarea
              value={codesText}
              onChange={(e) => setCodesText(e.target.value)}
              rows={10}
              placeholder="CODE-001&#10;CODE-002&#10;CODE-003"
              className="w-full rounded-lg border border-input bg-background px-4 py-3 font-mono text-sm outline-none transition-all placeholder:text-muted-foreground/50 focus:border-primary focus:ring-1 focus:ring-primary/30"
            />
            <p className="text-xs text-muted-foreground">Enter one code per line. Duplicates will be skipped automatically.</p>
          </div>

          <div className="flex gap-3">
            <Button
              onClick={() => uploadMutation.mutate()}
              disabled={uploadMutation.isPending || !denomId || codeCount === 0 || (supplierId === NEW_SUPPLIER && !newSupplierName.trim())}
              size="lg"
              className="flex-1"
            >
              {uploadMutation.isPending ? (
                <>Encrypting...</>
              ) : (
                <>
                  <Shield className="mr-2 h-4 w-4" /> Upload & Encrypt
                </>
              )}
            </Button>
            {result && (
              <Button variant="outline" size="lg" onClick={reset}>
                Reset
              </Button>
            )}
          </div>
        </Card>

        {/* Sidebar info */}
        <div className="space-y-5">
          <Card className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
                <Shield className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold">Encryption</h3>
                <p className="text-xs text-muted-foreground">AES-256-GCM + SHA-256 hash</p>
              </div>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Every code is encrypted with a unique initialization vector before being written to the database. The
              plaintext code is never stored.
            </p>
          </Card>

          <Card className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400">
                <FileDigit className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold">Deduplication</h3>
                <p className="text-xs text-muted-foreground">SHA-256 code hashes</p>
              </div>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Uploads are checked against existing code hashes. Duplicate codes are rejected without consuming inventory
              capacity.
            </p>
          </Card>
        </div>
      </div>

      {/* Result */}
      {result && (
        <Card className={result.error ? 'border-destructive/30' : 'border-emerald-500/20'}>
          {result.error ? (
            <div className="flex items-center gap-3 text-destructive">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
                <AlertCircle className="h-5 w-5" />
              </div>
              <div>
                <p className="font-semibold">Upload failed</p>
                <p className="text-sm">{result.error}</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10">
                  <CheckCircle className="h-5 w-5 text-emerald-400" />
                </div>
                <div>
                  <p className="font-semibold text-emerald-400">Upload Complete</p>
                  <p className="text-xs text-muted-foreground">Batch ID: {result.batchId}</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="rounded-lg bg-muted/50 p-3 text-center">
                  <p className="text-2xl font-semibold text-emerald-400">{result.inserted}</p>
                  <p className="text-xs text-muted-foreground">Inserted</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-3 text-center">
                  <p className="text-2xl font-semibold text-amber-400">{result.duplicates}</p>
                  <p className="text-xs text-muted-foreground">Duplicates</p>
                </div>
                <div className="rounded-lg bg-muted/50 p-3 text-center">
                  <p className="text-2xl font-semibold text-destructive">{result.errors?.length || 0}</p>
                  <p className="text-xs text-muted-foreground">Errors</p>
                </div>
              </div>
              {result.errors?.length > 0 && (
                <div className="rounded-lg bg-destructive/10 p-3 text-xs text-destructive max-h-40 overflow-y-auto">
                  {result.errors.slice(0, 20).map((e: string, i: number) => (
                    <div key={i} className="py-0.5">{e}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
