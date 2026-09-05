import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useMemo } from 'react';
import { ShieldAlert, Search, Lock, Unlock } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, Button, Badge, Modal, Table, Th, Td } from '@/components/ui';
import { formatDate } from '@/lib/utils';

type Tab = 'merchants' | 'products' | 'keys';

/**
 * The controls for when something is going wrong. Each one flips a flag the
 * platform already enforces, so freezing genuinely blocks delivery rather than
 * only hiding a button.
 */
export function EmergencyPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('merchants');
  const [search, setSearch] = useState('');
  const [confirm, setConfirm] = useState<null | { title: string; body: string; run: () => Promise<any> }>(null);
  const [error, setError] = useState('');

  const { data: status } = useQuery({ queryKey: ['emergency-status'], queryFn: api.getEmergencyStop });
  const { data: targets, isLoading } = useQuery({ queryKey: ['emergency-targets'], queryFn: api.listEmergencyTargets });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['emergency-status'] });
    queryClient.invalidateQueries({ queryKey: ['emergency-targets'] });
    queryClient.invalidateQueries({ queryKey: ['merchants'] });
    queryClient.invalidateQueries({ queryKey: ['products'] });
  };

  const act = useMutation({
    mutationFn: (run: () => Promise<any>) => run(),
    onSuccess: () => { setError(''); setConfirm(null); refresh(); },
    onError: (err: any) => { setError(err.message); setConfirm(null); },
  });

  const stopped = !!status?.global_stop;

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const match = (text: string) => !term || text.toLowerCase().includes(term);
    return {
      merchants: (targets?.merchants || []).filter((m: any) => match(`${m.name} ${m.email}`)),
      products: (targets?.products || []).filter((p: any) => match(`${p.name} ${p.region}`)),
      keys: (targets?.api_keys || []).filter((k: any) => match(`${k.prefix} ${k.merchant?.name ?? ''}`)),
    };
  }, [targets, search]);

  return (
    <div className="space-y-6 animate-slide-up">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Emergency</h1>
        <p className="text-sm text-muted-foreground">
          Stop everything, or freeze one merchant, product or API key. Frozen targets cannot receive
          or fulfil orders.
        </p>
      </div>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      {/* Global stop */}
      <Card className={stopped ? 'border-destructive/50 bg-destructive/5' : ''}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${stopped ? 'bg-destructive/15 text-destructive' : 'bg-muted text-muted-foreground'}`}>
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-semibold">
                {stopped ? 'All code delivery is stopped' : 'Code delivery is running'}
              </h2>
              <p className="text-sm text-muted-foreground">
                {stopped
                  ? 'Every merchant sees a notice and cannot place orders. Admin manual orders still work.'
                  : 'Turning this on blocks all merchant and API orders platform-wide, and tells every merchant why.'}
              </p>
              {status?.updated_at && (
                <p className="mt-1 text-xs text-muted-foreground">Last changed {formatDate(status.updated_at)}</p>
              )}
            </div>
          </div>
          <Button
            variant={stopped ? 'secondary' : 'destructive'}
            disabled={act.isPending}
            onClick={() => setConfirm({
              title: stopped ? 'Resume code delivery?' : 'Stop all code delivery?',
              body: stopped
                ? 'Merchants will be able to place orders again immediately.'
                : 'Every merchant and API order will be refused until you turn this back off. Merchants will be shown a notice explaining that the platform is paused.',
              run: () => api.setEmergencyStop(!stopped),
            })}
          >
            {stopped ? <><Unlock className="mr-2 h-4 w-4" /> Resume delivery</> : <><Lock className="mr-2 h-4 w-4" /> Stop everything</>}
          </Button>
        </div>
      </Card>

      {/* Counts */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Count label="Merchants frozen" frozen={status?.merchants?.frozen} total={status?.merchants?.total} />
        <Count label="Products frozen" frozen={status?.products?.frozen} total={status?.products?.total} />
        <Count label="API keys disabled" frozen={status?.api_keys?.disabled} total={status?.api_keys?.total} />
      </div>

      {/* Freeze every merchant */}
      <Card className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Freeze every merchant</h2>
          <p className="text-sm text-muted-foreground">
            Suspends all active merchant accounts. Releasing only reactivates the ones suspended this
            way, so an account disabled for another reason stays disabled.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="destructive"
            disabled={act.isPending}
            onClick={() => setConfirm({
              title: 'Freeze every merchant?',
              body: 'All active merchant accounts will be suspended and unable to order until released.',
              run: () => api.freezeAllMerchants(true),
            })}
          >
            Freeze all
          </Button>
          <Button
            variant="secondary"
            disabled={act.isPending}
            onClick={() => setConfirm({
              title: 'Release frozen merchants?',
              body: 'Every merchant suspended by this control will be reactivated.',
              run: () => api.freezeAllMerchants(false),
            })}
          >
            Release all
          </Button>
        </div>
      </Card>

      {/* Per-target controls */}
      <div className="flex gap-1 overflow-x-auto rounded-lg border border-border bg-card p-1">
        {(['merchants', 'products', 'keys'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-md px-4 py-2 text-sm font-medium capitalize transition-all ${
              tab === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            {t === 'keys' ? 'API keys' : t}
          </button>
        ))}
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`Search ${tab === 'keys' ? 'API keys' : tab}...`}
          className="w-full rounded-lg border border-input bg-background py-2.5 pl-10 pr-3 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
        />
      </div>

      {isLoading && <p role="status" className="text-muted-foreground">Loading...</p>}

      <Card className="p-0">
        <Table>
          <thead>
            <tr>
              <Th>{tab === 'keys' ? 'Key' : 'Name'}</Th>
              <Th>{tab === 'merchants' ? 'Email' : tab === 'products' ? 'Region' : 'Merchant'}</Th>
              <Th>Status</Th>
              <Th className="text-right">Action</Th>
            </tr>
          </thead>
          <tbody>
            {tab === 'merchants' && filtered.merchants.map((merchant: any) => (
              <Row
                key={merchant.id}
                name={merchant.name}
                secondary={merchant.email}
                frozen={merchant.status !== 'ACTIVE'}
                status={merchant.status}
                pending={act.isPending}
                onToggle={(frozen) => setConfirm({
                  title: frozen ? `Freeze ${merchant.name}?` : `Release ${merchant.name}?`,
                  body: frozen
                    ? 'This merchant will be unable to place or receive orders until released.'
                    : 'This merchant will be able to order again immediately.',
                  run: () => api.freezeMerchant(merchant.id, frozen),
                })}
              />
            ))}
            {tab === 'products' && filtered.products.map((product: any) => (
              <Row
                key={product.id}
                name={product.name}
                secondary={product.region}
                frozen={product.status !== 'ACTIVE'}
                status={product.status}
                pending={act.isPending}
                onToggle={(frozen) => setConfirm({
                  title: frozen ? `Freeze ${product.name}?` : `Release ${product.name}?`,
                  body: frozen
                    ? 'No order for this product will be fulfilled until released.'
                    : 'This product can be ordered again immediately.',
                  run: () => api.freezeProduct(product.id, frozen),
                })}
              />
            ))}
            {tab === 'keys' && filtered.keys.map((key: any) => (
              <Row
                key={key.id}
                name={key.prefix}
                mono
                secondary={key.merchant?.name || '—'}
                frozen={key.status !== 'ACTIVE'}
                status={key.status}
                pending={act.isPending}
                onToggle={(frozen) => setConfirm({
                  title: frozen ? 'Disable this API key?' : 'Re-enable this API key?',
                  body: frozen
                    ? 'Requests signed with this key will be rejected immediately.'
                    : 'This key will be accepted again immediately.',
                  run: () => api.disableApiKey(key.id, frozen),
                })}
              />
            ))}
            {!isLoading && filtered[tab].length === 0 && (
              <tr>
                <Td colSpan={4} className="py-12 text-center text-muted-foreground">Nothing found.</Td>
              </tr>
            )}
          </tbody>
        </Table>
      </Card>

      <Modal open={!!confirm} onClose={() => setConfirm(null)} title={confirm?.title || ''}>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{confirm?.body}</p>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setConfirm(null)}>Cancel</Button>
            <Button
              variant="destructive"
              className="flex-1"
              disabled={act.isPending}
              onClick={() => confirm && act.mutate(confirm.run)}
            >
              {act.isPending ? 'Working...' : 'Confirm'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function Count({ label, frozen, total }: { label: string; frozen?: number; total?: number }) {
  return (
    <Card>
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${frozen ? 'text-destructive' : ''}`}>
        {frozen ?? 0}
        <span className="ml-1 text-sm font-normal text-muted-foreground">of {total ?? 0}</span>
      </p>
    </Card>
  );
}

function Row({
  name, secondary, frozen, status, pending, onToggle, mono,
}: {
  name: string; secondary: string; frozen: boolean; status: string;
  pending: boolean; onToggle: (frozen: boolean) => void; mono?: boolean;
}) {
  return (
    <tr className="hover:bg-muted/30">
      <Td className={mono ? 'font-mono text-xs' : 'font-medium'}>{name}</Td>
      <Td className="text-muted-foreground">{secondary}</Td>
      <Td>
        <Badge className={frozen ? 'bg-destructive/10 text-destructive' : 'bg-emerald-500/10 text-emerald-400'}>
          {status}
        </Badge>
      </Td>
      <Td className="text-right">
        <Button
          size="sm"
          variant={frozen ? 'secondary' : 'outline'}
          disabled={pending}
          onClick={() => onToggle(!frozen)}
        >
          {frozen ? 'Release' : 'Freeze'}
        </Button>
      </Td>
    </tr>
  );
}
