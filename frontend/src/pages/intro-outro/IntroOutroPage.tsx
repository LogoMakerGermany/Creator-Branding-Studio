import { useEffect, useState } from 'react';
import {
  PageHeader, Badge, Button, NeonCard, Input, StatCard,
} from '@/components/ui';
import {
  Play, Square, Radio, Tv, Sparkles, CheckCircle2, Download, Package,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { api, ApiError, type MediaJob, type IntroOutroType } from '@/services/api';
import { formatCoins } from '@/lib/utils';
import { MediaJobPreview, getMediaDownloadUrl } from '@/components/media/MediaJobPreview';
import {
  DnaRequiredBanner,
  StudioErrorBanner,
  TypeOptionButton,
  NeonPreviewBox,
  MediaGalleryGrid,
  GalleryThumb,
} from '@/components/studio';

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

  return (
    <div>
      <PageHeader
        title="Intro / Outro Generator"
        description="Stream Intros, Outros, Starting-Soon und End-Screens"
        badge={<Badge variant="brand">UCBS</Badge>}
        actions={<Badge variant="default">{formatCoins(20)} / {formatCoins(50)} Paket</Badge>}
      />

      {!activeDna && <DnaRequiredBanner />}
      {error && <StudioErrorBanner message={error} />}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Guthaben" value={formatCoins(user?.coinBalance ?? 0)} />
        <StatCard label="Generiert" value={jobs.length} icon={<Sparkles className="h-5 w-5" />} />
        <StatCard label="Provider" value={currentJob?.provider ?? '—'} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <NeonCard accent="cyan" title="Typ wählen">
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
          <Button
            className="mt-4 w-full gap-2"
            onClick={handleGenerate}
            loading={loading}
            disabled={!activeDna || (user?.coinBalance ?? 0) < 20}
          >
            <Sparkles className="h-4 w-4" />
            Generieren (20 Coins)
          </Button>
          <Button
            variant="outline"
            className="mt-2 w-full gap-2"
            onClick={handleGeneratePack}
            loading={loading}
            disabled={!activeDna || (user?.coinBalance ?? 0) < 50}
          >
            <Package className="h-4 w-4" />
            Komplett-Paket (50 Coins)
          </Button>
        </NeonCard>

        <NeonCard accent="magenta" title="Vorschau">
          <NeonPreviewBox className="mt-2">
            <MediaJobPreview job={currentJob} />
          </NeonPreviewBox>
          {currentJob?.status === 'completed' && (
            <p className="mt-2 flex items-center gap-1 text-xs text-emerald-400">
              <CheckCircle2 className="h-3 w-3" />
              {currentJob.title} · {currentJob.provider}
              {currentJob.duration ? ` · ${currentJob.duration}s` : ''}
              {currentJob.videoUrl ? ' · MP4' : ''}
            </p>
          )}
          {downloadUrl && (
            <a href={downloadUrl} download target="_blank" rel="noreferrer">
              <Button variant="outline" className="mt-3 w-full gap-2" size="sm">
                <Download className="h-4 w-4" />
                Herunterladen
              </Button>
            </a>
          )}
        </NeonCard>
      </div>

      {jobs.length > 0 && (
        <NeonCard accent="purple" className="mt-6" title="Verlauf">
          <MediaGalleryGrid className="mt-2">
            {jobs.slice(0, 8).map((job) => (
              <GalleryThumb
                key={job.id}
                onClick={() => setCurrentJob(job)}
                imageUrl={job.thumbnailUrl || job.imageUrl}
                label={job.title ?? job.type}
              />
            ))}
          </MediaGalleryGrid>
        </NeonCard>
      )}
    </div>
  );
}
