import { useQuery } from '@tanstack/react-query';
import {
  Users, Package, Database, FileText, TrendingUp, AlertCircle,
  ShieldCheck, Zap, Lock,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Card, StatCard, Badge } from '@/components/ui';
import { statusColor } from '@/lib/utils';

export function DashboardPage() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['stats'],
    queryFn: api.getStats,
  });
  const { data: inventory } = useQuery({
    queryKey: ['inventory-stats'],
    queryFn: api.getInventoryStats,
  });

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Zap className="h-5 w-5 animate-pulse" />
          Loading dashboard...
        </div>
      </div>
    );
  }

  const totalCodes = stats?.codes?.total || 0;
  const inventoryEntries = inventory ? Object.entries(inventory) : [];

  return (
    <div className="space-y-8 animate-slide-up">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Real-time platform overview and security posture</p>
      </div>

      {/* Trust badges */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-xs font-medium text-muted-foreground">
          <Lock className="h-3.5 w-3.5 text-primary" />
          AES-256-GCM Encrypted
        </div>
        <div className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-xs font-medium text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
          Argon2 Hashed Keys
        </div>
        <div className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-xs font-medium text-muted-foreground">
          <FileText className="h-3.5 w-3.5 text-blue-400" />
          Full Audit Trail
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Merchants" value={stats?.merchants?.total || 0} icon={Users} trend="Platform partners" />
        <StatCard label="Active Merchants" value={stats?.merchants?.active || 0} icon={Users} color="text-emerald-400" trend="Live trading" />
        <StatCard label="Products" value={stats?.products || 0} icon={Package} trend="Active catalogs" />
        <StatCard label="Total Codes" value={totalCodes} icon={Database} color="text-blue-400" trend="Encrypted at rest" />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Pending Fulfillment" value={stats?.fulfillment?.pending || 0} icon={FileText} color="text-amber-400" />
        <StatCard label="Allocated" value={stats?.fulfillment?.allocated || 0} icon={TrendingUp} color="text-blue-400" />
        <StatCard label="Delivered" value={stats?.fulfillment?.delivered || 0} icon={FileText} color="text-purple-400" />
      </div>

      {/* Inventory breakdown */}
      <Card>
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Inventory by Status</h2>
            <p className="text-sm text-muted-foreground">Code lifecycle distribution across the platform</p>
          </div>
          <Badge className="bg-primary/10 text-primary">{totalCodes} total</Badge>
        </div>

        {inventoryEntries.length > 0 ? (
          <div className="space-y-5">
            {inventoryEntries.map(([status, count]) => {
              const pct = totalCodes > 0 ? Math.round(((count as number) / totalCodes) * 100) : 0;
              return (
                <div key={status} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <Badge className={statusColor(status)}>{status}</Badge>
                    <div className="flex items-center gap-3">
                      <span className="font-semibold">{count as number}</span>
                      <span className="text-xs text-muted-foreground w-8 text-right">{pct}%</span>
                    </div>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-700"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-lg border border-dashed border-border p-6 text-muted-foreground">
            <AlertCircle className="h-5 w-5" />
            No inventory data available
          </div>
        )}
      </Card>
    </div>
  );
}
