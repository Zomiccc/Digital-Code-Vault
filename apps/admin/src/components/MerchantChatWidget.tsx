import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MessageCircleQuestion, X, Send, ImageIcon } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui';
import { formatDate } from '@/lib/utils';

/**
 * Floating Help / Chat button for merchant pages.
 * Merchants can send text + payment screenshots to the admin team.
 */
export function MerchantChatWidget() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: messages } = useQuery({
    queryKey: ['support-thread'],
    queryFn: api.getSupportThread,
    refetchInterval: open ? 4000 : 15000,
  });

  const sendMutation = useMutation({
    mutationFn: () => api.sendSupportMessage({ body: text || undefined, image: image || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['support-thread'] });
      setText('');
      setImage(null);
    },
  });

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [open, messages?.length]);

  const pickFile = (file: File | undefined) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert('Image too large — under 2 MB please.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setImage(reader.result as string);
    reader.readAsDataURL(file);
  };

  const send = () => {
    if (!text.trim() && !image) return;
    sendMutation.mutate();
  };

  const unreadAdminReplies = (messages || []).filter(
    (m: any) => m.senderRole === 'ADMIN' && !m.readByMerchant,
  ).length;

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105"
        title="Help & Chat"
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircleQuestion className="h-6 w-6" />}
        {!open && unreadAdminReplies > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unreadAdminReplies}
          </span>
        )}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-24 right-6 z-50 flex h-[480px] w-[360px] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
          <div className="border-b border-border bg-primary px-4 py-3">
            <p className="font-semibold text-primary-foreground">Help & Chat</p>
            <p className="text-xs text-primary-foreground/70">Send payment proofs or questions — admin replies here</p>
          </div>

          <div ref={bottomRef} className="flex-1 space-y-3 overflow-y-auto p-3">
            {(messages || []).length === 0 && (
              <div className="py-8 text-center text-sm text-muted-foreground">
                Hi! Need to add funds or have a question?
                <br />
                Send us a message — attach your payment screenshot and we'll approve it.
              </div>
            )}
            {(messages || []).map((m: any) => (
              <div key={m.id} className={`flex ${m.senderRole === 'MERCHANT' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                    m.senderRole === 'MERCHANT'
                      ? 'rounded-br-sm bg-primary text-primary-foreground'
                      : 'rounded-bl-sm bg-muted'
                  }`}
                >
                  {m.body && <p className="whitespace-pre-wrap">{m.body}</p>}
                  {m.image && (
                    <a href={m.image} target="_blank" rel="noreferrer" className="block">
                      <img src={m.image} alt="attachment" className="mt-1 max-h-36 rounded-lg object-contain" />
                    </a>
                  )}
                  <p className={`mt-0.5 text-[10px] ${m.senderRole === 'MERCHANT' ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
                    {formatDate(m.createdAt)}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {image && (
            <div className="flex items-center gap-2 border-t border-border px-3 py-2">
              <img src={image} alt="preview" className="h-10 w-10 rounded object-cover" />
              <span className="flex-1 truncate text-xs text-muted-foreground">Attachment ready</span>
              <button className="text-xs text-red-500 hover:underline" onClick={() => setImage(null)}>Remove</button>
            </div>
          )}

          <div className="flex items-center gap-2 border-t border-border p-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => pickFile(e.target.files?.[0])}
            />
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} title="Attach screenshot">
              <ImageIcon className="h-4 w-4" />
            </Button>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') send();
              }}
              placeholder="Type a message..."
              className="min-w-0 flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary/30"
            />
            <Button size="sm" onClick={send} disabled={sendMutation.isPending || (!text.trim() && !image)}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
