import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useMemo } from 'react';
import { Eye, Ban, RefreshCw, Search, ShieldAlert, Copy, Check } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, Button, Select, Table, Th, Td, Badge, Modal } from '@/components/ui';
import { formatDate, statusColor } from '@/lib/utils';

export function InventoryPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [revealItem, setRevealItem] = useState<any>(null);
  const [revealedCode, setRevealedCode] = useState('');
  const [copied, setCopied] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['codes', statusFilter],
    queryFn: () => api.listCodes(statusFilter ? { status: statusFilter } : undefined),
  });

  const revealMutation = useMutation({
    mutationFn: (id: string) => api.revealCode(id),
    onSuccess: (data) => {
      setRevealedCode(data.code);
      queryClient.invalidateQueries({ queryKey: ['codes'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-stats'] });
    },
    onError: () => {
      setRevealedCode('');
    },
  });

  const voidMutation = useMutation({
    mutationFn: (id: string) => api.voidCode(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['codes'] }),
  });

  const filteredItems = useMemo(() => {
    if (!data?.items) return [];
    if (!search.trim()) return data.items;
    const q = search.toLowerCase();
    return data.items.filter(
      (item: any) =>
        item.denomination.product.toLowerCase().includes(q) ||
        item.denomination.region.toLowerCase().includes(q) ||
        item.batch_id?.toLowerCase().includes(q) ||
        item.status.toLowerCase().includes(q),
    );
  }, [data?.items, search]);

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

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <RefreshCw className="mr-2 h-5 w-5 animate-spin" /> Loading inventory...
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Inventory</h1>
          <p className="text-sm text-muted-foreground">View, reveal, and manage encrypted code items</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge className="bg-primary/10 text-primary">{data?.total || 0} codes</Badge>
        </div>
      </div>

      {/* Filters */}
      <Card className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search product, region, batch, status..."
            className="w-full rounded-lg border border-input bg-background py-2.5 pl-10 pr-3 text-sm outline-none transition-all placeholder:text-muted-foreground/50 focus:border-primary focus:ring-1 focus:ring-primary/30"
          />
        </div>
        <div className="w-full sm:w-48">
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={[
              { value: '', label: 'All Statuses' },
              { value: 'AVAILABLE', label: 'Available' },
              { value: 'RESERVED', label: 'Reserved' },
              { value: 'ALLOCATED', label: 'Allocated' },
              { value: 'DELIVERED', label: 'Delivered' },
              { value: 'VOID', label: 'Void' },
            ]}
          />
        </div>
      </Card>

      {/* Table */}
      <Card className="p-0">
        <Table>
          <thead>
            <tr>
              <Th>Product</Th>
              <Th>Denomination</Th>
              <Th>Status</Th>
              <Th>Batch</Th>
              <Th>Created</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.map((item: any) => (
              <tr key={item.id} className="group hover:bg-muted/30">
                <Td>
                  <div className="font-medium">{item.denomination.product}</div>
                  <div className="text-xs text-muted-foreground">{item.denomination.region}</div>
                </Td>
                <Td className="font-medium">${item.denomination.face_value}</Td>
                <Td>
                  <Badge className={statusColor(item.status)}>{item.status}</Badge>
                </Td>
                <Td className="font-mono text-xs text-muted-foreground">{item.batch_id?.slice(0, 12)}...</Td>
                <Td className="text-muted-foreground">{formatDate(item.created_at)}</Td>
                <Td className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleReveal(item)}
                      disabled={item.status === 'DELIVERED' || item.status === 'VOID'}
                      title="Reveal code"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    {item.status === 'AVAILABLE' && (
                      <Button variant="ghost" size="sm" onClick={() => voidMutation.mutate(item.id)} title="Void code">
                        <Ban className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </Td>
              </tr>
            ))}
            {filteredItems.length === 0 && (
              <tr>
                <Td colSpan={6} className="py-12 text-center text-muted-foreground">
                  No code items found matching your filters.
                </Td>
              </tr>
            )}
          </tbody>
        </Table>
      </Card>

      {/* Reveal modal */}
      <Modal open={!!revealItem} onClose={handleClose} title="Reveal Code" size="md">
        {revealMutation.isPending ? (
          <div className="flex flex-col items-center gap-3 py-8 text-muted-foreground">
            <RefreshCw className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm">Decrypting AES-256-GCM ciphertext...</p>
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
                <Button variant="outline" size="sm" onClick={handleCopy}>
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
            <Button onClick={handleClose} className="w-full">
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
    </div>
  );
}
