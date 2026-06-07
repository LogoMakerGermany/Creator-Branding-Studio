import { useState, useEffect } from 'react';
import { useParams, useLocation, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { STREAM_SET_PLATFORM_LABELS, type StreamSetPlatform } from '@cbs/shared';
import api from '../lib/api';
import { NeonButton } from '../components/NeonButton';
import { friendlyProgressMessage } from '../components/beginnerWizard/wizardConfig';

interface BrandingProgress {
  phase: string;
  total: number;
  completed: number;
  current?: string;
  done: boolean;
  error?: string;
}

export function BrandingPackPage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const initialPackId = (location.state as { packId?: string })?.packId ?? null;
  const platform = (location.state as { platform?: StreamSetPlatform })?.platform ?? 'tiktok';
  const beginner = (location.state as { beginner?: boolean })?.beginner ?? true;

  const [packId, setPackId] = useState<string | null>(initialPackId);
  const [progress, setProgress] = useState<BrandingProgress | null>(null);
  const [regenerating, setRegenerating] = useState(false);

  const { data: assets = [], refetch: refetchAssets } = useQuery({
    queryKey: ['assets', id],
    queryFn: async () => (await api.get(`/projects/${id}/assets`)).data,
    enabled: Boolean(id),
  });

  useEffect(() => {
    if (!packId || !id) return;
    const interval = setInterval(async () => {
      try {
        const { data } = await api.get(`/projects/${id}/branding/${packId}`);
        setProgress(data);
        if (data.done) {
          clearInterval(interval);
          refetchAssets();
        }
      } catch {
        /* ignore */
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [packId, id, refetchAssets]);

  async function regenerateAll() {
    if (!id) return;
    setRegenerating(true);
    try {
      const { data } = await api.post(`/projects/${id}/branding/regenerate`, { platform });
      setPackId(data.packId);
      setProgress({ phase: 'generating', total: 0, completed: 0, done: false });
    } finally {
      setRegenerating(false);
    }
  }

  const pct = progress && progress.total > 0
    ? Math.round((progress.completed / progress.total) * 100)
    : 0;

  const statusText = friendlyProgressMessage(progress?.current, progress?.phase);
  const isGenerating = progress && !progress.done && !progress.error;
  const isDone = progress?.done && !progress.error;

  if (beginner) {
    return (
      <div className="mx-auto max-w-lg px-4 pb-12">
        {isGenerating && (
          <div className="rounded-3xl border border-white/10 bg-surface-2 p-8 text-center">
            <p className="text-sm text-neon-cyan">Dein Branding wird erstellt</p>
            <h1 className="mt-4 font-display text-2xl font-bold text-white">{statusText}</h1>

            <div className="mx-auto mt-8 h-4 max-w-xs overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-neon-pink to-neon-cyan transition-all duration-500"
                style={{ width: `${Math.max(pct, 8)}%` }}
              />
            </div>
            <p className="mt-4 text-sm text-white/40">
              {progress!.completed} von {progress!.total} Dateien fertig
            </p>

            <ul className="mt-8 space-y-3 text-left text-sm text-white/60">
              <ProgressHint active={statusText.includes('Logo')} done={pct > 10} text="Logo wird erstellt..." />
              <ProgressHint active={statusText.includes('Banner')} done={pct > 25} text="Banner wird erstellt..." />
              <ProgressHint active={statusText.includes('Sticker')} done={pct > 45} text="Sticker werden erstellt..." />
              <ProgressHint active={statusText.includes('Intro')} done={pct > 65} text="Intro wird erstellt..." />
              <ProgressHint active={statusText.includes('Download') || progress?.phase === 'qc'} done={Boolean(isDone)} text="Download wird vorbereitet..." />
            </ul>
          </div>
        )}

        {progress?.error && (
          <div className="rounded-3xl border border-red-500/30 bg-red-500/10 p-8 text-center">
            <p className="text-lg text-red-300">{progress.error}</p>
            <NeonButton className="mt-6 w-full" onClick={regenerateAll} loading={regenerating}>
              🔄 Nochmal versuchen
            </NeonButton>
          </div>
        )}

        {isDone && (
          <div className="space-y-6">
            <div className="rounded-3xl border border-neon-cyan/30 bg-neon-cyan/5 p-8 text-center">
              <span className="text-5xl">🎉</span>
              <h1 className="mt-4 font-display text-2xl font-bold text-white">Fertig!</h1>
              <p className="mt-2 text-white/60">Dein komplettes Branding ist bereit zum Download.</p>
            </div>

            {assets.length > 0 && (
              <div>
                <h2 className="mb-4 text-center text-lg font-semibold text-white">Deine Dateien</h2>
                <div className="grid grid-cols-2 gap-3">
                  {assets.slice(0, 8).map((a: { id: string; fileName: string; assetType: string }) => (
                    <div key={a.id} className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
                      {a.fileName.endsWith('.mp4') ? (
                        <div className="flex aspect-video items-center justify-center bg-black/40 text-3xl">▶️</div>
                      ) : (
                        <img
                          src={`/api/projects/${id}/assets/${a.fileName}`}
                          alt=""
                          className="aspect-video w-full object-contain bg-black/20 p-2"
                        />
                      )}
                      <p className="truncate px-2 py-2 text-xs text-white/50">{a.fileName}</p>
                    </div>
                  ))}
                </div>
                {assets.length > 8 && (
                  <p className="mt-2 text-center text-xs text-white/40">+ {assets.length - 8} weitere Dateien im Download</p>
                )}
              </div>
            )}

            <div className="flex flex-col gap-3">
              <a href={`/api/projects/${id}/downloads/branding-pack`} className="block">
                <button
                  type="button"
                  className="w-full rounded-2xl bg-gradient-to-r from-neon-pink to-neon-purple py-5 text-lg font-bold text-white shadow-lg"
                >
                  ⬇ Komplettes Branding herunterladen
                </button>
              </a>
              <button
                type="button"
                onClick={regenerateAll}
                disabled={regenerating}
                className="w-full rounded-2xl border border-white/15 py-4 text-base font-semibold text-white/80"
              >
                {regenerating ? 'Wird erstellt…' : '🔄 Neu generieren'}
              </button>
              <Link to={`/projects/${id}/dna`} className="block">
                <button
                  type="button"
                  className="w-full rounded-2xl border border-white/15 py-4 text-base font-semibold text-white/80"
                >
                  ✏ Projekt bearbeiten
                </button>
              </Link>
            </div>
          </div>
        )}

        {!packId && !progress && (
          <div className="rounded-3xl border border-white/10 p-8 text-center text-white/50">
            <p>Starte zuerst den Einrichtungsassistenten.</p>
            <Link to="/onboarding" className="mt-4 inline-block text-neon-cyan">Neues Projekt erstellen →</Link>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4">
      <p className="text-white/50">Branding für {STREAM_SET_PLATFORM_LABELS[platform]}</p>
      {isGenerating && <p className="mt-4 text-xl">{statusText}</p>}
      {isDone && (
        <a href={`/api/projects/${id}/downloads/branding-pack`}>
          <NeonButton className="mt-6">Download</NeonButton>
        </a>
      )}
    </div>
  );
}

function ProgressHint({ active, done, text }: { active: boolean; done: boolean; text: string }) {
  return (
    <li className={`flex items-center gap-3 ${active ? 'text-white font-medium' : done ? 'text-neon-cyan/70' : ''}`}>
      <span>{done ? '✓' : active ? '●' : '○'}</span>
      {text}
    </li>
  );
}
