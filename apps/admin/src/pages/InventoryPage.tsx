import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useMemo, useEffect } from 'react';
import {
  Eye, Ban, RefreshCw, Search, ShieldAlert, Copy, Check,
  ChevronRight, Layers, ArrowLeft,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Card, Button, Select, Table, Th, Td, Badge, Modal } from '@/components/ui';
import { formatDate, statusColor } from '@/lib/utils';

export function InventoryPage() {
  const queryClient = useQueryClient();
  const [view, setView] = useState<'overview' | 'batch'>('overview');
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedSearch(search); setBatchPage(0); }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  const [revealItem, setRevealItem] = useState<any>(null);
  const [revealedCode, setRevealedCode] = useState('');
  const [copied, setCopied] = useState(false);

  const [batchPage, setBatchPage] = useState(0);
  const [codePage, setCodePage] = useState(0);
  const pageSize = 50;

  // Batches list
  const { data: batchesData, isLoading: batchesLoading, error: batchesError } = useQuery({
    queryKey: ['batches', batchPage, debouncedSearch],
    queryFn: () => api.listBatches({ limit: String(pageSize), offset: String(batchPage * pageSize), search: debouncedSearch }),
  });

  // Codes for selected batch
  const { data: batchCodes, isLoading: batchCodesLoading, error: codesError } = useQuery({
    queryKey: ['codes', 'batch', selectedBatchId, statusFilter, codePage],
    queryFn: () => api.listCodes({ batchId: selectedBatchId!, limit: String(pageSize), offset: String(codePage * pageSize), ...(statusFilter ? { status: statusFilter } : {}) }),
    enabled: !!selectedBatchId,
  });

  const revealMutation = useMutation({
    mutationFn: (id: string) => api.revealCode(id),
    onSuccess: (data) => {
      setRevealedCode(data.code);
      queryClient.invalidateQueries({ queryKey: ['codes'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-stats'] });
      queryClient.invalidateQueries({ queryKey: ['batches'] });
      queryClient.invalidateQueries({ queryKey: ['denomination-stock'] });
    },
    onError: () => {
      setRevealedCode('');
    },
  });

  const voidMutation = useMutation({
    mutationFn: (id: string) => api.voidCode(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['codes'] });
      queryClient.invalidateQueries({ queryKey: ['batches'] });
      queryClient.invalidateQueries({ queryKey: ['denomination-stock'] });
    },
  });

  const handleCopy = async () => {
    if (!revealedCode) return;
    await navigator.clipboard.writeText(revealedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReveal = (item: any) => {
    setRevealItem(item);
    setRevealedCode('');
    setCopied(false);
    revealMutation.mutate(item.id);
  };

  const handleClose = () => {
    setRevealItem(null);
    setRevealedCode('');
    setCopied(false);
  };

  const openBatch = (batchId: string) => {
    setSelectedBatchId(batchId);
    setView('batch');
    setStatusFilter('');
    setCodePage(0);
  };

  // Reordering changes which batch the next order draws from.
  const useFirstMutation = useMutation({
    mutationFn: (batchId: string) => api.prioritiseBatchFirst(batchId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['batches'] }),
  });

  const backToOverview = () => {
    setView('overview');
    setSelectedBatchId(null);
    setStatusFilter('');
    setCodePage(0);
  };

  const filteredBatches = batchesData?.items || [];

  const filteredBatchCodes = useMemo(() => {
    if (!batchCodes?.items) return [];
    return batchCodes.items;
  }, [batchCodes?.items]);

  const selectedBatch = batchesData?.items?.find((b: any) => b.id === selectedBatchId);

  // ─── Batch detail view ───
  if (view === 'batch' && selectedBatchId) {
    return (
      <div className="space-y-6 animate-slide-up">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={backToOverview}>
            <ArrowLeft className="mr-1 h-4 w-4" /> Back
          </Button>
        </div>

        {/* Batch header */}
        <Card className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                {selectedBatch?.batch_name || `Batch ${selectedBatchId.slice(0, 12)}`}
              </h1>
              <p className="text-sm text-muted-foreground">
                {selectedBatch?.denomination.product} · ${selectedBatch?.denomination.face_value} · {selectedBatch?.denomination.region}
              </p>
            </div>
          </div>

          {/* Batch stats */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <div className="rounded-lg bg-muted/50 p-3 text-center">
              <p className="text-2xl font-semibold">{selectedBatch?.quantity || 0}</p>
              <p className="text-xs text-muted-foreground">Total codes</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3 text-center">
              <p className="text-2xl font-semibold text-emerald-400">{selectedBatch?.available || 0}</p>
              <p className="text-xs text-muted-foreground">Left to deliver</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3 text-center">
              <p className="text-2xl font-semibold text-blue-400">{selectedBatch?.allocated || 0}</p>
              <p className="text-xs text-muted-foreground">Allocated</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3 text-center">
              <p className="text-2xl font-semibold text-amber-400">{selectedBatch?.reserved || 0}</p>
              <p className="text-xs text-muted-foreground">Reserved</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3 text-center">
              <p className="text-2xl font-semibold text-primary">{selectedBatch?.delivered || 0}</p>
              <p className="text-xs text-muted-foreground">Delivered</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-3 text-center">
              <p className="text-2xl font-semibold text-destructive">{selectedBatch?.voided || 0}</p>
              <p className="text-xs text-muted-foreground">Voided</p>
            </div>
          </div>

          {selectedBatch?.note && (
            <div className="rounded-lg bg-muted/30 p-3 text-sm text-muted-foreground">
              <span className="font-medium">Note:</span> {selectedBatch.note}
            </div>
          )}
          {selectedBatch?.supplier && (
            <p className="text-xs text-muted-foreground">Supplier: {selectedBatch.supplier}</p>
          )}
          <p className="text-xs text-muted-foreground">Created: {formatDate(selectedBatch?.created_at)}</p>
        </Card>

        {/* Status filter */}
        <div className="w-full sm:w-48">
          <Select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setCodePage(0); }}
            options={[
              { value: '', label: 'All Statuses' },
              { value: 'AVAILABLE', label: 'Available' },
              { value: 'RESERVED', label: 'Reserved' },
              { value: 'ALLOCATED', label: 'Allocated' },
              { value: 'DELIVERED', label: 'Delivered' },
              { value: 'VOIDED', label: 'Voided' },
            ]}
          />
        </div>

        {codesError && <p role="alert" className="text-destructive">Could not load codes. {codesError.message}</p>}
        {/* Codes table */}
        <Card className="p-0">
          {batchCodesLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <RefreshCw className="mr-2 h-5 w-5 animate-spin" /> Loading codes...
            </div>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Code</Th>
                  <Th>Status</Th>
                  <Th>Added</Th>
                  <Th>Delivered</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {filteredBatchCodes.map((item: any) => (
                  <tr key={item.id} className="group hover:bg-muted/30">
                    <Td className="font-mono text-xs">{item.id.slice(0, 8)}</Td>
                    <Td>
                      <Badge className={statusColor(item.status)}>{item.status}</Badge>
                    </Td>
                    <Td className="text-muted-foreground">{formatDate(item.created_at)}</Td>
                    <Td className="text-muted-foreground">{item.revealed_at ? formatDate(item.revealed_at) : '—'}</Td>
                    <Td className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleReveal(item)}
                          disabled={item.status === 'DELIVERED' || item.status === 'VOIDED'}
                          title="Reveal code"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {item.status === 'AVAILABLE' && (
                          <Button variant="ghost" size="sm" disabled={voidMutation.isPending} onClick={() => voidMutation.mutate(item.id)} title="Void code">
                            <Ban className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </Td>
                  </tr>
                ))}
                {filteredBatchCodes.length === 0 && (
                  <tr>
                    <Td colSpan={5} className="py-12 text-center text-muted-foreground">
                      No codes found in this batch.
                    </Td>
                  </tr>
                )}
              </tbody>
            </Table>
          )}
        </Card>

        <Pagination page={codePage} total={batchCodes?.total || 0} onChange={setCodePage} />
        {voidMutation.isError && <p role="alert" className="text-destructive">{voidMutation.error.message}</p>}
        <RevealModal
          revealItem={revealItem}
          revealedCode={revealedCode}
          isPending={revealMutation.isPending}
          copied={copied}
          onCopy={handleCopy}
          onClose={handleClose}
        />
      </div>
    );
  }

  // ─── Overview view (default) ───
  const isLoading = batchesLoading;


  return (
    <div className="space-y-6 animate-slide-up">
      {batchesError && <p role="alert" className="text-destructive">Could not load batches. {batchesError.message}</p>}
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Inventory</h1>
          <p className="text-sm text-muted-foreground">
            Open a batch to see delivered codes and remaining stock. Batches are listed in the order
            their codes get handed out — use "Use first" to move one to the front.
          </p>
        </div>
      </div>

      {isLoading && <p role="status" className="text-muted-foreground">Loading batches...</p>}
      {/* Batches section */}
      <div>
        <h2 className="mb-3 text-lg font-semibold">Batches</h2>

        {/* Search */}
        <Card className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); }}
              placeholder="Search batch name, product, region..."
              className="w-full rounded-lg border border-input bg-background py-2.5 pl-10 pr-3 text-sm outline-none transition-all placeholder:text-muted-foreground/50 focus:border-primary focus:ring-1 focus:ring-primary/30"
            />
          </div>
        </Card>

        {/* Batches table */}
        <Card className="p-0">
          <Table>
            <thead>
              <tr>
                <Th>Order</Th>
                <Th>Batch Name</Th>
                <Th>Product</Th>
                <Th>Denomination</Th>
                <Th>Left</Th>
                <Th>Delivered</Th>
                <Th>Total</Th>
                <Th>Created</Th>
                <Th className="text-right">View</Th>
              </tr>
            </thead>
            <tbody>
              {filteredBatches.map((b: any) => (
                <tr
                  key={b.id}
                  className="group cursor-pointer hover:bg-muted/30"
                  onClick={() => openBatch(b.id)}
                  tabIndex={0}
                  role="button"
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openBatch(b.id); } }}
                >
                  <Td>
                    {/* The row opens the batch, so the reorder control must not bubble. */}
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <span className="tabular-nums text-muted-foreground" title="Lower clears out first">
                        {b.priority ?? 0}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={useFirstMutation.isPending}
                        title="Hand out this batch's codes before any other batch of this denomination"
                        onClick={() => useFirstMutation.mutate(b.id)}
                      >
                        Use first
                      </Button>
                    </div>
                  </Td>
                  <Td>
                    <div className="font-medium">{b.batch_name || `Batch ${b.id.slice(0, 8)}`}</div>
                    <div className="text-xs font-mono text-muted-foreground">{b.id.slice(0, 12)}</div>
                  </Td>
                  <Td>
                    <div className="font-medium">{b.denomination.product}</div>
                    <div className="text-xs text-muted-foreground">{b.denomination.region}</div>
                  </Td>
                  <Td className="font-medium">${b.denomination.face_value}</Td>
                  <Td>
                    <Badge className={b.available > 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-muted text-muted-foreground'}>
                      {b.available}
                    </Badge>
                  </Td>
                  <Td className="text-muted-foreground">{b.delivered}</Td>
                  <Td className="font-medium">{b.quantity}</Td>
                  <Td className="text-muted-foreground">{formatDate(b.created_at)}</Td>
                  <Td className="text-right">
                    <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </Td>
                </tr>
              ))}
              {filteredBatches.length === 0 && (
                <tr>
                  <Td colSpan={9} className="py-12 text-center text-muted-foreground">
                    No batches found.
                  </Td>
                </tr>
              )}
            </tbody>
          </Table>
        </Card>
      </div>

      <Pagination page={batchPage} total={batchesData?.total || 0} onChange={setBatchPage} />
      <RevealModal
        revealItem={revealItem}
        revealedCode={revealedCode}
        isPending={revealMutation.isPending}
        copied={copied}
        onCopy={handleCopy}
        onClose={handleClose}
      />
    </div>
  );
}

// ─── Reusable reveal modal ───
function RevealModal({
  revealItem, revealedCode, isPending, copied, onCopy, onClose,
}: {
  revealItem: any;
  revealedCode: string;
  isPending: boolean;
  copied: boolean;
  onCopy: () => void;
  onClose: () => void;
}) {
  return (
    <Modal open={!!revealItem} onClose={onClose} title="Reveal Code" size="md">
      {isPending ? (
        <div className="flex flex-col items-center gap-3 py-8 text-muted-foreground">
          <RefreshCw className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm">Revealing your code...</p>
        </div>
      ) : revealedCode ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-5">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Decrypted Code</p>
                <p className="text-sm text-muted-foreground">
                  {revealItem?.denomination?.product} · ${revealItem?.denomination?.face_value}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={onCopy}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <p className="font-mono text-2xl font-semibold break-all text-primary">{revealedCode}</p>
          </div>
          <div className="flex items-start gap-3 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">One-time reveal enforced</p>
              <p className="text-xs opacity-90">This code is now marked DELIVERED and cannot be revealed again. The action is logged in the audit trail.</p>
            </div>
          </div>
          <Button onClick={onClose} className="w-full">
            Done
          </Button>
        </div>
      ) : (
        <div className="py-6 text-center text-muted-foreground">
          <ShieldAlert className="mx-auto mb-2 h-8 w-8 text-destructive" />
          <p>Failed to reveal code.</p>
          <p className="text-xs">It may have already been revealed or voided.</p>
        </div>
      )}
    </Modal>
  );
}

function Pagination({ page, total, onChange }: { page: number; total: number; onChange: (page: number) => void }) {
  if (total <= 50) return null;
  return <div className="flex items-center justify-between gap-3 text-sm">
    <span className="text-muted-foreground">{page * 50 + 1}–{Math.min((page + 1) * 50, total)} of {total}</span>
    <div className="flex gap-2">
      <Button variant="outline" size="sm" disabled={page === 0} onClick={() => onChange(page - 1)}>Previous</Button>
      <Button variant="outline" size="sm" disabled={(page + 1) * 50 >= total} onClick={() => onChange(page + 1)}>Next</Button>
    </div>
  </div>;
}
