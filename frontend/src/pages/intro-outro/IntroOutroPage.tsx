import { useEffect, useState } from 'react';
import { Badge, Button, Input, StatCard } from '@/components/ui';
import {
  Play, Square, Radio, Tv, Sparkles, CheckCircle2, Download, Package,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { api, ApiError, type MediaJob, type IntroOutroType } from '@/services/api';
import { formatCoins } from '@/lib/utils';
import { MediaJobPreview, getMediaDownloadUrl, getMediaExports } from '@/components/media/MediaJobPreview';
import {
  StudioErrorBanner,
  TypeOptionButton,
  NeonPreviewBox,
  MediaGalleryGrid,
  GalleryThumb,
} from '@/components/studio';
import { StudioShell } from '@/v2/components/StudioShell';
import { StudioWorkbench } from '@/v2/components/StudioWorkbench';
import { DnaRequiredBanner } from '@/v2/components/StudioAlerts';
import { GlassCard } from '@/v2/components/GlassCard';

const TYPES: { type: IntroOutroType; label: string; icon: typeof Play }[] = [
  { type: 'intro', label: 'Intro', icon: Play },
  { type: 'outro', label: 'Outro', icon: Square },
  { type: 'stream-start', label: 'Starting Soon', icon: Radio },
  { type: 'stream-end', label: 'Stream Ende', icon: Tv },
];

export function IntroOutroPage() {
  const { user, activeDna, refreshUser } = useAuth();
  const [jobs, setJobs] = useState<MediaJob[]>([]);
  const [selectedType, setSelectedType] = useState<IntroOutroType>('intro');
  const [prompt, setPrompt] = useState('');
  const [title, setTitle] = useState('');
  const [currentJob, setCurrentJob] = useState<MediaJob | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.introOutro.list().then((r) => setJobs(r.jobs)).catch(() => {});
  }, [currentJob]);

  async function handleGenerate() {
    if (!activeDna) {
      setError('Erstelle zuerst eine Creator DNA');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.introOutro.generate(selectedType, prompt || undefined, title || undefined);
      setCurrentJob(res.job);
      await refreshUser();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Generierung fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }

  async function handleGeneratePack() {
    if (!activeDna) {
      setError('Erstelle zuerst eine Creator DNA');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.introOutro.generatePack();
      setJobs((prev) => [...res.jobs, ...prev]);
      setCurrentJob(res.jobs[0] ?? null);
      await refreshUser();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Paket-Generierung fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }

  const downloadUrl = getMediaDownloadUrl(currentJob);
  const exports = getMediaExports(currentJob);

  return (
    <StudioShell
      title="Intro & Outro Studio"
      description="Stream Intros, Outros, Starting-Soon und End-Screens"
      badge={<Badge variant="brand">UCBS</Badge>}
      actions={<Badge variant="default">{formatCoins(20)} / {formatCoins(50)} Paket</Badge>}
    >
      <div className="space-y-4">
        {!activeDna && <DnaRequiredBanner />}
        {error && <StudioErrorBanner message={error} />}
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Guthaben" value={formatCoins(user?.coinBalance ?? 0)} />
        <StatCard label="Generiert" value={jobs.length} icon={<Sparkles className="h-5 w-5" />} />
        <StatCard label="Provider" value={currentJob?.provider ?? '—'} />
      </div>

      <StudioWorkbench
        settings={
          <>
            <div className="grid grid-cols-2 gap-2">
              {TYPES.map(({ type, label, icon: Icon }) => (
                <TypeOptionButton
                  key={type}
                  active={selectedType === type}
                  onClick={() => setSelectedType(type)}
                  className="flex items-center gap-2"
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </TypeOptionButton>
              ))}
            </div>
            <Input className="mt-4" placeholder="Titel (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />
            <Input className="mt-2" placeholder="Prompt (optional)" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
          </>
        }
        preview={
          <>
            <NeonPreviewBox>
              <MediaJobPreview job={currentJob} />
            </NeonPreviewBox>
            {currentJob?.status === 'completed' && (
              <p className="mt-2 flex items-center gap-1 text-xs text-[var(--ucbs-accent-green)]">
                <CheckCircle2 className="h-3 w-3" />
                {currentJob.title} · {currentJob.provider}
                {currentJob.duration ? ` · ${currentJob.duration}s` : ''}
                {currentJob.videoUrl ? ' · MP4' : ''}
              </p>
            )}
          </>
        }
        actions={
          <>
            <Button
              className="gap-2"
              onClick={handleGenerate}
              loading={loading}
              disabled={!activeDna || (user?.coinBalance ?? 0) < 20}
            >
              <Sparkles className="h-4 w-4" />
              Generieren (20 Coins)
            </Button>
            <Button
              variant="outline"
              className="gap-2"
              onClick={handleGeneratePack}
              loading={loading}
              disabled={!activeDna || (user?.coinBalance ?? 0) < 50}
            >
              <Package className="h-4 w-4" />
              Komplett-Paket (50 Coins)
            </Button>
            {downloadUrl && (
              <>
                <a href={exports.mp4 || downloadUrl} download target="_blank" rel="noreferrer">
                  <Button variant="outline" size="sm" className="gap-2">
                    <Download className="h-4 w-4" />
                    MP4
                  </Button>
                </a>
                {exports.gif && (
                  <a href={exports.gif} download target="_blank" rel="noreferrer">
                    <Button variant="outline" size="sm" className="gap-2">
                      <Download className="h-4 w-4" />
                      GIF
                    </Button>
                  </a>
                )}
                {exports.webm && (
                  <a href={exports.webm} download target="_blank" rel="noreferrer">
                    <Button variant="outline" size="sm" className="gap-2">
                      <Download className="h-4 w-4" />
                      WEBM
                    </Button>
                  </a>
                )}
              </>
            )}
          </>
        }
      />

      {jobs.length > 0 && (
        <GlassCard accent="purple" className="mt-6 !p-5">
          <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-[var(--ucbs-accent-purple)]">
            Verlauf
          </h3>
          <MediaGalleryGrid className="mt-4">
            {jobs.slice(0, 8).map((job) => (
              <GalleryThumb
                key={job.id}
                onClick={() => setCurrentJob(job)}
                imageUrl={job.thumbnailUrl || job.imageUrl}
                label={job.title ?? job.type}
              />
            ))}
          </MediaGalleryGrid>
        </GlassCard>
      )}
    </StudioShell>
  );
}
