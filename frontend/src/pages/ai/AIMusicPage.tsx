import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  COIN_COSTS,
  CoinSpendCategory,
  MUSIC_ENERGY_OPTIONS,
  MUSIC_GENRES,
  MUSIC_MOODS,
  MUSIC_USE_CASES,
  MUSICGEN_VOCAL_CAPABILITY,
  buildMusicPreviewSummary,
  buildMusicPrompt,
  musicGenMaxDurationSec,
  type MusicEnergy,
  type MusicPurpose,
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

const MUSIC_COST = COIN_COSTS[CoinSpendCategory.AI_MUSIC];
const MAX_SEC = musicGenMaxDurationSec();

export function AIMusicPage() {
  const { activeDna, user } = useAuth();
  const [search] = useSearchParams();
  const queueNexterPrompt = useNexterStore((s) => s.queueNexterPrompt);
  const [title, setTitle] = useState('');
  const [genre, setGenre] = useState(search.get('genre') || '');
  const [mood, setMood] = useState(search.get('mood') || 'epic');
  const [energy, setEnergy] = useState<MusicEnergy>(
    search.get('energy') === 'low' || search.get('energy') === 'high' ? (search.get('energy') as MusicEnergy) : 'medium'
  );
  const [purpose, setPurpose] = useState<MusicPurpose>(
    MUSIC_USE_CASES.some((u) => u.id === search.get('purpose'))
      ? (search.get('purpose') as MusicPurpose)
      : 'stream-intro'
  );
  const [durationSec, setDurationSec] = useState(Number(search.get('duration')) || MAX_SEC);
  const [jobs, setJobs] = useState<MediaJob[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [audioErrorId, setAudioErrorId] = useState<string | null>(null);

  const prompt = useMemo(
    () =>
      buildMusicPrompt({
        duration: durationSec,
        mood,
        purpose,
        instrumental: true,
        theme: activeDna?.styleDirection,
        genre: genre || undefined,
        energy,
        title: title || undefined,
        original: `${mood} ${genre} ${purpose}`,
        styleDirection: activeDna?.styleDirection,
        dnaName: activeDna?.name,
      }),
    [durationSec, mood, purpose, genre, energy, title, activeDna]
  );
  const summary = buildMusicPreviewSummary({
    durationSec,
    mood,
    purpose,
    genre: genre || undefined,
    energy,
    theme: activeDna?.styleDirection,
  });
  const coins = user?.coinBalance ?? 0;
  const remainder = coins - MUSIC_COST;

  useEffect(() => {
    let cancelled = false;
    setLoadingJobs(true);
    api.aiMusic
      .list()
      .then((r) => {
        if (!cancelled) setJobs(r.jobs);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingJobs(false);
      });
    const poll = window.setInterval(() => {
      api.aiMusic
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

  function nexterPrompt(): string {
    if (purpose === 'stream-intro') return `Mach mir Musik für mein Intro, ${durationSec} Sekunden, ${genre || mood}.`;
    if (genre.toLowerCase().includes('hardcore') || genre === 'Techno') {
      return `Ich brauche aggressiven Hardcore-Techno, ${durationSec} Sekunden.`;
    }
    return `Ich brauche ${durationSec} Sekunden Hintergrundmusik, ${mood}, ohne Gesang.`;
  }

  async function tryDirectGenerate() {
    setError(null);
    try {
      const token = await getAuthRequestToken();
      const res = await fetch('/api/v1/ai/music/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ prompt, title, duration: durationSec, coinCost: 1 }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      setError(json?.error?.message || 'Musik startet nur über Nexter nach Bestätigung.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Musik nur über Nexter');
    }
  }

  async function downloadJob(job: MediaJob) {
    setError(null);
    try {
      const r = await api.aiMusic.download(job.id);
      window.open(r.downloadUrl, '_blank');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Download fehlgeschlagen');
    }
  }

  return (
    <StudioShell
      title="Musik Studio"
      description="Stil, Dauer und Einsatz konfigurieren — Nexter-Angebot, ohne Musik-Provider keine Coin-Abbuchung."
      coinCost={MUSIC_COST}
      nexterHint="Musik"
      badge={<Badge variant="brand">MusicGen</Badge>}
    >
      {!activeDna && <DnaRequiredBanner message="Creator DNA erforderlich — Stil und Marke fließen als Kontext, DNA wird nicht geändert." />}
      {error && <StudioErrorBanner message={error} />}

      <StudioWorkbench
        settingsTitle="Musik"
        previewTitle="Vorschau"
        settings={
          <div data-testid="music-wizard" className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">1. Einsatz</p>
            <div className="flex flex-wrap gap-2" data-testid="music-purpose">
              {MUSIC_USE_CASES.map((u) => (
                <StudioOptionPill key={u.id} active={purpose === u.id} onClick={() => setPurpose(u.id)}>
                  {u.label}
                </StudioOptionPill>
              ))}
            </div>

            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">2. Genre / Stimmung</p>
            <div className="flex flex-wrap gap-2" data-testid="music-genres">
              {MUSIC_GENRES.map((g) => (
                <StudioOptionPill key={g} active={genre === g} onClick={() => setGenre(g)}>
                  {g}
                </StudioOptionPill>
              ))}
            </div>
            <div className="flex flex-wrap gap-2" data-testid="music-moods">
              {MUSIC_MOODS.map((m) => (
                <StudioOptionPill key={m} active={mood === m} onClick={() => setMood(m)}>
                  {m}
                </StudioOptionPill>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {MUSIC_ENERGY_OPTIONS.map((e) => (
                <StudioOptionPill key={e.id} active={energy === e.id} onClick={() => setEnergy(e.id)}>
                  {e.label}
                </StudioOptionPill>
              ))}
            </div>

            <label className="block text-xs text-zinc-400">
              Dauer {durationSec}s (MusicGen max. {MAX_SEC}s)
              <input
                data-testid="music-duration"
                type="range"
                min={1}
                max={MAX_SEC}
                value={durationSec}
                onChange={(e) => setDurationSec(Number(e.target.value))}
                className="mt-1 w-full"
              />
            </label>
            <label className="block text-xs text-zinc-400">
              Titel
              <input
                className="mt-1 min-h-11 w-full rounded border border-white/10 bg-black/40 px-2 text-sm text-zinc-200"
                value={title}
                onChange={(e) => setTitle(e.target.value.slice(0, 80))}
                placeholder="optional"
              />
            </label>
            <p className="text-[11px] text-zinc-500" data-testid="music-vocals-note">
              {MUSICGEN_VOCAL_CAPABILITY === 'instrumental-only'
                ? 'MusicGen: nur Instrumental — kein Gesang, keine Song-/Künstler-Klone.'
                : ''}
            </p>

            <div className="rounded-lg border border-white/10 p-3 text-[11px] text-zinc-400" data-testid="music-quote-summary">
              <p>{summary}</p>
              <p>
                {MUSIC_COST} Coins · Bestand {coins} → nach Bestätigung {remainder < 0 ? 'unzureichend' : remainder}
              </p>
              <p className="mt-1">
                Ohne verfügbaren Musik-Provider stoppt die Bestätigung vor der Abbuchung.
              </p>
              {remainder < 0 && (
                <p className="mt-1 text-amber-300" data-testid="music-insufficient-coins">
                  Zu wenig Coins — Job startet nicht.
                </p>
              )}
            </div>

            <button
              type="button"
              data-testid="music-nexter-chip"
              onClick={() => queueNexterPrompt(nexterPrompt())}
              className="min-h-11 w-full rounded-full border border-violet-500/40 bg-violet-500/10 px-3 py-2 text-sm text-violet-200"
            >
              Für {MUSIC_COST} Coins erstellen — Nexter: „{nexterPrompt()}“
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
                DNA-Kontext: {activeDna.name}
                {activeDna.styleDirection ? ` · ${activeDna.styleDirection}` : ''}
                {activeDna.brandingStyle ? ` · ${activeDna.brandingStyle}` : ''} — DNA wird nicht überschrieben
              </StudioSuccessBanner>
            )}
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400" data-testid="music-preview-label">
              Konfigurationsvorschau — noch keine generierte Musik
            </p>
            <p className="text-sm text-zinc-200" data-testid="music-prompt-summary">
              {summary}
            </p>
            <p className="text-[11px] text-zinc-500">Vor der Generation gibt es keinen Song zum Abspielen.</p>
          </div>
        }
        history={
          <GlassCard accent="cyan" className="!p-5" data-testid="music-jobs">
            <h2 className="mb-3 text-sm font-semibold text-zinc-300">Ergebnisse</h2>
            {loadingJobs && (
              <p className="text-sm text-zinc-500" data-testid="music-jobs-loading">
                Ergebnisse laden …
              </p>
            )}
            {!loadingJobs && jobs.length === 0 && (
              <p className="text-sm text-zinc-500" data-testid="music-jobs-empty">
                Noch kein Musikprojekt.
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {jobs.slice(0, 8).map((j) => (
                <div key={j.id} className="rounded-lg border border-zinc-800 p-3" data-testid="music-result-card">
                  <p className="text-sm text-zinc-200">{j.title || 'Track'}</p>
                  <p className="text-xs text-zinc-500">
                    {j.status}
                    {j.duration ? ` · ${j.duration}s` : ''}
                    {typeof j.metadata?.version === 'number' ? ` · v${j.metadata.version}` : ''}
                    {j.provider ? ` · ${j.provider}` : ''}
                  </p>
                  {j.status === 'queued' || j.status === 'processing' ? (
                    <p className="mt-1 text-xs text-cyan-300">Job läuft …</p>
                  ) : null}
                  {j.status === 'failed' && <p className="mt-1 text-xs text-red-400">{j.error || 'Fehlgeschlagen'}</p>}
                  {j.fileMissing && (
                    <p className="mt-1 text-xs text-amber-300" data-testid="music-file-missing">
                      Result-Datei fehlt.
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
                    <p className="mt-1 text-xs text-red-400">Audio-Vorschau fehlgeschlagen.</p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {j.status === 'completed' && !j.fileMissing && (
                      <Button size="sm" className="min-h-11" data-testid="music-download" onClick={() => void downloadJob(j)}>
                        Download
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="min-h-11"
                      onClick={() => queueNexterPrompt('Mach die Musik schneller und härter.')}
                    >
                      Ändern
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="min-h-11"
                      onClick={() => queueNexterPrompt('Neue Variante der Musik.')}
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
