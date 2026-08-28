import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Plus, DollarSign } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, Button, Input, Modal, Table, Th, Td, Badge, AddressWithMapsLink } from '@/components/ui';
import { formatCurrency, formatDate, statusColor } from '@/lib/utils';

export function MerchantsPage() {
  const { data: merchants, isLoading } = useQuery({ queryKey: ['merchants'], queryFn: api.listMerchants });
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [creditMerchant, setCreditMerchant] = useState<any>(null);
  const [creditAmount, setCreditAmount] = useState('');
  const [form, setForm] = useState({ name: '', email: '', password: '', initialBalance: '' });

  const createMutation = useMutation({
    mutationFn: () =>
      api.createMerchant({
        name: form.name,
        email: form.email,
        password: form.password,
        initialBalance: parseFloat(form.initialBalance) || 0,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['merchants'] });
      setShowCreate(false);
      setForm({ name: '', email: '', password: '', initialBalance: '' });
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.updateMerchantStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['merchants'] }),
  });

  const creditMutation = useMutation({
    mutationFn: ({ id, amount }: { id: string; amount: number }) => api.creditWallet(id, amount),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['merchants'] });
      setCreditMerchant(null);
      setCreditAmount('');
    },
  });

  if (isLoading) {
    return <div className="flex h-full items-center justify-center text-muted-foreground">Loading merchants...</div>;
  }

  return (
    <div className="space-y-6 animate-slide-up">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Merchants</h1>
          <p className="text-sm text-muted-foreground">Manage merchant accounts and wallets</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="mr-2 h-4 w-4" /> Add Merchant
        </Button>
      </div>

      <Card className="p-0">
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Email</Th>
              <Th>Address</Th>
              <Th>Balance</Th>
              <Th>Status</Th>
              <Th>Created</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {merchants?.map((m: any) => (
              <tr key={m.id} className="group hover:bg-muted/30">
                <Td className="font-medium">{m.name}</Td>
                <Td className="text-muted-foreground">{m.email}</Td>
                <Td><AddressWithMapsLink address={m.address} /></Td>
                <Td className="font-medium">{formatCurrency(m.walletBalance)} <span className="text-xs text-muted-foreground">{m.currency || 'USD'}</span></Td>
                <Td><Badge className={statusColor(m.status)}>{m.status}</Badge></Td>
                <Td className="text-muted-foreground">{formatDate(m.createdAt)}</Td>
                <Td className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setCreditMerchant(m)}>
                      <DollarSign className="h-4 w-4" />
                    </Button>
                    {m.status === 'ACTIVE' ? (
                      <Button variant="outline" size="sm" onClick={() => statusMutation.mutate({ id: m.id, status: 'SUSPENDED' })}>
                        Suspend
                      </Button>
                    ) : (
                      <Button variant="secondary" size="sm" onClick={() => statusMutation.mutate({ id: m.id, status: 'ACTIVE' })}>
                        Activate
                      </Button>
                    )}
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Merchant">
        <div className="space-y-4">
          <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Input label="Password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <Input label="Initial Balance ($)" type="number" value={form.initialBalance} onChange={(e) => setForm({ ...form, initialBalance: e.target.value })} />
          {createMutation.isError && <p className="text-sm text-destructive">{(createMutation.error as Error).message}</p>}
          <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending} className="w-full">
            {createMutation.isPending ? 'Creating...' : 'Create'}
          </Button>
        </div>
      </Modal>

      <Modal open={!!creditMerchant} onClose={() => setCreditMerchant(null)} title={`Credit Wallet — ${creditMerchant?.name}`}>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Current balance: {formatCurrency(creditMerchant?.walletBalance)}</p>
          <Input label="Amount ($)" type="number" value={creditAmount} onChange={(e) => setCreditAmount(e.target.value)} />
          <Button
            onClick={() => creditMutation.mutate({ id: creditMerchant.id, amount: parseFloat(creditAmount) })}
            disabled={creditMutation.isPending || !creditAmount}
            className="w-full"
          >
            {creditMutation.isPending ? 'Processing...' : 'Credit Wallet'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
