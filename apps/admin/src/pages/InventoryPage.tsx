import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useMemo, ReactNode } from 'react';
import { Eye, Ban, RefreshCw, Search, Copy, Check, ChevronRight, ArrowLeft } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, Button, Select, Table, Th, Td, Badge, Modal } from '@/components/ui';
import { formatDate, statusColor } from '@/lib/utils';
import { familyOf } from '@/lib/product-family';

const PAGE_SIZE = 50;

/**
 * Inventory drills down the way the catalogue is actually shaped:
 *
 *   PlayStation → PSN USA / PSN Turkey / … → $10 / $20 / … → batches → codes
 *
 * Each step answers one question, so no screen has to show everything at once.
 * All the grouping comes from a single stock request; only batches and codes are
 * fetched on demand.
 */
export function InventoryPage() {
  const queryClient = useQueryClient();
  const [family, setFamily] = useState<string | null>(null);
  const [productId, setProductId] = useState<string | null>(null);
  const [denomination, setDenomination] = useState<any>(null);
  const [batchId, setBatchId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['denomination-stock'],
    queryFn: api.getDenominationStock,
  });
  const rows = data || [];

  if (batchId && denomination) {
    return (
      <CodesInBatch
        denomination={denomination}
        batchId={batchId}
        onBack={() => setBatchId(null)}
        queryClient={queryClient}
      />
    );
  }
  if (denomination) {
    return (
      <BatchesForDenomination
        denomination={denomination}
        onBack={() => setDenomination(null)}
        onOpenBatch={setBatchId}
        queryClient={queryClient}
      />
    );
  }
  if (family && productId) {
    return (
      <DenominationsForProduct
        rows={rows.filter((row: any) => row.product_id === productId)}
        onBack={() => setProductId(null)}
        onOpen={setDenomination}
      />
    );
  }
  if (family) {
    return (
      <ProductsInFamily
        family={family}
        rows={rows.filter((row: any) => familyOf(row) === family)}
        onBack={() => setFamily(null)}
        onOpen={setProductId}
      />
    );
  }
  return <FamilyGrid rows={rows} isLoading={isLoading} error={error} onOpen={setFamily} />;
}

/** Sum one stock counter across a set of denomination rows. */
function total(rows: any[], key: string) {
  return rows.reduce((sum, row) => sum + (Number(row[key]) || 0), 0);
}

/** Level 1 — one box per product family. */
function FamilyGrid({
  rows, isLoading, error, onOpen,
}: { rows: any[]; isLoading: boolean; error: unknown; onOpen: (family: string) => void }) {
  const [search, setSearch] = useState('');

  const families = useMemo(() => {
    const grouped = new Map<string, any[]>();
    for (const row of rows) {
      const name = familyOf(row);
      if (!grouped.has(name)) grouped.set(name, []);
      grouped.get(name)!.push(row);
    }
    const term = search.trim().toLowerCase();
    return [...grouped.entries()]
      .map(([name, group]) => ({
        name,
        products: new Set(group.map((row) => row.product_id)).size,
        available: total(group, 'available'),
        delivered: total(group, 'delivered'),
      }))
      .filter((family) => !term || family.name.toLowerCase().includes(term))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows, search]);

  return (
    <div className="space-y-6 animate-slide-up">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Inventory</h1>
        <p className="text-sm text-muted-foreground">
          Pick a brand to see its regions, then a value, then its batches.
        </p>
      </div>

      {!!error && (
        <p role="alert" className="text-destructive">
          Could not load inventory. {(error as Error).message}
        </p>
      )}

      <SearchBox value={search} onChange={setSearch} placeholder="Search brand..." />
      {isLoading && <p role="status" className="text-muted-foreground">Loading inventory...</p>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {families.map((family) => (
          <Tile
            key={family.name}
            title={family.name}
            subtitle={`${family.products} product${family.products === 1 ? '' : 's'}`}
            available={family.available}
            delivered={family.delivered}
            onClick={() => onOpen(family.name)}
          />
        ))}
        {!isLoading && families.length === 0 && <Empty>No products found.</Empty>}
      </div>
    </div>
  );
}

/** Level 2 — the regional products inside one family. */
function ProductsInFamily({
  family, rows, onBack, onOpen,
}: { family: string; rows: any[]; onBack: () => void; onOpen: (productId: string) => void }) {
  const [search, setSearch] = useState('');

  const products = useMemo(() => {
    const grouped = new Map<string, any[]>();
    for (const row of rows) {
      if (!grouped.has(row.product_id)) grouped.set(row.product_id, []);
      grouped.get(row.product_id)!.push(row);
    }
    const term = search.trim().toLowerCase();
    return [...grouped.entries()]
      .map(([id, group]) => ({
        id,
        name: group[0].product,
        region: group[0].region,
        sku: group[0].product_sku,
        values: group.length,
        available: total(group, 'available'),
        delivered: total(group, 'delivered'),
      }))
      .filter((product) =>
        !term || `${product.name} ${product.region} ${product.sku ?? ''}`.toLowerCase().includes(term))
      .sort((a, b) => a.region.localeCompare(b.region) || a.name.localeCompare(b.name));
  }, [rows, search]);

  return (
    <div className="space-y-6 animate-slide-up">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft className="mr-2 h-4 w-4" /> All brands
      </Button>

      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{family}</h1>
        <p className="text-sm text-muted-foreground">Pick a region to see the values it sells.</p>
      </div>

      <SearchBox value={search} onChange={setSearch} placeholder="Search region or SKU..." />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {products.map((product) => (
          <Tile
            key={product.id}
            title={product.region}
            subtitle={product.name}
            footer={
              <>
                {product.values} value{product.values === 1 ? '' : 's'}
                {product.sku && <span className="ml-2 font-mono">{product.sku}</span>}
              </>
            }
            available={product.available}
            delivered={product.delivered}
            onClick={() => onOpen(product.id)}
          />
        ))}
        {products.length === 0 && <Empty>No regions found.</Empty>}
      </div>
    </div>
  );
}

/** Level 3 — the values of one regional product. */
function DenominationsForProduct({
  rows, onBack, onOpen,
}: { rows: any[]; onBack: () => void; onOpen: (denomination: any) => void }) {
  const sorted = useMemo(
    () => [...rows].sort((a, b) => Number(a.face_value) - Number(b.face_value)),
    [rows],
  );
  const first = sorted[0];

  return (
    <div className="space-y-6 animate-slide-up">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft className="mr-2 h-4 w-4" /> Back
      </Button>

      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{first ? first.product : 'Product'}</h1>
        <p className="text-sm text-muted-foreground">
          {first?.region} · pick a value to see its batches.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {sorted.map((row: any) => (
          <Tile
            key={row.id}
            title={`$${Number(row.face_value)}`}
            subtitle={row.currency}
            footer={
              <>
                {row.batch_count} batch{row.batch_count === 1 ? '' : 'es'}
                {row.sku && <span className="ml-2 font-mono">{row.sku}</span>}
              </>
            }
            available={row.available}
            delivered={row.delivered}
            emphasiseTitle
            onClick={() => onOpen(row)}
          />
        ))}
        {sorted.length === 0 && <Empty>No values on this product yet.</Empty>}
      </div>
    </div>
  );
}

/** A drill-down box, shared by every level so the levels look consistent. */
function Tile({
  title, subtitle, footer, available, delivered, onClick, emphasiseTitle,
}: {
  title: string; subtitle?: string; footer?: ReactNode;
  available: number; delivered: number; onClick: () => void; emphasiseTitle?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group rounded-xl border border-border bg-card p-4 text-left transition-all hover:border-primary/40 hover:bg-muted/30"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={emphasiseTitle ? 'text-3xl font-semibold tracking-tight' : 'truncate font-medium'}>
            {title}
          </p>
          {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge className={available > 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-destructive/10 text-destructive'}>
          {available} left
        </Badge>
        <span className="text-xs text-muted-foreground">{delivered} delivered</span>
      </div>
      {footer && <p className="mt-2 text-xs text-muted-foreground">{footer}</p>}
    </button>
  );
}

function SearchBox({
  value, onChange, placeholder,
}: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-input bg-background py-2.5 pl-10 pr-3 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
      />
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <Card className="col-span-full py-12 text-center text-muted-foreground">{children}</Card>;
}

/** Level 2 — the batches behind one denomination, in the order they get used. */
function BatchesForDenomination({
  denomination, onBack, onOpenBatch, queryClient,
}: { denomination: any; onBack: () => void; onOpenBatch: (id: string) => void; queryClient: any }) {
  const [page, setPage] = useState(0);
  const { data, isLoading, error } = useQuery({
    queryKey: ['batches', denomination.id, page],
    queryFn: () => api.listBatches({
      denominationId: denomination.id,
      limit: String(PAGE_SIZE),
      offset: String(page * PAGE_SIZE),
    }),
  });

  const useFirst = useMutation({
    mutationFn: (id: string) => api.prioritiseBatchFirst(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['batches'] }),
  });

  const batches = data?.items || [];

  return (
    <div className="space-y-6 animate-slide-up">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft className="mr-2 h-4 w-4" /> All products
      </Button>

      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          {denomination.product} · ${Number(denomination.face_value)}
        </h1>
        <p className="text-sm text-muted-foreground">
          {denomination.region} · codes are handed out from the top batch down. "Use first" makes a
          batch the one that clears next.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Left to deliver" value={denomination.available} tone="text-emerald-400" />
        <Stat label="Delivered" value={denomination.delivered} />
        <Stat label="Reserved" value={denomination.reserved} />
        <Stat label="Voided" value={denomination.voided} tone="text-destructive" />
      </div>

      {error && <p role="alert" className="text-destructive">Could not load batches. {(error as Error).message}</p>}
      {isLoading && <p role="status" className="text-muted-foreground">Loading batches...</p>}

      <Card className="p-0">
        <Table>
          <thead>
            <tr>
              <Th>Order</Th>
              <Th>Batch</Th>
              <Th>Left</Th>
              <Th>Delivered</Th>
              <Th>Total</Th>
              <Th>Added</Th>
              <Th className="text-right">Codes</Th>
            </tr>
          </thead>
          <tbody>
            {batches.map((batch: any, index: number) => (
              <tr key={batch.id} className="hover:bg-muted/30">
                <Td>
                  <div className="flex items-center gap-2">
                    {index === 0 && page === 0 ? (
                      <Badge className="bg-primary/10 text-primary">Next</Badge>
                    ) : (
                      <span className="tabular-nums text-muted-foreground">{batch.priority ?? 0}</span>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={useFirst.isPending}
                      onClick={() => useFirst.mutate(batch.id)}
                    >
                      Use first
                    </Button>
                  </div>
                </Td>
                <Td>
                  <div className="font-medium">{batch.batch_name || `Batch ${batch.id.slice(0, 8)}`}</div>
                  <div className="font-mono text-xs text-muted-foreground">{batch.id.slice(0, 12)}</div>
                </Td>
                <Td>
                  <Badge className={batch.available > 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-muted text-muted-foreground'}>
                    {batch.available}
                  </Badge>
                </Td>
                <Td className="text-muted-foreground">{batch.delivered}</Td>
                <Td className="font-medium">{batch.quantity}</Td>
                <Td className="text-muted-foreground">{formatDate(batch.created_at)}</Td>
                <Td className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => onOpenBatch(batch.id)}>
                    View <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </Td>
              </tr>
            ))}
            {!isLoading && batches.length === 0 && (
              <tr>
                <Td colSpan={7} className="py-12 text-center text-muted-foreground">
                  No batches yet for this value. Upload codes to create one.
                </Td>
              </tr>
            )}
          </tbody>
        </Table>
      </Card>

      {useFirst.isError && <p role="alert" className="text-destructive">{(useFirst.error as Error).message}</p>}
      <Pagination page={page} total={data?.total || 0} onChange={setPage} />
    </div>
  );
}

/** Level 3 — the individual codes inside one batch. */
function CodesInBatch({
  denomination, batchId, onBack, queryClient,
}: { denomination: any; batchId: string; onBack: () => void; queryClient: any }) {
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(0);
  const [revealItem, setRevealItem] = useState<any>(null);
  const [revealedCode, setRevealedCode] = useState('');
  const [copied, setCopied] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['codes', batchId, statusFilter, page],
    queryFn: () => api.listCodes({
      batchId,
      limit: String(PAGE_SIZE),
      offset: String(page * PAGE_SIZE),
      ...(statusFilter ? { status: statusFilter } : {}),
    }),
  });

  const revealMutation = useMutation({
    mutationFn: (id: string) => api.revealCode(id),
    onSuccess: (result: any) => setRevealedCode(result.code),
  });
  const voidMutation = useMutation({
    mutationFn: (id: string) => api.voidCode(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['codes'] });
      queryClient.invalidateQueries({ queryKey: ['denomination-stock'] });
    },
  });

  const items = data?.items || [];

  return (
    <div className="space-y-6 animate-slide-up">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to batches
      </Button>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Codes in batch <span className="font-mono text-lg">{batchId.slice(0, 12)}</span>
        </h1>
        <p className="text-sm text-muted-foreground">
          {denomination.product} · ${Number(denomination.face_value)}
        </p>
      </div>

      <div className="w-full sm:w-48">
        <Select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
          options={[
            { value: '', label: 'All statuses' },
            { value: 'AVAILABLE', label: 'Available' },
            { value: 'RESERVED', label: 'Reserved' },
            { value: 'ALLOCATED', label: 'Allocated' },
            { value: 'DELIVERED', label: 'Delivered' },
            { value: 'VOIDED', label: 'Voided' },
          ]}
        />
      </div>

      {error && <p role="alert" className="text-destructive">Could not load codes. {(error as Error).message}</p>}

      <Card className="p-0">
        {isLoading ? (
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
              {items.map((item: any) => (
                <tr key={item.id} className="hover:bg-muted/30">
                  <Td className="font-mono text-xs">{item.id.slice(0, 8)}</Td>
                  <Td><Badge className={statusColor(item.status)}>{item.status}</Badge></Td>
                  <Td className="text-muted-foreground">{formatDate(item.created_at)}</Td>
                  <Td className="text-muted-foreground">{item.revealed_at ? formatDate(item.revealed_at) : '—'}</Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost" size="sm" title="Reveal code"
                        onClick={() => { setRevealItem(item); setRevealedCode(''); revealMutation.mutate(item.id); }}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      {item.status === 'AVAILABLE' && (
                        <Button
                          variant="ghost" size="sm" title="Void code"
                          disabled={voidMutation.isPending}
                          onClick={() => voidMutation.mutate(item.id)}
                        >
                          <Ban className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
              {items.length === 0 && (
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

      {voidMutation.isError && <p role="alert" className="text-destructive">{(voidMutation.error as Error).message}</p>}
      <Pagination page={page} total={data?.total || 0} onChange={setPage} />

      <RevealModal
        revealItem={revealItem}
        revealedCode={revealedCode}
        isPending={revealMutation.isPending}
        copied={copied}
        onCopy={() => { navigator.clipboard.writeText(revealedCode); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
        onClose={() => { setRevealItem(null); setRevealedCode(''); }}
      />
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-lg bg-muted/50 p-3 text-center">
      <p className={`text-2xl font-semibold ${tone || ''}`}>{value ?? 0}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function Pagination({ page, total, onChange }: { page: number; total: number; onChange: (page: number) => void }) {
  if (total <= PAGE_SIZE) return null;
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">
        {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
      </span>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={page === 0} onClick={() => onChange(page - 1)}>Previous</Button>
        <Button variant="outline" size="sm" disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => onChange(page + 1)}>Next</Button>
      </div>
    </div>
  );
}

function RevealModal({
  revealItem, revealedCode, isPending, copied, onCopy, onClose,
}: {
  revealItem: any; revealedCode: string; isPending: boolean; copied: boolean;
  onCopy: () => void; onClose: () => void;
}) {
  return (
    <Modal open={!!revealItem} onClose={onClose} title="Reveal code">
      {isPending ? (
        <div className="flex flex-col items-center gap-3 py-8 text-muted-foreground">
          <RefreshCw className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm">Revealing your code...</p>
        </div>
      ) : revealedCode ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/40 p-4">
            <p className="break-all font-mono text-lg">{revealedCode}</p>
          </div>
          <Button className="w-full" onClick={onCopy}>
            {copied ? <><Check className="mr-2 h-4 w-4" /> Copied</> : <><Copy className="mr-2 h-4 w-4" /> Copy code</>}
          </Button>
          <p className="text-xs text-muted-foreground">This reveal is recorded in the audit log.</p>
        </div>
      ) : (
        <p className="py-6 text-center text-muted-foreground">Could not reveal this code.</p>
      )}
    </Modal>
  );
}
