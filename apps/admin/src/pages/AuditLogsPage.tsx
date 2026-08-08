import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, Table, Th, Td } from '@/components/ui';
import { formatDate } from '@/lib/utils';

export function AuditLogsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs'],
    queryFn: () => api.getAuditLogs(100, 0),
  });

  if (isLoading) {
    return <div className="flex h-full items-center justify-center text-muted-foreground">Loading audit logs...</div>;
  }

  return (
    <div className="space-y-6 animate-slide-up">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Audit Logs</h1>
        <p className="text-sm text-muted-foreground">Immutable record of all platform actions</p>
      </div>

      <Card className="p-0">
        <Table>
          <thead>
            <tr>
              <Th>Time</Th>
              <Th>Actor</Th>
              <Th>Action</Th>
              <Th>Entity</Th>
              <Th>IP</Th>
              <Th>Metadata</Th>
            </tr>
          </thead>
          <tbody>
            {Array.isArray(data) && data.map((log: any) => (
              <tr key={log.id} className="hover:bg-muted/30">
                <Td className="text-xs text-muted-foreground">{formatDate(log.createdAt)}</Td>
                <Td className="text-xs font-medium">{log.actorType}</Td>
                <Td className="font-mono text-xs text-primary">{log.action}</Td>
                <Td className="text-xs text-muted-foreground">{log.entity}</Td>
                <Td className="font-mono text-xs text-muted-foreground">{log.ip || '—'}</Td>
                <Td className="font-mono text-xs max-w-xs truncate text-muted-foreground">{JSON.stringify(log.metadata)}</Td>
              </tr>
            ))}
            {(!Array.isArray(data) || data.length === 0) && (
              <tr>
                <Td colSpan={6} className="py-12 text-center text-muted-foreground">
                  No audit logs yet.
                </Td>
              </tr>
            )}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
