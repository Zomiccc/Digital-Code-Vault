import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, Button, Input, Select, Modal, Table, Th, Td, Badge } from '@/components/ui';
import { statusColor } from '@/lib/utils';

export function ProductsPage() {
  const { data: products, isLoading } = useQuery({ queryKey: ['products'], queryFn: api.listProducts });
  const { data: suppliers } = useQuery({ queryKey: ['suppliers'], queryFn: api.listSuppliers });
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [showDenom, setShowDenom] = useState<any>(null);
  const [form, setForm] = useState({ name: '', region: '', supplierId: '' });
  const [denomValue, setDenomValue] = useState('');

  const createMutation = useMutation({
    mutationFn: () => api.createProduct({ name: form.name, region: form.region, supplierId: form.supplierId || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setShowCreate(false);
      setForm({ name: '', region: '', supplierId: '' });
    },
  });

  const denomMutation = useMutation({
    mutationFn: () => api.createDenomination(showDenom.id, parseFloat(denomValue)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      setShowDenom(null);
      setDenomValue('');
    },
  });

  if (isLoading) {
    return <div className="flex h-full items-center justify-center text-muted-foreground">Loading products...</div>;
  }

  return (
    <div className="space-y-6 animate-slide-up">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Products</h1>
          <p className="text-sm text-muted-foreground">Manage products and denominations</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="mr-2 h-4 w-4" /> Add Product
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {products?.map((p: any) => (
          <Card key={p.id} hover>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold tracking-tight">{p.name}</h3>
                <p className="text-sm text-muted-foreground">{p.region}</p>
                <Badge className={`mt-3 ${statusColor(p.status)}`}>{p.status}</Badge>
              </div>
              <Button variant="outline" size="sm" onClick={() => setShowDenom(p)}>Add Denom</Button>
            </div>
            {p.denominations && p.denominations.length > 0 && (
              <div className="mt-5 flex flex-wrap gap-2">
                {p.denominations.map((d: any) => (
                  <Badge key={d.id} className="bg-secondary text-secondary-foreground">
                    ${d.faceValue}
                  </Badge>
                ))}
              </div>
            )}
            {(!p.denominations || p.denominations.length === 0) && (
              <p className="mt-5 text-xs text-muted-foreground">No denominations configured</p>
            )}
          </Card>
        ))}
      </div>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Product">
        <div className="space-y-4">
          <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. PSN" />
          <Input label="Region" value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} placeholder="e.g. USA" />
          <Select
            label="Supplier"
            value={form.supplierId}
            onChange={(e) => setForm({ ...form, supplierId: e.target.value })}
            options={[
              { value: '', label: '— None —' },
              ...(suppliers?.map((s: any) => ({ value: s.id, label: s.name })) || []),
            ]}
          />
          <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending} className="w-full">
            {createMutation.isPending ? 'Creating...' : 'Create'}
          </Button>
        </div>
      </Modal>

      <Modal open={!!showDenom} onClose={() => setShowDenom(null)} title={`Add Denomination — ${showDenom?.name}`}>
        <div className="space-y-4">
          <Input label="Face Value ($)" type="number" value={denomValue} onChange={(e) => setDenomValue(e.target.value)} />
          <Button onClick={() => denomMutation.mutate()} disabled={denomMutation.isPending || !denomValue} className="w-full">
            {denomMutation.isPending ? 'Adding...' : 'Add'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
