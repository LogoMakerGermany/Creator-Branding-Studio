import { useEffect, useState } from 'react';
import { Badge, Button, Input, StatCard } from '@/components/ui';
import {
  Play, Square, Radio, Tv, Sparkles, CheckCircle2, Download,
} from 'lucide-react';
import { COIN_COSTS, CoinSpendCategory } from '@ucbs/shared';
import { useAuth } from '@/context/AuthContext';
import { api, type MediaJob, type IntroOutroType } from '@/services/api';
import { formatCoins } from '@/lib/utils';
import { useNexterStore } from '@/v2/store/nexter-store';
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

const ANIM_COST = COIN_COSTS[CoinSpendCategory.ANIMATION_GENERATION];
const OVERLAY_COST = COIN_COSTS[CoinSpendCategory.OVERLAY_GENERATION];

const TYPES: { type: IntroOutroType; label: string; icon: typeof Play }[] = [
  { type: 'intro', label: 'Intro', icon: Play },
  { type: 'outro', label: 'Outro', icon: Square },
  { type: 'stream-start', label: 'Starting Soon', icon: Radio },
  { type: 'stream-end', label: 'Stream Ende', icon: Tv },
];

function isScreenType(type: IntroOutroType): boolean {
  return type === 'stream-start' || type === 'stream-end';
}

export function IntroOutroPage() {
  const { user, activeDna } = useAuth();
  const queueNexterPrompt = useNexterStore((s) => s.queueNexterPrompt);
  const [jobs, setJobs] = useState<MediaJob[]>([]);
  const [selectedType, setSelectedType] = useState<IntroOutroType>('intro');
  const [screenMode, setScreenMode] = useState<'static' | 'animated'>('static');
  const [prompt, setPrompt] = useState('');
  const [title, setTitle] = useState('');
  const [currentJob, setCurrentJob] = useState<MediaJob | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const screenSelected = isScreenType(selectedType);
  const coinCost = screenSelected && screenMode === 'static' ? OVERLAY_COST : ANIM_COST;

  useEffect(() => {
    api.introOutro.list().then((r) => setJobs(r.jobs)).catch(() => {});
  }, [currentJob]);

  function nexterPrompt(): string {
    if (selectedType === 'intro') return 'Erstelle ein Intro für meinen Stream.';
    if (selectedType === 'outro') return 'Erstelle ein Outro für meinen Stream.';
    if (selectedType === 'stream-start') {
      return screenMode === 'animated'
        ? 'Erstelle einen animierten Starting-Soon-Screen.'
        : 'Erstelle einen normalen Starting-Soon-Screen.';
    }
    return screenMode === 'animated'
      ? 'Erstelle einen animierten Endscreen.'
      : 'Erstelle einen normalen Ending-Screen.';
  }

  async function handleGenerate() {
    if (!activeDna) {
      setError('Erstelle zuerst eine Creator DNA');
      return;
    }
    setLoading(true);
    setError(
      screenSelected && screenMode === 'static'
        ? 'Starting Soon / Ending als Bild startet nur über Nexter nach Bestätigung.'
        : 'Intro/Outro startet nur über Nexter nach Bestätigung (Für X Coins erstellen).'
    );
    queueNexterPrompt(prompt.trim() ? `${nexterPrompt()} ${prompt.trim()}` : nexterPrompt());
    setLoading(false);
  }

  const downloadUrl = getMediaDownloadUrl(currentJob);
  const exports = getMediaExports(currentJob);

  return (
    <StudioShell
      title="Intro & Outro Studio"
      description="Animierte Intros und Outros (25 Coins). Starting Soon / Ending als Bild (12) oder Animation (25)."
      badge={<Badge variant="brand">NEXTER</Badge>}
      actions={<Badge variant="default">{formatCoins(coinCost)}</Badge>}
    >
      <div className="space-y-4">
        {!activeDna && <DnaRequiredBanner />}
        {error && <StudioErrorBanner message={error} />}
        <p className="text-xs text-zinc-500">
          KI-Video und Animation starten erst nach Nexter-Bestätigung. Ohne Video-Provider werden keine Coins abgebucht. Generierte Animationen: 2–10 Sekunden (ganze Zahlen, Standard 5).
        </p>
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
            {screenSelected && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <TypeOptionButton
                  active={screenMode === 'static'}
                  onClick={() => setScreenMode('static')}
                >
                  Bild · {OVERLAY_COST} Coins
                </TypeOptionButton>
                <TypeOptionButton
                  active={screenMode === 'animated'}
                  onClick={() => setScreenMode('animated')}
                >
                  Animiert · {ANIM_COST} Coins
                </TypeOptionButton>
              </div>
            )}
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
              disabled={!activeDna || (user?.coinBalance ?? 0) < coinCost}
            >
              <Sparkles className="h-4 w-4" />
              Angebot anfragen ({coinCost} Coins)
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
