import { useEffect, useState } from 'react';
import {
  PageHeader, Badge, Button, NeonCard, Input, StatCard,
} from '@/components/ui';
import {
  Smile, User, Heart, Sparkles, CheckCircle2, Download, Package,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { api, ApiError, type MediaJob, type VTuberType } from '@/services/api';
import { formatCoins } from '@/lib/utils';
import { MediaJobPreview, getMediaDownloadUrl } from '@/components/media/MediaJobPreview';
import {
  DnaRequiredBanner,
  StudioErrorBanner,
  TypeOptionButton,
  NeonPreviewBox,
  MediaGalleryGrid,
  GalleryThumb,
  VtuberPipeline,
} from '@/components/studio';

const TYPES: { type: VTuberType; label: string; icon: typeof User }[] = [
  { type: 'vtuber-character', label: 'Charakter', icon: User },
  { type: 'vtuber-avatar', label: 'Avatar', icon: Smile },
  { type: 'vtuber-emote', label: 'Emote', icon: Heart },
];

export function VTuberStudioPage() {
  const { user, activeDna, refreshUser } = useAuth();
  const [characters, setCharacters] = useState<MediaJob[]>([]);
  const [selectedType, setSelectedType] = useState<VTuberType>('vtuber-character');
  const [prompt, setPrompt] = useState('');
  const [title, setTitle] = useState('');
  const [currentJob, setCurrentJob] = useState<MediaJob | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.vtuber.list().then((r) => setCharacters(r.characters)).catch(() => {});
  }, [currentJob]);

  async function handleGenerate() {
    if (!activeDna) {
      setError('Erstelle zuerst eine Creator DNA');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.vtuber.generate(selectedType, prompt || undefined, title || undefined);
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
      const res = await api.vtuber.generatePack();
      setCharacters((prev) => [...res.jobs, ...prev]);
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
        title="VTuber Studio"
        description="Logo → Mascot → VTuber Model — Charaktere, Avatare und Emotes"
        badge={<Badge variant="brand">UCBS</Badge>}
        actions={<Badge variant="default">{formatCoins(5)} / {formatCoins(50)} Paket</Badge>}
      />

      <VtuberPipeline />

      {!activeDna && <DnaRequiredBanner />}
      {error && <StudioErrorBanner message={error} />}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Guthaben" value={formatCoins(user?.coinBalance ?? 0)} />
        <StatCard label="Charaktere" value={characters.length} icon={<Smile className="h-5 w-5" />} />
        <StatCard label="Provider" value={currentJob?.provider ?? '—'} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <NeonCard accent="cyan" title="Asset-Typ">
          <div className="grid grid-cols-3 gap-2">
            {TYPES.map(({ type, label, icon: Icon }) => (
              <TypeOptionButton
                key={type}
                active={selectedType === type}
                onClick={() => setSelectedType(type)}
                className="flex flex-col items-center gap-1"
              >
                <Icon className="h-5 w-5" />
                {label}
              </TypeOptionButton>
            ))}
          </div>
          <Input className="mt-4" placeholder="Name (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Input className="mt-2" placeholder="Prompt (optional)" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
          <Button
            className="mt-4 w-full gap-2"
            onClick={handleGenerate}
            loading={loading}
            disabled={!activeDna || (user?.coinBalance ?? 0) < 5}
          >
            <Sparkles className="h-4 w-4" />
            Generieren (5 Coins)
          </Button>
          <Button
            variant="outline"
            className="mt-2 w-full gap-2"
            onClick={handleGeneratePack}
            loading={loading}
            disabled={!activeDna || (user?.coinBalance ?? 0) < 50}
          >
            <Package className="h-4 w-4" />
            VTuber Paket (50 Coins)
          </Button>
        </NeonCard>

        <NeonCard accent="magenta" title="Vorschau">
          <NeonPreviewBox aspect="square" className="mt-2">
            <MediaJobPreview job={currentJob} emptyLabel="Noch kein Charakter generiert" className="h-full w-full" />
          </NeonPreviewBox>
          {currentJob?.status === 'completed' && (
            <p className="mt-2 flex items-center gap-1 text-xs text-emerald-400">
              <CheckCircle2 className="h-3 w-3" />
              {currentJob.title} · {currentJob.provider}
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

      {characters.length > 0 && (
        <NeonCard accent="purple" className="mt-6" title="Galerie">
          <MediaGalleryGrid className="mt-2 sm:grid-cols-3">
            {characters.slice(0, 12).map((job) => (
              <GalleryThumb
                key={job.id}
                onClick={() => setCurrentJob(job)}
                imageUrl={job.imageUrl}
                label={job.title ?? job.type}
              />
            ))}
          </MediaGalleryGrid>
        </NeonCard>
      )}
    </div>
  );
}
