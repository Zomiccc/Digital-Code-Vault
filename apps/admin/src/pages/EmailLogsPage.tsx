import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, Badge, Table, Th, Td } from '@/components/ui';
import { statusColor, formatDate } from '@/lib/utils';

export function EmailLogsPage() {
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [recipientFilter, setRecipientFilter] = useState<string>('');

  const { data, isLoading } = useQuery({
    queryKey: ['email-logs', statusFilter, recipientFilter],
    queryFn: () => api.adminListEmailLogs({
      limit: 100,
      status: statusFilter || undefined,
      recipient: recipientFilter || undefined,
    }),
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Email Logs</h1>
        <p className="text-sm text-muted-foreground">All outgoing emails and their delivery status</p>
      </div>

      <div className="flex gap-4 items-end">
        <div>
          <label className="text-sm font-medium mb-1 block">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border rounded px-3 py-2 bg-background text-sm"
          >
            <option value="">All</option>
            <option value="SENT">Sent</option>
            <option value="FAILED">Failed</option>
            <option value="PENDING">Pending</option>
          </select>
        </div>
        <div className="flex-1">
          <label className="text-sm font-medium mb-1 block">Recipient</label>
          <input
            value={recipientFilter}
            onChange={(e) => setRecipientFilter(e.target.value)}
            placeholder="Filter by email..."
            className="border rounded px-3 py-2 bg-background text-sm w-full"
          />
        </div>
      </div>

      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Recipient</Th>
              <Th>Subject</Th>
              <Th>Template</Th>
              <Th>Status</Th>
              <Th>Error</Th>
              <Th>Date</Th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><Td colSpan={6}>Loading...</Td></tr>
            ) : data?.items?.length === 0 ? (
              <tr><Td colSpan={6} className="text-muted-foreground">No email logs found</Td></tr>
            ) : (
              data?.items?.map((e: any) => (
                <tr key={e.id}>
                  <Td className="font-mono text-xs">{e.recipient}</Td>
                  <Td className="text-sm">{e.subject}</Td>
                  <Td className="text-xs text-muted-foreground">{e.template || '—'}</Td>
                  <Td><Badge className={statusColor(e.status)}>{e.status}</Badge></Td>
                  <Td className="text-xs text-red-400/80 max-w-xs">{e.errorMessage || '—'}</Td>
                  <Td className="text-xs">{formatDate(e.createdAt)}</Td>
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </Card>

      {data?.total != null && (
        <p className="text-sm text-muted-foreground">{data.total} total email log(s)</p>
      )}
    </div>
  );
}
