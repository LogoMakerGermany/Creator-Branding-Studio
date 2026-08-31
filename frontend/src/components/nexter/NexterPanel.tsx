import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Mic, Plus, Send, Volume2 } from 'lucide-react';
import { api, ApiError, type NexterChatMessage, type NexterAction } from '@/services/api';
import { useNexterStore } from '@/v2/store/nexter-store';
import { useBrandProjectStore } from '@/v2/store/brand-project-store';
import { useAuth } from '@/context/AuthContext';
import { NexterOrb } from './NexterOrb';
import { cn, formatCoins } from '@/lib/utils';

export function NexterPanel({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  const { activeDna, refreshUser } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { orbState, setOrbState, pulse, studioHint, audioLevel, setAudioLevel, pendingPrompt, consumePendingPrompt } =
    useNexterStore();
  const activeProjectId = useBrandProjectStore((s) => s.activeProjectId);
  const [messages, setMessages] = useState<NexterChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [closedQuotes, setClosedQuotes] = useState<Set<string>>(() => new Set());
  const bottomRef = useRef<HTMLDivElement>(null);
  const audioCleanupRef = useRef<(() => void) | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const sendRef = useRef<(text: string) => Promise<void>>(async () => undefined);

  useEffect(() => {
    let cancelled = false;
    api.nexter
      .getSession()
      .then((r) => {
        if (!cancelled) setMessages(r.session.messages);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Unterhaltung konnte nicht geladen werden');
          setMessages([
            {
              id: 'offline',
              role: 'assistant',
              content: 'Nexter ist gerade nicht erreichbar. Die Navigation bleibt aktiv — kein Chat-Fallback mehr.',
              createdAt: new Date().toISOString(),
              actions: [
                { id: 'logo', tool: 'open_studio', label: 'Logo Studio', path: '/logo-studio' },
                { id: 'dna', tool: 'open_studio', label: 'Creator DNA', path: '/creator-dna' },
              ],
            },
          ]);
          pulse('warning');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(
    () => () => {
      audioCleanupRef.current?.();
      mediaRef.current?.stop();
    },
    []
  );

  async function send(text: string) {
    const msg = text.trim();
    if (!msg || loading) return;
    setInput('');
    setLoading(true);
    setError(null);
    setOrbState('thinking');
    try {
      const res = await api.nexter.chat(msg, {
        path: location.pathname,
        hint: studioHint ?? undefined,
        projectId: activeProjectId ?? undefined,
      });
      setMessages(res.session.messages);
      const last = res.session.messages[res.session.messages.length - 1];
      const awaitingConfirm = last?.actions?.some((a) => a.tool === 'start_generation' && a.requiresConfirmation);
      const open = last?.actions?.find((a) => a.tool === 'open_studio' && a.path);
      if (open?.path && !awaitingConfirm && open.path !== location.pathname) {
        navigate(open.path);
      }
      pulse(awaitingConfirm ? 'warning' : 'success');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Nexter ist gerade nicht erreichbar');
      pulse('warning');
    } finally {
      setLoading(false);
    }
  }
  sendRef.current = send;

  useEffect(() => {
    if (!pendingPrompt) return;
    const text = pendingPrompt;
    consumePendingPrompt();
    void sendRef.current(text);
  }, [pendingPrompt, consumePendingPrompt]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void send(input);
  }

  async function speakLast() {
    const last = [...messages].reverse().find((m) => m.role === 'assistant');
    if (!last) return;
    audioCleanupRef.current?.();
    try {
      setOrbState('listening');
      const res = await api.nexter.speak(last.content);
      const audio = new Audio(res.audioUrl);
      const ctx = new AudioContext();
      const source = ctx.createMediaElementSource(audio);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyser.connect(ctx.destination);
      const data = new Uint8Array(analyser.frequencyBinCount);
      let raf = 0;
      const tick = () => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length / 255;
        setAudioLevel(avg);
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      const stop = () => {
        cancelAnimationFrame(raf);
        setAudioLevel(0);
        setOrbState('idle');
        void ctx.close();
        audioCleanupRef.current = null;
      };
      audioCleanupRef.current = () => {
        audio.pause();
        stop();
      };
      audio.onended = stop;
      await audio.play();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Vorlesen nicht verfügbar — Chat bleibt nutzbar.');
      pulse('warning');
    }
  }

  async function toggleListen() {
    if (recording) {
      mediaRef.current?.stop();
      setRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
        void blobToBase64(blob).then(async (b64) => {
          try {
            setOrbState('listening');
            const { transcript } = await api.nexter.listen(b64, blob.type);
            setInput(transcript);
            void send(transcript);
          } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Spracheingabe fehlgeschlagen — bitte tippen.');
            pulse('warning');
          }
        });
      };
      mediaRef.current = rec;
      rec.start();
      setRecording(true);
      setOrbState('listening');
    } catch {
      setError('Mikrofon nicht verfügbar — der Text-Chat funktioniert weiter.');
      pulse('warning');
    }
  }

  function closeQuote(quoteId: string) {
    setClosedQuotes((prev) => {
      const next = new Set(prev);
      next.add(quoteId);
      return next;
    });
  }

  async function newConversation() {
    try {
      const r = await api.nexter.newSession();
      setMessages(r.session.messages);
      setError(null);
      setOrbState('idle');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Neue Unterhaltung fehlgeschlagen');
    }
  }

  async function runAction(action: NexterAction) {
    if (action.tool === 'quote_generation') return;
    if (action.tool === 'open_studio' && action.path) {
      navigate(action.path);
      return;
    }
    if (action.tool === 'suggest_variant' && action.path) {
      navigate(action.path);
      return;
    }
    if (action.tool === 'analyze_asset') {
      return;
    }
    const quoteId = typeof action.payload?.quoteId === 'string' ? action.payload.quoteId : null;
    if (action.tool === 'start_generation') {
      if (!quoteId) {
        setError('Ungültige Aktion — kein Angebot zum Bestätigen.');
        pulse('warning');
        return;
      }
      setLoading(true);
      setOrbState('generating');
      setError(null);
      try {
        const res = await api.nexter.confirmQuote(quoteId);
        closeQuote(quoteId);
        setMessages(res.session.messages);
        await refreshUser();
        pulse('success');
      } catch (err) {
        if (err instanceof ApiError && (err.status === 409 || err.status === 410)) {
          closeQuote(quoteId);
        }
        setError(err instanceof ApiError ? err.message : 'Generierung nicht gestartet');
        pulse('warning');
      } finally {
        setLoading(false);
      }
      return;
    }
    if (action.tool === 'cancel_generation') {
      if (!quoteId) {
        setError('Ungültige Aktion — nichts abzubrechen.');
        pulse('warning');
        return;
      }
      try {
        const res = await api.nexter.cancelQuote(quoteId);
        closeQuote(quoteId);
        setMessages(res.session.messages);
        setOrbState('idle');
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Abbrechen fehlgeschlagen');
      }
      return;
    }
    setError('Diese Aktion ist ungültig.');
    pulse('warning');
  }

  const orb = loading ? (orbState === 'generating' ? 'generating' : 'thinking') : recording ? 'listening' : orbState;

  return (
    <aside
      className={cn(
        'flex h-full min-h-[280px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[var(--ucbs-card)]/80 backdrop-blur-xl',
        className
      )}
    >
      <div className="flex items-center gap-3 border-b border-white/5 px-4 py-3">
        <NexterOrb state={orb} size={compact ? 44 : 56} audioLevel={audioLevel} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white">NEXTER</p>
          <p className="truncate text-[11px] text-zinc-500">Dein KI-Assistent</p>
        </div>
        <button
          type="button"
          onClick={() => void newConversation()}
          className="rounded-lg p-2 text-zinc-400 hover:text-white"
          aria-label="Neue Unterhaltung"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {activeDna && (
        <p className="border-b border-white/5 px-4 py-2 text-[11px] text-violet-200">
          DNA: {activeDna.name}
        </p>
      )}

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm">
        {messages.map((m) => (
          <div key={m.id} className={cn(m.role === 'user' ? 'text-right' : 'text-left')}>
            <div
              className={cn(
                'inline-block max-w-[95%] rounded-2xl px-3 py-2',
                m.role === 'user'
                  ? 'bg-[var(--ucbs-accent-purple)]/30 text-white'
                  : 'bg-white/5 text-zinc-200'
              )}
            >
              {m.content}
            </div>
            {m.suggestions?.length ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {m.suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => void send(s)}
                    className="rounded-full border border-violet-500/40 bg-violet-500/10 px-2.5 py-1 text-[11px] text-violet-200 hover:bg-violet-500/20"
                  >
                    {s}
                  </button>
                ))}
              </div>
            ) : null}
            {m.actions?.filter((a) => a.tool !== 'quote_generation').length ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {m.actions
                  .filter((a) => a.tool !== 'quote_generation')
                  .map((a) => {
                  const qid = typeof a.payload?.quoteId === 'string' ? a.payload.quoteId : null;
                  const used = Boolean(qid && closedQuotes.has(qid));
                  return (
                  <button
                    key={a.id}
                    type="button"
                    disabled={used || loading}
                    onClick={() => void runAction(a)}
                    className={cn(
                      'rounded-lg border px-2.5 py-1 text-[11px]',
                      a.tool === 'start_generation'
                        ? 'border-violet-400/50 bg-violet-600 text-white hover:bg-violet-500'
                        : 'border-white/10 bg-white/5 text-zinc-200 hover:border-violet-400/40',
                      (used || loading) && 'cursor-not-allowed opacity-40'
                    )}
                  >
                    {a.label}
                    {a.coinCost != null && a.tool !== 'start_generation' ? ` · ${formatCoins(a.coinCost)}` : ''}
                  </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        ))}
        {loading && <p className="text-xs text-zinc-500">{orbState === 'generating' ? 'Nexter generiert …' : 'Nexter arbeitet …'}</p>}
        {error && <p className="text-xs text-amber-300">{error}</p>}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSubmit} className="border-t border-white/5 p-3">
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Frag Nexter…"
            className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-violet-400/50 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => void toggleListen()}
            className={cn('rounded-lg p-2 hover:text-white', recording ? 'text-red-400' : 'text-zinc-400')}
            aria-label={recording ? 'Aufnahme stoppen' : 'Spracheingabe'}
          >
            <Mic className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => void speakLast()}
            className="rounded-lg p-2 text-zinc-400 hover:text-white"
            aria-label="Letzte Antwort vorlesen"
          >
            <Volume2 className="h-4 w-4" />
          </button>
          <button type="submit" className="rounded-lg bg-violet-600 p-2 text-white hover:bg-violet-500" aria-label="Senden">
            <Send className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-2 flex items-center gap-1 text-[10px] text-zinc-600">
          <Mic className="h-3 w-3" />
          {recording ? 'Aufnahme läuft — erneut klicken zum Senden' : 'Mikrofon transkribiert, Vorlesen nutzt ElevenLabs'}
          {' · '}
          <Link to="/nexter" className="text-violet-300 hover:underline">
            Vollansicht
          </Link>
        </p>
      </form>
    </aside>
  );
}

function blobToBase64(blob: Blob): Promise<string> {
  return blob.arrayBuffer().then((buf) => {
    const bytes = new Uint8Array(buf);
    let binary = '';
    bytes.forEach((b) => {
      binary += String.fromCharCode(b);
    });
    return btoa(binary);
  });
}
