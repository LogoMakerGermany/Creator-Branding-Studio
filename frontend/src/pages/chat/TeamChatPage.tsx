import { useEffect, useRef, useState } from 'react';
import { PageHeader, Badge, Button, Input } from '@/components/ui';
import { MessageSquare, Send } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { api, ApiError, type TeamChatMessage } from '@/services/api';
import { cn } from '@/lib/utils';

export function TeamChatPage() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<TeamChatMessage[]>([]);
  const [channelId, setChannelId] = useState<string>('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.chat.getSession().then((res) => {
      setMessages(res.messages);
      setChannelId(res.channel.id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.chat.send(content.trim(), channelId);
      setMessages((prev) => [...prev, res.message]);
      setContent('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Senden fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Team Chat"
        description="Interne Kommunikation für Teams und Clans"
        badge={<Badge variant="brand">UCBS</Badge>}
      />

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-red-300">{error}</div>
      )}

      <div className="ucbs-neon-card flex h-[calc(100vh-220px)] flex-col">
        <div className="flex items-center gap-2 border-b border-brand-500/20 pb-3">
          <MessageSquare className="h-5 w-5 text-cyan-400" />
          <span className="font-display font-semibold text-zinc-100">Team Chat</span>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto py-4">
          {messages.map((msg) => {
            const isOwn = msg.userId === user?.id;
            const isSystem = msg.userId === 'system';
            return (
              <div key={msg.id} className={cn('flex', isOwn ? 'justify-end' : 'justify-start')}>
                <div
                  className={cn(
                    'max-w-[75%] rounded-2xl px-3 py-2 text-sm',
                    isSystem
                      ? 'border border-brand-500/20 bg-brand-500/5 text-zinc-400'
                      : isOwn
                        ? 'bg-gradient-to-br from-brand-600 to-brand-700 text-white shadow-lg shadow-brand-500/20'
                        : 'border border-zinc-800 bg-surface-950 text-zinc-200'
                  )}
                >
                  {!isOwn && !isSystem && (
                    <p className="mb-1 text-xs font-medium text-cyan-400">{msg.userName}</p>
                  )}
                  <p>{msg.content}</p>
                  <p className="mt-1 text-[10px] opacity-60">
                    {new Date(msg.createdAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        <form onSubmit={handleSend} className="flex gap-2 border-t border-brand-500/20 pt-3">
          <Input
            placeholder="Nachricht schreiben..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="flex-1"
          />
          <Button type="submit" loading={loading} className="gap-2">
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
