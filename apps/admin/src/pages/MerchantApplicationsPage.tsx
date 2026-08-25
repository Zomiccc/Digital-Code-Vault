import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, Button, Badge } from '@/components/ui';
import { Store, Check, X, Loader2 } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';

export function MerchantApplicationsPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<string>('PENDING');
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState('');

  const { data: applications, isLoading } = useQuery({
    queryKey: ['merchant-applications', filter],
    queryFn: () => api.listMerchantApplications(filter || undefined),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => api.approveMerchantApplication(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['merchant-applications'] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) => api.rejectMerchantApplication(id, note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['merchant-applications'] });
      setRejectingId(null);
      setRejectNote('');
    },
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Merchant Applications</h1>
        <p className="text-sm text-muted-foreground">Review and approve customer merchant applications</p>
      </div>

      <div className="flex gap-2">
        {['PENDING', 'APPROVED', 'REJECTED', ''].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              filter === s ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
            }`}
          >
            {s || 'All'}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-muted-foreground">Loading...</div>
      ) : applications && applications.length > 0 ? (
        <div className="space-y-3">
          {applications.map((app: any) => (
            <Card key={app.id}>
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Store className="h-4 w-4 text-primary" />
                    <span className="font-semibold">{app.storeName}</span>
                    <Badge className={
                      app.status === 'PENDING' ? 'bg-amber-500/10 text-amber-500' :
                      app.status === 'APPROVED' ? 'bg-emerald-500/10 text-emerald-500' :
                      'bg-destructive/10 text-destructive'
                    }>
                      {app.status}
                    </Badge>
                  </div>
                  <div className="text-sm text-muted-foreground space-y-0.5">
                    <p>Store Email: {app.storeEmail}</p>
                    <p>Customer: {app.customer?.name} ({app.customer?.email})</p>
                    <p>Currency: {app.currency}</p>
                    <p>Submitted: {formatDate(app.createdAt)}</p>
                    {app.adminNote && <p className="text-destructive">Admin Note: {app.adminNote}</p>}
                  </div>

                  {/* KYC details */}
                  {(app.firstName || app.businessNtn) && (
                    <div className="mt-4 rounded-lg border border-border bg-muted/30 p-3 text-sm">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">KYC Details</p>
                      <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
                        <p><span className="text-muted-foreground">Name:</span> {app.firstName} {app.lastName}</p>
                        <p><span className="text-muted-foreground">Phone:</span> {app.phone || '—'}</p>
                        <p><span className="text-muted-foreground">ID Type:</span> {app.idDocType || '—'}</p>
                        <p><span className="text-muted-foreground">Business NTN:</span> {app.businessNtn || '—'}</p>
                      </div>
                      {(app.idFrontImage || app.idBackImage) && (
                        <div className="mt-3 flex flex-wrap gap-3">
                          {app.idFrontImage && (
                            <a href={app.idFrontImage} target="_blank" rel="noreferrer" className="group relative">
                              <img src={app.idFrontImage} alt="ID front" className="h-24 w-36 rounded-lg border border-border object-cover transition-opacity group-hover:opacity-80" />
                              <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">Front</span>
                            </a>
                          )}
                          {app.idBackImage && (
                            <a href={app.idBackImage} target="_blank" rel="noreferrer" className="group relative">
                              <img src={app.idBackImage} alt="ID back" className="h-24 w-36 rounded-lg border border-border object-cover transition-opacity group-hover:opacity-80" />
                              <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">Back</span>
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {app.status === 'PENDING' && (
                  <div className="flex flex-col gap-2">
                    <Button
                      size="sm"
                      onClick={() => approveMutation.mutate(app.id)}
                      disabled={approveMutation.isPending}
                    >
                      {approveMutation.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Check className="mr-1 h-3 w-3" />}
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => setRejectingId(app.id)}
                    >
                      <X className="mr-1 h-3 w-3" /> Reject
                    </Button>
                  </div>
                )}
              </div>
              {rejectingId === app.id && (
                <div className="mt-4 border-t border-border pt-4 space-y-2">
                  <input
                    type="text"
                    value={rejectNote}
                    onChange={(e) => setRejectNote(e.target.value)}
                    placeholder="Rejection reason..."
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => rejectMutation.mutate({ id: app.id, note: rejectNote || 'Application rejected' })}
                      disabled={rejectMutation.isPending}
                    >
                      {rejectMutation.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                      Confirm Reject
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { setRejectingId(null); setRejectNote(''); }}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <p className="text-center text-muted-foreground py-8">No applications found</p>
        </Card>
      )}
    </div>
  );
}
