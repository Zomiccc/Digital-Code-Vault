import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MessagesSquare, Send, ImageIcon, UserRound, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { Card, Badge, Button, Input } from '@/components/ui';
import { formatDate } from '@/lib/utils';

export function SupportInboxPage() {
  const queryClient = useQueryClient();
  const [activeMerchantId, setActiveMerchantId] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [search, setSearch] = useState('');

  const { data: threads, isLoading: threadsLoading } = useQuery({
    queryKey: ['support-threads'],
    queryFn: api.listSupportThreads,
    refetchInterval: 8000,
  });

  const { data: threadData, isLoading: threadLoading } = useQuery({
    queryKey: ['support-thread', activeMerchantId],
    queryFn: () => api.getSupportThreadByMerchant(activeMerchantId!),
    enabled: !!activeMerchantId,
    refetchInterval: 5000,
  });

  // keep funding approvals fresh when viewing a thread (admin may approve from Finance)
  const replyMutation = useMutation({
    mutationFn: () => api.replySupportThread(activeMerchantId!, reply),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['support-thread', activeMerchantId] });
      queryClient.invalidateQueries({ queryKey: ['support-threads'] });
      setReply('');
    },
  });

  const filtered = (threads || []).filter(
    (t: any) =>
      !search ||
      t.merchantName?.toLowerCase().includes(search.toLowerCase()) ||
      t.merchantEmail?.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-6 animate-slide-up">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Support Inbox</h1>
        <p className="text-sm text-muted-foreground">
          Merchant help requests and payment-proof submissions. Verify the proof, then approve funds under Finance → Funding Requests.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        {/* Thread list */}
        <Card className="p-0 overflow-hidden">
          <div className="border-b border-border p-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search merchants..."
                className="w-full rounded-lg border border-input bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
              />
            </div>
          </div>
          <div className="max-h-[70vh] overflow-y-auto">
            {threadsLoading ? (
              <p className="p-4 text-sm text-muted-foreground">Loading...</p>
            ) : filtered.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No merchant conversations yet.</p>
            ) : (
              filtered.map((t: any) => (
                <button
                  key={t.merchantId}
                  onClick={() => setActiveMerchantId(t.merchantId)}
                  className={`flex w-full items-start gap-3 border-b border-border p-3 text-left transition-colors hover:bg-muted/40 ${
                    activeMerchantId === t.merchantId ? 'bg-primary/5' : ''
                  }`}
                >
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary">
                    <UserRound className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium">{t.merchantName}</p>
                      {t.unreadCount > 0 && (
                        <Badge className="shrink-0 bg-red-100 text-red-700">{t.unreadCount}</Badge>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {t.lastMessage
                        ? `${t.lastMessage.senderRole === 'ADMIN' ? 'You: ' : ''}${
                            t.lastMessage.body || (t.lastMessage.hasImage ? '[image]' : '')
                          }`
                        : t.merchantEmail}
                    </p>
                    {t.lastMessage?.hasImage && (
                      <span className="mt-1 inline-flex items-center gap-1 text-[11px] text-sky-500">
                        <ImageIcon className="h-3 w-3" /> payment proof attached
                      </span>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </Card>

        {/* Conversation */}
        <Card className="flex flex-col p-0">
          {!activeMerchantId ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <MessagesSquare className="mb-3 h-10 w-10 text-muted-foreground/50" />
              <p className="text-muted-foreground">Select a conversation to view messages.</p>
            </div>
          ) : threadLoading ? (
            <p className="p-4 text-sm text-muted-foreground">Loading thread...</p>
          ) : (
            <>
              <div className="flex items-center justify-between border-b border-border p-4">
                <div>
                  <p className="font-semibold">{threadData?.merchant?.name}</p>
                  <p className="text-xs text-muted-foreground">{threadData?.merchant?.email}</p>
                </div>
                <Badge className="bg-emerald-100 text-emerald-700">
                  Balance ${Number(threadData?.merchant?.walletBalance || 0).toFixed(2)}
                </Badge>
              </div>

              <div className="max-h-[60vh] min-h-[320px] space-y-3 overflow-y-auto p-4">
                {(threadData?.messages || []).map((m: any) => (
                  <div key={m.id} className={`flex ${m.senderRole === 'ADMIN' ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${
                        m.senderRole === 'ADMIN'
                          ? 'rounded-br-sm bg-primary text-primary-foreground'
                          : 'rounded-bl-sm bg-muted'
                      }`}
                    >
                      {m.body && <p className="whitespace-pre-wrap">{m.body}</p>}
                      {m.image && (
                        <a href={m.image} target="_blank" rel="noreferrer" className="block">
                          <img src={m.image} alt="attachment" className="mt-2 max-h-48 rounded-lg border border-border/50 object-contain" />
                          <p className={`mt-1 text-[11px] ${m.senderRole === 'ADMIN' ? 'text-primary-foreground/80' : 'text-primary'}`}>
                            Open full size ↗
                          </p>
                        </a>
                      )}
                      <p className={`mt-1 text-[10px] ${m.senderRole === 'ADMIN' ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
                        {formatDate(m.createdAt)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-2 border-t border-border p-3">
                <input
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && reply.trim()) replyMutation.mutate();
                  }}
                  placeholder="Reply to merchant..."
                  className="min-w-0 flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
                />
                <Button onClick={() => replyMutation.mutate()} disabled={!reply.trim() || replyMutation.isPending}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
