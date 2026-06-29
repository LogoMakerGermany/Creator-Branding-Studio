import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { PageHeader, Badge, Button, Input } from '@/components/ui';
import { Bot, Send, Trash2, Sparkles } from 'lucide-react';
import { api, ApiError, type ChatMessage } from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';

export function AIAssistantPage() {
  const { activeDna } = useAuth();
  const location = useLocation();
  const initialPrompt = (location.state as { initialPrompt?: string } | null)?.initialPrompt;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState(initialPrompt ?? '');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.assistant.getSession().then((r) => setMessages(r.session.messages));
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading) return;
    const msg = input.trim();
    setInput('');
    setLoading(true);
    try {
      const res = await api.assistant.chat(msg);
      setMessages(res.session.messages);
    } catch (err) {
      setMessages((prev) => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: err instanceof ApiError ? err.message : 'Fehler beim Senden',
        createdAt: new Date().toISOString(),
      }]);
    } finally {
      setLoading(false);
    }
  }

  async function handleClear() {
    await api.assistant.clearSession();
    const res = await api.assistant.getSession();
    setMessages(res.session.messages);
  }

  const suggestions = [
    'Wie verbessere ich mein Stream-Branding?',
    'Welche Banner-Größe für Twitch?',
    'Content-Strategie für TikTok',
    'Logo-Tipps für Gaming',
  ];

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col">
      <PageHeader
        title="KI Creator Assistent"
        description="Persönlicher Assistent für Branding, Strategie und Design-Beratung"
        badge={<Badge variant="brand">UCBS</Badge>}
        actions={
          <Button variant="ghost" size="sm" onClick={handleClear}>
            <Trash2 className="h-4 w-4" /> Chat leeren
          </Button>
        }
      />

      {activeDna && (
        <div className="ucbs-neon-card ucbs-neon-card-cyan mb-4 flex items-center gap-2 px-3 py-2 text-sm text-cyan-200">
          <Sparkles className="h-4 w-4" />
          DNA aktiv: {activeDna.name} ({activeDna.styleDirection})
        </div>
      )}

      <div className="ucbs-neon-card flex flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}
            >
              <div
                className={cn(
                  'max-w-[80%] rounded-2xl px-4 py-2.5 text-sm',
                  msg.role === 'user'
                    ? 'bg-brand-600 text-white'
                    : 'border border-zinc-700 bg-surface-900 text-zinc-200'
                )}
              >
                {msg.role === 'assistant' && (
                  <Bot className="mb-1 h-4 w-4 text-brand-400" />
                )}
                <p className="whitespace-pre-wrap">{msg.content}</p>
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="rounded-2xl border border-zinc-700 bg-surface-900 px-4 py-3">
                <div className="flex gap-1">
                  <span className="h-2 w-2 animate-bounce rounded-full bg-brand-400" style={{ animationDelay: '0ms' }} />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-brand-400" style={{ animationDelay: '150ms' }} />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-brand-400" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="border-t border-zinc-800 p-3">
          <div className="mb-2 flex flex-wrap gap-1">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setInput(s)}
                className="rounded-full border border-zinc-700 px-2.5 py-1 text-xs text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
              >
                {s}
              </button>
            ))}
          </div>
          <form onSubmit={handleSend} className="flex gap-2">
            <Input
              placeholder="Frag mich zu Branding, Strategie, Design..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="flex-1"
            />
            <Button type="submit" disabled={loading || !input.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
