import { useEffect, useState } from 'react';
import { PageHeader, Badge, Button, NeonCard, Input, StatCard } from '@/components/ui';
import { Video, Sparkles, CheckCircle2, Download, History } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { api, ApiError, type MediaJob } from '@/services/api';
import { formatCoins } from '@/lib/utils';
import { MediaJobPreview, getMediaDownloadUrl } from '@/components/media/MediaJobPreview';
import {
  DnaRequiredBanner,
  StudioErrorBanner,
  NeonPreviewBox,
  MediaGalleryGrid,
  GalleryThumb,
} from '@/components/studio';

export function AIVideoPage() {
  const { user, activeDna, refreshUser } = useAuth();
  const [prompt, setPrompt] = useState('');
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentJob, setCurrentJob] = useState<MediaJob | null>(null);
  const [history, setHistory] = useState<MediaJob[]>([]);

  useEffect(() => {
    api.aiVideo.list().then((r) => setHistory(r.jobs)).catch(() => {});
  }, [currentJob]);

  async function handleGenerate() {
    if (!activeDna) {
      setError('Erstelle zuerst eine Creator DNA');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.aiVideo.generate(prompt || undefined, title || undefined, 30);
      setCurrentJob(res.job);
      await refreshUser();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Generierung fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }

  const downloadUrl = getMediaDownloadUrl(currentJob);

  return (
    <div>
      <PageHeader
        title="KI Video Generator"
        description="Werbevideos, Shorts und Social Media Clips basierend auf deiner Creator DNA"
        badge={<Badge variant="brand">Runway · Replicate</Badge>}
        actions={<Badge variant="default">{formatCoins(25)} Coins</Badge>}
      />

      {!activeDna && <DnaRequiredBanner />}
      {error && <StudioErrorBanner message={error} />}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Guthaben" value={formatCoins(user?.coinBalance ?? 0)} />
        <StatCard label="Videos" value={history.length} icon={<History className="h-5 w-5" />} />
        <StatCard label="Provider" value={currentJob?.provider ?? '—'} icon={<Video className="h-5 w-5" />} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <NeonCard accent="cyan" title="Video-Konzept">
          <Input className="mt-1" placeholder="Titel (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Input
            className="mt-2"
            placeholder="z.B. Hype-Trailer für neuen Stream..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
          <p className="mt-2 text-xs text-zinc-500">
            Generiert echte MP4-Videos via Runway oder Replicate.
          </p>
          <Button
            className="mt-4 w-full gap-2"
            onClick={handleGenerate}
            loading={loading}
            disabled={!activeDna || (user?.coinBalance ?? 0) < 25}
          >
            <Sparkles className="h-4 w-4" />
            Video generieren (25 Coins)
          </Button>
        </NeonCard>

        <NeonCard accent="magenta" title="Vorschau">
          <NeonPreviewBox className="mt-2">
            <MediaJobPreview job={currentJob} emptyLabel="Noch kein Video generiert" />
          </NeonPreviewBox>
          {currentJob?.status === 'completed' && (
            <p className="mt-2 flex items-center gap-1 text-xs text-emerald-400">
              <CheckCircle2 className="h-3 w-3" />
              {currentJob.metadata?.format ? String(currentJob.metadata.format) : '16:9'} · {currentJob.provider}
              {currentJob.videoUrl ? ' · MP4' : ''}
            </p>
          )}
          {downloadUrl && (
            <a href={downloadUrl} download target="_blank" rel="noreferrer">
              <Button variant="outline" className="mt-3 w-full gap-2" size="sm">
                <Download className="h-4 w-4" />
                {currentJob?.videoUrl ? 'Video herunterladen' : 'Thumbnail herunterladen'}
              </Button>
            </a>
          )}
        </NeonCard>
      </div>

      {history.length > 0 && (
        <NeonCard accent="purple" className="mt-6" title="Verlauf">
          <MediaGalleryGrid className="mt-2 sm:grid-cols-3">
            {history.slice(0, 6).map((job) => (
              <GalleryThumb
                key={job.id}
                onClick={() => setCurrentJob(job)}
                imageUrl={job.thumbnailUrl || job.imageUrl}
                label={job.title ?? 'KI Video'}
              />
            ))}
          </MediaGalleryGrid>
        </NeonCard>
      )}
    </div>
  );
}
