import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, Button, Input, Select, Modal, Table, Th, Td, Badge } from '@/components/ui';
import { formatDate, statusColor } from '@/lib/utils';

export function StaffPage() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ email: '', name: '', password: '', role: 'SUPPORT' });

  const { data: staff, isLoading } = useQuery({ queryKey: ['staff'], queryFn: api.listStaff });

  const createMutation = useMutation({
    mutationFn: () => api.createStaff(form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff'] });
      setShowCreate(false);
      setForm({ email: '', name: '', password: '', role: 'SUPPORT' });
    },
  });

  if (isLoading) {
    return <div className="flex h-full items-center justify-center text-muted-foreground">Loading staff...</div>;
  }

  return (
    <div className="space-y-6 animate-slide-up">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Staff Management</h1>
          <p className="text-sm text-muted-foreground">Manage admin users and roles</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="mr-2 h-4 w-4" /> Add Staff
        </Button>
      </div>

      <Card className="p-0">
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Email</Th>
              <Th>Role</Th>
              <Th>Active</Th>
              <Th>Last Login</Th>
              <Th>Created</Th>
            </tr>
          </thead>
          <tbody>
            {staff?.map((s: any) => (
              <tr key={s.id} className="hover:bg-muted/30">
                <Td className="font-medium">{s.name}</Td>
                <Td className="text-muted-foreground">{s.email}</Td>
                <Td><Badge className={statusColor(s.role)}>{s.role.replace('_', ' ')}</Badge></Td>
                <Td>
                  <div className="flex items-center gap-2">
                    <div className={`h-2 w-2 rounded-full ${s.isActive ? 'bg-emerald-500' : 'bg-red-500'}`} />
                    <span className="text-xs text-muted-foreground">{s.isActive ? 'Active' : 'Inactive'}</span>
                  </div>
                </Td>
                <Td className="text-muted-foreground">{formatDate(s.lastLoginAt)}</Td>
                <Td className="text-muted-foreground">{formatDate(s.createdAt)}</Td>
              </tr>
            ))}
            {(!staff || staff.length === 0) && (
              <tr>
                <Td colSpan={6} className="py-12 text-center text-muted-foreground">
                  No staff members yet.
                </Td>
              </tr>
            )}
          </tbody>
        </Table>
      </Card>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Add Staff Member">
        <div className="space-y-4">
          <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Input label="Password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <Select
            label="Role"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
            options={[
              { value: 'SUPER_ADMIN', label: 'Super Admin' },
              { value: 'INVENTORY_MANAGER', label: 'Inventory Manager' },
              { value: 'FINANCE', label: 'Finance' },
              { value: 'SUPPORT', label: 'Support' },
            ]}
          />
          {createMutation.isError && <p className="text-sm text-destructive">{(createMutation.error as Error).message}</p>}
          <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending} className="w-full">
            {createMutation.isPending ? 'Creating...' : 'Create'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
