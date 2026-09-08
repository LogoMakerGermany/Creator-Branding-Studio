import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  COIN_COSTS,
  CoinSpendCategory,
  DEFAULT_NEXTER_LANGUAGE,
  DEFAULT_NEXTER_VOICE_CATALOG_ID,
  MAX_VOICE_STUDIO_CHARS,
  NEXTER_LANGUAGE_LABELS,
  NEXTER_LANGUAGES,
  buildVoicePreviewSummary,
  estimateVoiceDurationSec,
  isNexterLanguage,
  voiceSupportsLanguage,
  type NexterVoiceCatalogEntry,
} from '@ucbs/shared';
import { StudioShell } from '@/v2/components/StudioShell';
import { StudioWorkbench } from '@/v2/components/StudioWorkbench';
import { StudioOptionPill } from '@/v2/components/StudioOptionPill';
import { Badge, Button } from '@/components/ui';
import { DnaRequiredBanner, StudioSuccessBanner } from '@/v2/components/StudioAlerts';
import { StudioErrorBanner } from '@/components/studio';
import { useAuth } from '@/context/AuthContext';
import { api, ApiError, getAuthRequestToken, type MediaJob } from '@/services/api';
import { useNexterStore } from '@/v2/store/nexter-store';
import { GlassCard } from '@/v2/components/GlassCard';

const VOICE_COST = COIN_COSTS[CoinSpendCategory.AI_VOICE];

export function AIVoicePage() {
  const { activeDna, user } = useAuth();
  const [search] = useSearchParams();
  const queueNexterPrompt = useNexterStore((s) => s.queueNexterPrompt);
  const prefs = user?.nexterPreferences;
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [language, setLanguage] = useState(
    isNexterLanguage(search.get('language')) ? search.get('language')! : prefs?.language ?? DEFAULT_NEXTER_LANGUAGE
  );
  const [voiceCatalogId, setVoiceCatalogId] = useState(
    search.get('voice') || prefs?.voiceCatalogId || DEFAULT_NEXTER_VOICE_CATALOG_ID
  );
  const [voices, setVoices] = useState<NexterVoiceCatalogEntry[]>([]);
  const [voicesLoading, setVoicesLoading] = useState(true);
  const [previewStatus, setPreviewStatus] = useState<string | null>(null);
  const [localPreviewNote, setLocalPreviewNote] = useState<string | null>(null);
  const [jobs, setJobs] = useState<MediaJob[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [audioErrorId, setAudioErrorId] = useState<string | null>(null);

  const selected = voices.find((v) => v.catalogId === voiceCatalogId);
  const compatible = voices.filter((v) => voiceSupportsLanguage(v, language) || v.catalogId.startsWith('nexter-'));
  const estimated = text.trim() ? estimateVoiceDurationSec(text.trim()) : 0;
  const summary = buildVoicePreviewSummary({
    text: text.trim(),
    language,
    voiceCatalogId,
    estimatedDurationSec: estimated,
  });
  const coins = user?.coinBalance ?? 0;
  const remainder = coins - VOICE_COST;
  const textOk = text.trim().length > 0 && text.trim().length <= MAX_VOICE_STUDIO_CHARS;

  const nexterPrompt = useMemo(() => {
    if (!text.trim()) return 'Mach ein Voiceover.';
    return `Sprich folgenden Text als Voiceover: ${text.trim().slice(0, 400)}`;
  }, [text]);

  useEffect(() => {
    setVoicesLoading(true);
    api.nexter
      .voices()
      .then((r) => setVoices(r.voices))
      .catch(() => setVoices([]))
      .finally(() => setVoicesLoading(false));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadingJobs(true);
    api.aiVoice
      .list()
      .then((r) => {
        if (!cancelled) setJobs(r.jobs);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingJobs(false);
      });
    const poll = window.setInterval(() => {
      api.aiVoice
        .list()
        .then((r) => {
          if (!cancelled) setJobs(r.jobs);
        })
        .catch(() => {});
    }, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(poll);
    };
  }, [activeDna?.id]);

  async function playCatalogPreview() {
    setPreviewStatus('Stimmvorschau lädt …');
    try {
      const blob = await api.nexter.voicePreview(voiceCatalogId);
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => URL.revokeObjectURL(url);
      await audio.play();
      setPreviewStatus(null);
    } catch {
      setPreviewStatus('Stimmvorschau nicht verfügbar');
    }
  }

  function playLocalPreview() {
    if (!text.trim() || typeof window === 'undefined' || !window.speechSynthesis) {
      setLocalPreviewNote('Lokale Textvorschau nicht verfügbar');
      return;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.trim().slice(0, 400));
    u.lang = language === 'en' ? 'en-US' : 'de-DE';
    window.speechSynthesis.speak(u);
    setLocalPreviewNote('Lokale Textvorschau (Browser — nicht die spätere Provider-Stimme)');
  }

  async function tryDirectGenerate() {
    setError(null);
    try {
      const token = await getAuthRequestToken();
      const res = await fetch('/api/v1/ai/voice/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ text, title, language, voiceCatalogId, coinCost: 1 }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      setError(json?.error?.message || 'Voiceovers starten nur über Nexter nach Bestätigung.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Voiceover nur über Nexter');
    }
  }

  async function downloadJob(job: MediaJob) {
    setError(null);
    try {
      const r = await api.aiVoice.download(job.id);
      window.open(r.downloadUrl, '_blank');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Download fehlgeschlagen');
    }
  }

  return (
    <StudioShell
      title="Voice Studio"
      description="Text, Sprache und Stimme — TTS-Job nur nach Nexter-Quote."
      coinCost={VOICE_COST}
      nexterHint="Voice"
      badge={<Badge variant="brand">TTS</Badge>}
    >
      {!activeDna && <DnaRequiredBanner message="Creator DNA erforderlich — DNA wird nicht geändert." />}
      {error && <StudioErrorBanner message={error} />}

      <StudioWorkbench
        settingsTitle="Voiceover"
        previewTitle="Vorschau"
        settings={
          <div data-testid="voice-wizard" className="space-y-4">
            <label className="block text-xs text-zinc-400">
              Text
              <textarea
                data-testid="voice-text"
                className="mt-1 min-h-24 w-full rounded border border-white/10 bg-black/40 p-2 text-sm text-zinc-200"
                maxLength={MAX_VOICE_STUDIO_CHARS}
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, MAX_VOICE_STUDIO_CHARS))}
                placeholder="Text, den die Stimme sprechen soll"
              />
            </label>
            {!text.trim() && (
              <p className="text-xs text-amber-300" data-testid="voice-empty-text">
                Kein Text — es startet kein Job.
              </p>
            )}
            {text.trim().length >= MAX_VOICE_STUDIO_CHARS && (
              <p className="text-xs text-amber-300">Maximale Zeichenanzahl erreicht ({MAX_VOICE_STUDIO_CHARS}).</p>
            )}

            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Sprache</p>
            <div className="flex flex-wrap gap-2" data-testid="voice-language">
              {NEXTER_LANGUAGES.map((code) => (
                <StudioOptionPill key={code} active={language === code} onClick={() => setLanguage(code)}>
                  {NEXTER_LANGUAGE_LABELS[code]}
                </StudioOptionPill>
              ))}
            </div>

            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Stimme</p>
            {voicesLoading && (
              <p className="text-sm text-zinc-500" data-testid="voice-catalog-loading">
                Stimmenkatalog lädt …
              </p>
            )}
            <div className="flex max-h-48 flex-col gap-1 overflow-y-auto" data-testid="voice-catalog">
              {(compatible.length ? compatible : voices).map((v) => (
                <button
                  key={v.catalogId}
                  type="button"
                  className={`min-h-11 rounded border px-3 py-2 text-left text-sm ${
                    voiceCatalogId === v.catalogId ? 'border-violet-400/50 bg-violet-500/10 text-white' : 'border-white/10 text-zinc-300'
                  }`}
                  onClick={() => setVoiceCatalogId(v.catalogId)}
                >
                  <span className="font-medium">{v.label}</span>
                  {v.gender ? <span className="ml-2 text-xs text-zinc-500">{v.gender}</span> : null}
                </button>
              ))}
            </div>
            {selected && !voiceSupportsLanguage(selected, language) && (
              <p className="text-xs text-amber-300">Diese Stimme ist für die gewählte Sprache nicht markiert.</p>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                className="min-h-11"
                disabled={!selected?.hasPreview}
                onClick={() => void playCatalogPreview()}
              >
                Stimmvorschau
              </Button>
              <Button size="sm" variant="ghost" className="min-h-11" disabled={!text.trim()} onClick={playLocalPreview}>
                Lokale Textvorschau
              </Button>
            </div>
            {previewStatus && <p className="text-xs text-zinc-400">{previewStatus}</p>}
            {localPreviewNote && (
              <p className="text-xs text-zinc-500" data-testid="voice-local-preview">
                {localPreviewNote}
              </p>
            )}

            <label className="block text-xs text-zinc-400">
              Titel
              <input
                className="mt-1 min-h-11 w-full rounded border border-white/10 bg-black/40 px-2 text-sm text-zinc-200"
                value={title}
                onChange={(e) => setTitle(e.target.value.slice(0, 80))}
                placeholder="optional, z. B. Intro"
              />
            </label>

            <div className="rounded-lg border border-white/10 p-3 text-[11px] text-zinc-400" data-testid="voice-quote-summary">
              <p>
                {selected?.label ?? voiceCatalogId} · {NEXTER_LANGUAGE_LABELS[language as 'de' | 'en'] ?? language}
              </p>
              <p>{summary}</p>
              <p>
                {VOICE_COST} Coins · Bestand {coins} → nach Bestätigung {remainder < 0 ? 'unzureichend' : remainder}
              </p>
              {remainder < 0 && (
                <p className="mt-1 text-amber-300" data-testid="voice-insufficient-coins">
                  Zu wenig Coins — Job startet nicht.
                </p>
              )}
            </div>

            <button
              type="button"
              data-testid="voice-nexter-chip"
              disabled={!textOk}
              onClick={() => queueNexterPrompt(nexterPrompt)}
              className="min-h-11 w-full rounded-full border border-violet-500/40 bg-violet-500/10 px-3 py-2 text-sm text-violet-200 disabled:opacity-40"
            >
              Für {VOICE_COST} Coins erstellen
            </button>
            <Button variant="ghost" size="sm" className="min-h-11 w-full" onClick={() => void tryDirectGenerate()}>
              Direkt erzeugen (wird abgelehnt)
            </Button>
          </div>
        }
        preview={
          <div className="space-y-3">
            {activeDna && (
              <StudioSuccessBanner>
                DNA-Kontext: {activeDna.name} — DNA wird nicht überschrieben
              </StudioSuccessBanner>
            )}
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400" data-testid="voice-preview-label">
              Stimmvorschau — nicht das generierte Ergebnis
            </p>
            <p className="text-sm text-zinc-200">{selected?.label ?? 'Keine Stimme gewählt'}</p>
            <p className="text-[11px] text-zinc-500">
              Die Katalog-Stimmvorschau ist ein Sample. Die lokale Browser-Vorschau ist nicht die spätere Provider-Stimme.
            </p>
          </div>
        }
        history={
          <GlassCard accent="cyan" className="!p-5" data-testid="voice-jobs">
            <h2 className="mb-3 text-sm font-semibold text-zinc-300">Ergebnisse</h2>
            {loadingJobs && (
              <p className="text-sm text-zinc-500" data-testid="voice-jobs-loading">
                Ergebnisse laden …
              </p>
            )}
            {!loadingJobs && jobs.length === 0 && (
              <p className="text-sm text-zinc-500" data-testid="voice-jobs-empty">
                Noch kein Voiceover.
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {jobs.slice(0, 8).map((j) => (
                <div key={j.id} className="rounded-lg border border-zinc-800 p-3" data-testid="voice-result-card">
                  <p className="text-sm text-zinc-200">{j.title || 'Voiceover'}</p>
                  <p className="text-xs text-zinc-500">
                    {j.status}
                    {typeof j.metadata?.version === 'number' ? ` · v${j.metadata.version}` : ''}
                    {j.metadata?.voiceCatalogId ? ` · ${String(j.metadata.voiceCatalogId)}` : ''}
                    {j.provider ? ` · ${j.provider}` : ''}
                  </p>
                  {j.status === 'queued' || j.status === 'processing' ? (
                    <p className="mt-1 text-xs text-cyan-300">Job läuft …</p>
                  ) : null}
                  {j.status === 'failed' && <p className="mt-1 text-xs text-red-400">{j.error || 'Fehlgeschlagen'}</p>}
                  {j.fileMissing && (
                    <p className="mt-1 text-xs text-amber-300" data-testid="voice-file-missing">
                      Audio-Datei fehlt.
                    </p>
                  )}
                  {j.audioUrl && j.status === 'completed' && !j.fileMissing && (
                    <audio
                      src={j.audioUrl}
                      controls
                      className="mt-2 w-full"
                      onError={() => setAudioErrorId(j.id)}
                    />
                  )}
                  {audioErrorId === j.id && (
                    <p className="mt-1 text-xs text-red-400">Audio-Vorschau fehlgeschlagen. Signed URL ggf. erneuern über Download.</p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {j.status === 'completed' && (
                      <Button size="sm" className="min-h-11" data-testid="voice-download" onClick={() => void downloadJob(j)}>
                        Download
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="min-h-11"
                      onClick={() => queueNexterPrompt('Etwas langsamer.')}
                    >
                      Ändern
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="min-h-11"
                      onClick={() => queueNexterPrompt('Neue Variante der Stimme.')}
                    >
                      Neue Variante
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>
        }
      />
    </StudioShell>
  );
}
