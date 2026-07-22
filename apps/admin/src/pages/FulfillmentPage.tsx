import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, Button, Table, Th, Td, Badge, Modal } from '@/components/ui';
import { formatCurrency, formatDate, statusColor } from '@/lib/utils';

export function FulfillmentPage() {
  const queryClient = useQueryClient();
  const [reverseItem, setReverseItem] = useState<any>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['fulfillment'],
    queryFn: () => api.listFulfillment(50, 0),
  });

  const reverseMutation = useMutation({
    mutationFn: (id: string) => api.reverseFulfillment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fulfillment'] });
      setReverseItem(null);
    },
  });

  if (isLoading) {
    return <div className="flex h-full items-center justify-center text-muted-foreground">Loading fulfillment...</div>;
  }

  return (
    <div className="space-y-6 animate-slide-up">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Fulfillment Requests</h1>
        <p className="text-sm text-muted-foreground">Monitor and manage all fulfillment requests</p>
      </div>

      <Card className="p-0">
        <Table>
          <thead>
            <tr>
              <Th>ID</Th>
              <Th>Merchant</Th>
              <Th>Product</Th>
              <Th>Amount</Th>
              <Th>Status</Th>
              <Th>Created</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {data?.items?.map((req: any) => (
              <tr key={req.id} className="group hover:bg-muted/30">
                <Td className="font-mono text-xs text-muted-foreground">{req.id.slice(0, 12)}</Td>
                <Td className="font-medium">{req.merchant?.name}</Td>
                <Td className="text-muted-foreground">{req.product?.name}</Td>
                <Td className="font-medium">{formatCurrency(req.amount)}</Td>
                <Td><Badge className={statusColor(req.status)}>{req.status}</Badge></Td>
                <Td className="text-muted-foreground">{formatDate(req.createdAt)}</Td>
                <Td className="text-right">
                  {(req.status === 'ALLOCATED' || req.status === 'PENDING') && (
                    <Button variant="outline" size="sm" onClick={() => setReverseItem(req)}>
                      <RotateCcw className="mr-1 h-3 w-3" /> Reverse
                    </Button>
                  )}
                </Td>
              </tr>
            ))}
            {(!data?.items || data.items.length === 0) && (
              <tr>
                <Td colSpan={7} className="py-12 text-center text-muted-foreground">
                  No fulfillment requests yet.
                </Td>
              </tr>
            )}
          </tbody>
        </Table>
      </Card>

      <Modal open={!!reverseItem} onClose={() => setReverseItem(null)} title="Reverse Fulfillment">
        <div className="space-y-4">
          <p className="text-sm">
            Are you sure you want to reverse fulfillment <span className="font-mono">{reverseItem?.id?.slice(0, 16)}</span>?
          </p>
          <p className="text-sm text-muted-foreground">
            This will release allocated codes back to inventory and refund {formatCurrency(reverseItem?.amount)} to the merchant wallet.
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setReverseItem(null)} className="flex-1">Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => reverseMutation.mutate(reverseItem.id)}
              disabled={reverseMutation.isPending}
              className="flex-1"
            >
              {reverseMutation.isPending ? 'Reversing...' : 'Confirm Reverse'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
