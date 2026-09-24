import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Mic, Plus, Send, Volume2, VolumeX } from 'lucide-react';
import { api, ApiError, type NexterChatMessage, type NexterAction } from '@/services/api';
import {
  createNexterSpeechController,
  createNexterTtsController,
  isNexterTtsSupported,
  isNexterVoiceOutputEnabled,
  nexterOrbStatusLabel,
  nexterSpeechErrorMessage,
  nexterTtsStatusLabel,
  shouldAutoNavigateNexterStudio,
  nexterStudioPathFromUtterance,
  shouldAutoSpeakCompletedNexterReply,
  CONTENT_RIGHTS_ACK_STATEMENT,
  CONTENT_RIGHTS_ACK_VERSION,
  type NexterMicState,
  type NexterTtsState,
} from '@ucbs/shared';
import { useNexterStore } from '@/v2/store/nexter-store';
import { useBrandProjectStore } from '@/v2/store/brand-project-store';
import { useAuth } from '@/context/AuthContext';
import { createBrowserRecognition, readBrowserSpeechCapability, requestBrowserMicPermission } from '@/lib/nexter-speech';
import {
  cancelBrowserTts,
  readBrowserTtsCapability,
  readBrowserTtsVoices,
  speakBrowserUtterance,
  subscribeBrowserTtsVoices,
} from '@/lib/nexter-tts';
import { NexterOrb } from './NexterOrb';
import { cn, formatCoins } from '@/lib/utils';

export function NexterPanel({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  const { activeDna, refreshUser, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { orbState, setOrbState, pulse, studioHint, setAudioLevel, pendingPrompt, consumePendingPrompt, notifyQuoteCompleted } =
    useNexterStore();
  const activeProjectId = useBrandProjectStore((s) => s.activeProjectId);
  const setActiveProjectId = useBrandProjectStore((s) => s.setActiveProjectId);
  const [ownedProjects, setOwnedProjects] = useState<Array<{ id: string; name: string; status: string }>>([]);
  const [messages, setMessages] = useState<NexterChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [micState, setMicState] = useState<NexterMicState>('idle');
  const [ttsState, setTtsState] = useState<NexterTtsState>('idle');
  const [ttsSupported, setTtsSupported] = useState(false);
  const [voiceOutputEnabled, setVoiceOutputEnabled] = useState(false);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rightsChecked, setRightsChecked] = useState(false);
  const [closedQuotes, setClosedQuotes] = useState<Set<string>>(() => new Set());
  const bottomRef = useRef<HTMLDivElement>(null);
  const sendRef = useRef<(text: string) => Promise<void>>(async () => undefined);
  const lastAttemptRef = useRef<string | null>(null);
  const speakingRef = useRef(false);
  const loadingRef = useRef(false);
  const micStateRef = useRef<NexterMicState>('idle');
  const voiceOutputRef = useRef(false);
  const ttsSupportedRef = useRef(false);
  const hydratedUserIdRef = useRef<string | null>(null);
  const speechRef = useRef<ReturnType<typeof createNexterSpeechController> | null>(null);
  const ttsRef = useRef<ReturnType<typeof createNexterTtsController> | null>(null);
  const recording = micState === 'listening' || micState === 'requesting_permission';

  useEffect(() => {
    let cancelled = false;
    api.nexter
      .getSession()
      .then((r) => {
        if (cancelled) return;
        setMessages(r.session.messages);
        const bound = r.session.activeProjectId ?? null;
        setActiveProjectId(bound);
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
  }, [setActiveProjectId]);

  useEffect(() => {
    let cancelled = false;
    api.projects
      .list({ filter: 'active', limit: 40, sort: 'updated' })
      .then((r) => {
        if (!cancelled) {
          setOwnedProjects(r.projects.map((p) => ({ id: p.id, name: p.name, status: p.status })));
        }
      })
      .catch(() => {
        if (!cancelled) setOwnedProjects([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  useEffect(() => {
    micStateRef.current = micState;
  }, [micState]);

  useEffect(() => {
    voiceOutputRef.current = voiceOutputEnabled;
  }, [voiceOutputEnabled]);

  useEffect(() => {
    ttsSupportedRef.current = ttsSupported;
  }, [ttsSupported]);

  useEffect(() => {
    const id = user?.id ?? null;
    if (!id) {
      hydratedUserIdRef.current = null;
      setVoiceOutputEnabled(false);
      return;
    }
    if (hydratedUserIdRef.current === id) return;
    hydratedUserIdRef.current = id;
    setVoiceOutputEnabled(isNexterVoiceOutputEnabled(user?.nexterPreferences?.voiceOutputEnabled));
  }, [user]);

  useEffect(() => {
    const controller = createNexterSpeechController({
      getCapability: readBrowserSpeechCapability,
      createRecognition: createBrowserRecognition,
      requestMicPermission: requestBrowserMicPermission,
      onState: (next) => {
        setMicState(next);
        if (next === 'listening' || next === 'requesting_permission') setOrbState('listening');
        else if (next === 'processing') setOrbState('thinking');
        else if (!loadingRef.current && !speakingRef.current) setOrbState('idle');
      },
      onTranscript: (text) => {
        setInput(text);
        setError(null);
      },
      onError: (code) => {
        const message = nexterSpeechErrorMessage(code);
        if (message) setError(message);
        pulse('warning');
      },
    });
    speechRef.current = controller;
    return () => {
      controller.dispose();
      speechRef.current = null;
    };
  }, [pulse, setOrbState]);

  useEffect(() => {
    const cap = readBrowserTtsCapability();
    setTtsSupported(isNexterTtsSupported(cap));
    const controller = createNexterTtsController({
      getCapability: readBrowserTtsCapability,
      getVoices: readBrowserTtsVoices,
      cancelEngine: cancelBrowserTts,
      speakUtterance: speakBrowserUtterance,
      isMicListening: () => {
        const m = micStateRef.current;
        return m === 'listening' || m === 'requesting_permission' || m === 'processing';
      },
      onState: (next) => {
        setTtsState(next);
        speakingRef.current = next === 'speaking';
        if (next === 'speaking') {
          setOrbState('speaking');
          return;
        }
        setSpeakingMessageId(null);
        setAudioLevel(0);
        if (!loadingRef.current && micStateRef.current !== 'listening' && micStateRef.current !== 'requesting_permission') {
          setOrbState('idle');
        }
      },
      onError: () => {
        setError('Voice Output konnte nicht gestartet werden.');
        pulse('warning');
      },
    });
    ttsRef.current = controller;
    const unsubVoices = subscribeBrowserTtsVoices(() => {
      setTtsSupported(isNexterTtsSupported(readBrowserTtsCapability()));
    });
    return () => {
      unsubVoices();
      controller.dispose();
      ttsRef.current = null;
      speakingRef.current = false;
      setSpeakingMessageId(null);
      setAudioLevel(0);
    };
  }, [pulse, setAudioLevel, setOrbState]);

  useEffect(() => {
    ttsRef.current?.cancel();
  }, [location.pathname]);

  function speakAssistantMessage(message: NexterChatMessage, opts?: { auto?: boolean }) {
    if (!message?.content) return;
    if (opts?.auto && !shouldAutoSpeakCompletedNexterReply({
      voiceOutputEnabled: voiceOutputRef.current,
      ttsSupported: ttsSupportedRef.current,
      micState: micStateRef.current,
      replyComplete: true,
      isExistingSessionLoad: false,
    })) {
      return;
    }
    setSpeakingMessageId(message.id);
    void ttsRef.current?.speak(message.content, {
      auto: opts?.auto,
      language: user?.nexterPreferences?.language,
    });
  }

  function speakLast() {
    const last = [...messages].reverse().find((m) => m.role === 'assistant');
    if (!last) return;
    if (speakingRef.current && speakingMessageId === last.id) {
      ttsRef.current?.cancel();
      return;
    }
    speakAssistantMessage(last);
  }

  function stopSpeech() {
    ttsRef.current?.cancel();
  }

  async function send(text: string) {
    const msg = text.trim();
    if (!msg || loading) return;
    lastAttemptRef.current = msg;
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
      setActiveProjectId(res.session.activeProjectId ?? null);
      const last = res.session.messages[res.session.messages.length - 1];
      const awaitingConfirm = last?.actions?.some((a) => a.tool === 'start_generation' && a.requiresConfirmation);
      const open = last?.actions?.find((a) => a.tool === 'open_studio' && a.path);
      if (shouldAutoNavigateNexterStudio(open, { currentPath: location.pathname, awaitingConfirm }) && open?.path) {
        navigate(open.path);
      }
      pulse(awaitingConfirm ? 'warning' : 'success');
      if (last?.role === 'assistant') {
        speakAssistantMessage(last, { auto: true });
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Nexter ist gerade nicht erreichbar');
      pulse('error');
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

  async function toggleVoiceOutput() {
    if (!ttsSupported) return;
    const next = !voiceOutputEnabled;
    setVoiceOutputEnabled(next);
    if (!next) ttsRef.current?.cancel();
    if (!user?.id) return;
    try {
      await api.auth.updateNexterPreferences({ voiceOutputEnabled: next });
      await refreshUser();
    } catch {
      /* local toggle stays; chat remains usable */
    }
  }

  async function toggleListen() {
    ttsRef.current?.cancel();
    setError(null);
    await speechRef.current?.start();
  }

  function closeQuote(quoteId: string) {
    setClosedQuotes((prev) => {
      const next = new Set(prev);
      next.add(quoteId);
      return next;
    });
  }

  async function newConversation() {
    ttsRef.current?.cancel();
    try {
      const r = await api.nexter.newSession();
      setMessages(r.session.messages);
      setActiveProjectId(null);
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
        const hasAck = user?.contentRightsAck?.version === CONTENT_RIGHTS_ACK_VERSION;
        if (!hasAck) {
          if (!rightsChecked) {
            setError('Bitte bestätige, dass du die erforderlichen Rechte an den bereitgestellten Inhalten besitzt.');
            setLoading(false);
            return;
          }
          await api.contentRights.acknowledge();
          await refreshUser();
        }
        const res = await api.nexter.confirmQuote(quoteId);
        closeQuote(quoteId);
        setMessages(res.session.messages);
        notifyQuoteCompleted({
          quoteId: res.quote.id,
          kind: res.quote.kind,
          jobIds: res.jobIds ?? [],
          coinsSpent: res.coinsSpent,
          completedAt: Date.now(),
        });
        await refreshUser();
        pulse('success');
      } catch (err) {
        if (err instanceof ApiError && (err.status === 402 || err.status === 404 || err.status === 409 || err.status === 410)) {
          closeQuote(quoteId);
          try {
            const latest = await api.nexter.getSession();
            setMessages(latest.session.messages);
          } catch {
            /* keep current transcript */
          }
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
  const coinBalance = user?.coinBalance ?? 0;
  const ttsLabel = !ttsSupported
    ? 'Sprachausgabe nicht verfügbar'
    : voiceOutputEnabled
      ? 'Sprachausgabe an'
      : 'Sprachausgabe aus';

  return (
    <aside
      className={cn(
        'flex h-full min-h-[280px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[var(--ucbs-card)]/80 backdrop-blur-xl',
        className
      )}
      aria-busy={loading}
      aria-label="Nexter Chat"
    >
      <div className="flex items-center gap-3 border-b border-white/5 px-4 py-3">
        <NexterOrb
          variant="identity"
          state={orb}
          decorative
          className={compact ? 'nexter-orb--identity-compact' : undefined}
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white">NEXTER</p>
          <p className="truncate text-[11px] text-zinc-500">
            Dein KI-Assistent · {nexterOrbStatusLabel(orb)} · {formatCoins(coinBalance)}
          </p>
          <label className="mt-1 flex min-w-0 items-center gap-1 text-[10px] text-zinc-500">
            <span className="shrink-0">Projekt</span>
            <select
              data-testid="nexter-project-switcher"
              className="min-w-0 flex-1 truncate rounded border border-white/10 bg-transparent px-1 py-0.5 text-[11px] text-zinc-200"
              value={activeProjectId ?? ''}
              aria-label="Aktives Nexter-Projekt"
              onChange={(e) => {
                const next = e.target.value || null;
                void api.nexter
                  .setActiveProject(next)
                  .then((r) => {
                    setActiveProjectId(r.session.activeProjectId ?? next);
                    setMessages(r.session.messages);
                  })
                  .catch((err) => {
                    setError(err instanceof ApiError ? err.message : 'Projekt konnte nicht gewechselt werden');
                  });
              }}
            >
              <option value="">Kein Projekt</option>
              {ownedProjects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
              {activeProjectId && !ownedProjects.some((p) => p.id === activeProjectId) ? (
                <option value={activeProjectId}>Archiviertes Projekt</option>
              ) : null}
            </select>
          </label>
        </div>
        <button
          type="button"
          onClick={() => void toggleVoiceOutput()}
          disabled={!ttsSupported}
          aria-pressed={voiceOutputEnabled}
          aria-label={ttsLabel}
          title={ttsLabel}
          className={cn(
            'min-h-11 rounded-lg px-2 text-[11px] disabled:cursor-not-allowed disabled:opacity-40',
            voiceOutputEnabled ? 'text-violet-200' : 'text-zinc-400 hover:text-white'
          )}
        >
          {ttsSupported ? (voiceOutputEnabled ? 'Sprache an' : 'Sprache aus') : 'Sprache n. v.'}
        </button>
        <button
          type="button"
          onClick={() => void newConversation()}
          className="min-h-11 min-w-11 rounded-lg p-2 text-zinc-400 hover:text-white"
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

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm" role="log" aria-live="polite" aria-relevant="additions">
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
            {m.modificationPrep ? (
              <div className="mt-2 max-w-[95%] rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-left text-[12px] text-zinc-300">
                {m.modificationPrep.targetLabel ? <p>Ziel: {m.modificationPrep.targetLabel}</p> : null}
                {m.modificationPrep.changes.length ? (
                  <p className="mt-1">Änderungen: {m.modificationPrep.changes.join(', ')}</p>
                ) : null}
                {m.modificationPrep.preserve.length ? (
                  <p className="mt-1">Unverändert: {m.modificationPrep.preserve.join(', ')}</p>
                ) : null}
                <p className="mt-1">
                  Projekt-Aktuell: {m.modificationPrep.replaceCurrent ? 'später ersetzen, nur nach Bestätigung' : 'nicht still ersetzen'}
                </p>
                <p className="mt-1 text-amber-200/90">Ausführung derzeit nicht verfügbar.</p>
              </div>
            ) : null}
            {m.role === 'assistant' && ttsSupported ? (
              <div className="mt-1">
                <button
                  type="button"
                  onClick={() => {
                    if (speakingRef.current && speakingMessageId === m.id) {
                      stopSpeech();
                      return;
                    }
                    speakAssistantMessage(m);
                  }}
                  className="min-h-11 min-w-11 rounded-lg p-2 text-zinc-400 hover:text-white"
                  aria-label={
                    speakingMessageId === m.id && ttsState === 'speaking'
                      ? 'Vorlesen stoppen'
                      : 'Antwort vorlesen'
                  }
                  title={
                    speakingMessageId === m.id && ttsState === 'speaking'
                      ? 'Vorlesen stoppen'
                      : 'Antwort vorlesen'
                  }
                >
                  {speakingMessageId === m.id && ttsState === 'speaking' ? (
                    <VolumeX className="h-4 w-4" />
                  ) : (
                    <Volume2 className="h-4 w-4" />
                  )}
                </button>
              </div>
            ) : null}
            {m.suggestions?.length ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {m.suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      const studioPath = nexterStudioPathFromUtterance(s);
                      if (studioPath) {
                        navigate(studioPath);
                        return;
                      }
                      void send(s);
                    }}
                    className="min-h-11 rounded-full border border-violet-500/40 bg-violet-500/10 px-2.5 py-1 text-[11px] text-violet-200 hover:bg-violet-500/20"
                  >
                    {s}
                  </button>
                ))}
              </div>
            ) : null}
            {m.role === 'assistant' ? <QuoteCard actions={m.actions} coinBalance={coinBalance} closedQuotes={closedQuotes} /> : null}
            {m.actions?.filter((a) => a.tool !== 'quote_generation').length ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {m.actions
                  .filter((a) => a.tool !== 'quote_generation')
                  .map((a) => {
                  const qid = typeof a.payload?.quoteId === 'string' ? a.payload.quoteId : null;
                  const used = Boolean(qid && closedQuotes.has(qid));
                  const expired = isQuoteExpired(a.payload?.expiresAt);
                  const confirmDisabled = used || loading || (a.tool === 'start_generation' && expired);
                  return (
                  <button
                    key={a.id}
                    type="button"
                    disabled={confirmDisabled}
                    onClick={() => void runAction(a)}
                    className={cn(
                      'min-h-11 rounded-lg border px-2.5 py-1 text-[11px]',
                      a.tool === 'start_generation'
                        ? 'border-violet-400/50 bg-violet-600 text-white hover:bg-violet-500'
                        : 'border-white/10 bg-white/5 text-zinc-200 hover:border-violet-400/40',
                      confirmDisabled && 'cursor-not-allowed opacity-40'
                    )}
                    aria-label={
                      a.tool === 'start_generation'
                        ? `Angebot bestätigen, ${a.coinCost ?? ''} Coins`
                        : a.label
                    }
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
        {loading && (
          <p className="text-xs text-zinc-500" role="status" aria-live="polite">
            {orbState === 'generating' ? 'Nexter generiert …' : 'Nexter arbeitet …'}
          </p>
        )}
        {error && (
          <div className="space-y-2" role="alert">
            <p className="text-xs text-amber-300">{error}</p>
            {lastAttemptRef.current ? (
              <button
                type="button"
                className="min-h-11 rounded-lg border border-amber-400/40 px-2.5 py-1 text-[11px] text-amber-200"
                onClick={() => lastAttemptRef.current && void send(lastAttemptRef.current)}
              >
                Erneut versuchen
              </button>
            ) : null}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {user?.contentRightsAck?.version !== CONTENT_RIGHTS_ACK_VERSION && (
        <label className="flex items-start gap-2 border-t border-white/5 px-3 pt-3 text-[11px] text-zinc-400">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={rightsChecked}
            onChange={(e) => setRightsChecked(e.target.checked)}
          />
          <span>
            {CONTENT_RIGHTS_ACK_STATEMENT} NEXTER ersetzt keine Rechtsberatung und garantiert keine
            Urheberrechts- oder Markenfreiheit.
          </span>
        </label>
      )}

      <form onSubmit={handleSubmit} className="border-t border-white/5 p-3">
        <div className="flex items-end gap-2">
          <label htmlFor="nexter-chat-input" className="sr-only">
            Nachricht an Nexter
          </label>
          <input
            id="nexter-chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Frag Nexter…"
            aria-label="Nachricht an Nexter"
            disabled={loading}
            className="min-h-11 min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-violet-400/50 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => void toggleListen()}
            className={cn('min-h-11 min-w-11 rounded-lg p-2 hover:text-white', recording ? 'text-red-400' : 'text-zinc-400')}
            aria-label={recording ? 'Aufnahme stoppen' : 'Spracheingabe'}
            aria-pressed={recording}
          >
            <Mic className="h-4 w-4" />
          </button>
          {ttsSupported && ttsState === 'speaking' ? (
            <button
              type="button"
              onClick={stopSpeech}
              className="min-h-11 min-w-11 rounded-lg p-2 text-zinc-400 hover:text-white"
              aria-label="Vorlesen stoppen"
              title="Vorlesen stoppen"
            >
              <VolumeX className="h-4 w-4" />
            </button>
          ) : ttsSupported ? (
            <button
              type="button"
              onClick={() => void speakLast()}
              className="min-h-11 min-w-11 rounded-lg p-2 text-zinc-400 hover:text-white"
              aria-label="Letzte Antwort vorlesen"
              title="Letzte Antwort vorlesen"
            >
              <Volume2 className="h-4 w-4" />
            </button>
          ) : null}
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="min-h-11 min-w-11 rounded-lg bg-violet-600 p-2 text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Senden"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-2 flex items-center gap-1 text-[10px] text-zinc-600">
          <Mic className="h-3 w-3" />
          {recording ? 'Nexter hört zu — erneut klicken zum Stoppen' : 'Spracheingabe füllt das Feld. Senden bleibt manuell.'}
          {ttsSupported ? ` · Sprachausgabe ${nexterTtsStatusLabel(ttsState)}` : ' · Sprachausgabe nicht verfügbar'}
          {' · '}
          <Link to="/nexter" className="text-violet-300 hover:underline">
            Vollansicht
          </Link>
        </p>
      </form>
    </aside>
  );
}

function isQuoteExpired(expiresAt: unknown): boolean {
  if (typeof expiresAt !== 'string' || !expiresAt) return false;
  const ts = Date.parse(expiresAt);
  return Number.isFinite(ts) && ts <= Date.now();
}

function QuoteCard({
  actions,
  coinBalance,
  closedQuotes,
}: {
  actions?: NexterAction[];
  coinBalance: number;
  closedQuotes: Set<string>;
}) {
  const quote = actions?.find((a) => a.tool === 'quote_generation' || a.tool === 'start_generation');
  if (!quote) return null;
  const quoteId = typeof quote.payload?.quoteId === 'string' ? quote.payload.quoteId : null;
  if (quoteId && closedQuotes.has(quoteId)) return null;
  const cost = typeof quote.coinCost === 'number' ? quote.coinCost : null;
  const payloadBalance = typeof quote.payload?.coinBalance === 'number' ? quote.payload.coinBalance : coinBalance;
  const remaining = cost != null ? payloadBalance - cost : null;
  const expiresAt = typeof quote.payload?.expiresAt === 'string' ? quote.payload.expiresAt : null;
  const expired = isQuoteExpired(expiresAt);
  const kind = typeof quote.payload?.kind === 'string' ? quote.payload.kind : null;
  return (
    <div className="mt-2 max-w-[95%] rounded-xl border border-violet-400/30 bg-violet-500/10 px-3 py-2 text-left text-[12px] text-violet-100">
      <p className="font-medium text-white">Angebot{kind ? ` · ${kind}` : ''}</p>
      {cost != null ? <p>Preis: {formatCoins(cost)}</p> : null}
      <p>Guthaben: {formatCoins(payloadBalance)}</p>
      {remaining != null ? (
        <p>{remaining >= 0 ? `Danach: ${formatCoins(remaining)}` : `Es fehlen ${formatCoins(Math.abs(remaining))}`}</p>
      ) : null}
      {expiresAt ? (
        <p>{expired ? 'Abgelaufen — bitte neu anfragen.' : `Gültig bis ${new Date(expiresAt).toLocaleString()}`}</p>
      ) : null}
      <p className="mt-1 text-[11px] text-violet-200/80">Bestätigen startet erst nach „Erstellen“. Chat-Nachrichten buchen keine Coins.</p>
    </div>
  );
}
