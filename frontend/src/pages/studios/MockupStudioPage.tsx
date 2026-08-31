import { useEffect, useMemo, useState } from 'react';
import {
  COIN_COSTS,
  CoinSpendCategory,
  MOCKUP_CATEGORIES,
  MOCKUP_COLORS,
  MOCKUP_MODELS,
  mockupColorHex,
  type MockupJob,
  type MockupPlacement,
  type MockupProductCategory,
} from '@ucbs/shared';
import { Download, FolderPlus, Share2 } from 'lucide-react';
import { StudioShell } from '@/v2/components/StudioShell';
import { StudioWorkbench } from '@/v2/components/StudioWorkbench';
import { StudioOptionPill } from '@/v2/components/StudioOptionPill';
import { Badge, Button } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { api, ApiError, type UserFile } from '@/services/api';
import { DnaRequiredBanner, StudioSuccessBanner } from '@/v2/components/StudioAlerts';
import { StudioErrorBanner } from '@/components/studio';
import { useNexterStore } from '@/v2/store/nexter-store';
import { useBrandProjectStore } from '@/v2/store/brand-project-store';
import { formatCoins } from '@/lib/utils';
import { GlassCard } from '@/v2/components/GlassCard';

const PLACEMENTS: { id: MockupPlacement; label: string }[] = [
  { id: 'front', label: 'Vorne' },
  { id: 'center', label: 'Mitte' },
  { id: 'wrap', label: 'Umlauf' },
  { id: 'corner', label: 'Ecke' },
];

const LIFESTYLE_CHIP = 'Zeig mir schwarze Tasse';
const LIFESTYLE_COST = COIN_COSTS[CoinSpendCategory.MOCKUP_GENERATION];

function productClip(category: MockupProductCategory): string {
  if (category === 'mug') return 'rounded-[28%]';
  if (category === 'phone') return 'rounded-[22%]';
  if (category === 'cap') return 'rounded-[50%]';
  if (category === 'poster') return 'rounded-sm';
  if (category === 'hoodie') return 'rounded-[18%]';
  if (category === 'tote') return 'rounded-b-[12%]';
  return 'rounded-[12%]';
}

function LiveMockupPreview({
  category,
  colorHex,
  designUrl,
  placement,
  scale,
  savedUrl,
}: {
  category: MockupProductCategory;
  colorHex: string;
  designUrl: string;
  placement: MockupPlacement;
  scale: number;
  savedUrl?: string;
}) {
  const align =
    placement === 'corner'
      ? 'items-start justify-end p-10'
      : placement === 'wrap'
        ? 'items-center justify-center px-6'
        : 'items-center justify-center';
  const mark = `${Math.max(40, Math.min(140, scale)) * 0.42}%`;

  return (
    <div
      data-testid="mockup-preview"
      className="relative mx-auto flex aspect-square max-h-[440px] w-full items-center justify-center overflow-hidden rounded-2xl bg-zinc-950"
    >
      {savedUrl ? (
        <img data-testid="mockup-result-image" src={savedUrl} alt="Mockup" className="h-full w-full object-contain" />
      ) : (
        <div className={`relative flex h-[78%] w-[62%] ${productClip(category)} ${align}`} style={{ background: colorHex }}>
          {category === 'mug' && (
            <div
              className="absolute -right-8 top-1/4 h-1/2 w-10 rounded-r-full border-[10px]"
              style={{ borderColor: colorHex }}
            />
          )}
          {designUrl ? (
            <img
              src={designUrl}
              alt="Design"
              className="object-contain drop-shadow-lg"
              style={{ width: mark, height: mark }}
            />
          ) : (
            <span className="text-xs text-zinc-600">Kein Design</span>
          )}
        </div>
      )}
    </div>
  );
}

export function MockupStudioPage() {
  const { activeDna, refreshUser } = useAuth();
  const pulse = useNexterStore((s) => s.pulse);
  const queueNexterPrompt = useNexterStore((s) => s.queueNexterPrompt);
  const projectId = useBrandProjectStore((s) => s.activeProjectId);
  const [category, setCategory] = useState<MockupProductCategory>('mug');
  const [colorId, setColorId] = useState('white');
  const [modelLabel, setModelLabel] = useState(MOCKUP_MODELS.mug[0]);
  const [placement, setPlacement] = useState<MockupPlacement>('front');
  const [scale, setScale] = useState(100);
  const [designUrl, setDesignUrl] = useState('');
  const [jobs, setJobs] = useState<MockupJob[]>([]);
  const [current, setCurrent] = useState<MockupJob | null>(null);
  const [files, setFiles] = useState<UserFile[]>([]);
  const [logoUrls, setLogoUrls] = useState<string[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [saveProjectId, setSaveProjectId] = useState(projectId ?? '');
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const models = MOCKUP_MODELS[category];

  useEffect(() => {
    setModelLabel((prev) => (models.includes(prev) ? prev : models[0]));
  }, [category, models]);

  useEffect(() => {
    void refreshUser();
    api.mockups.list().then((r) => setJobs(r.jobs)).catch(() => {});
    api.files.list().then((r) => setFiles(r.files.filter((f) => f.mimeType.startsWith('image/')))).catch(() => {});
    api.ai
      .listJobs()
      .then((r) =>
        setLogoUrls(
          r.jobs.filter((j) => j.module === 'logo' && j.status === 'completed' && j.imageUrl).map((j) => j.imageUrl!)
        )
      )
      .catch(() => {});
    api.projects
      .list()
      .then((r) => {
        setProjects(r.projects.map((p) => ({ id: p.id, name: p.name })));
        if (!saveProjectId && (projectId || r.projects[0])) {
          setSaveProjectId(projectId ?? r.projects[0]!.id);
        }
      })
      .catch(() => {});
  }, [activeDna?.id, projectId, refreshUser]);

  useEffect(() => {
    const fromDna = activeDna?.sourceAssets?.find((a) => a.url)?.url;
    if (fromDna && !designUrl) setDesignUrl(fromDna);
  }, [activeDna, designUrl]);

  const dnaAssets = activeDna?.sourceAssets?.filter((a) => a.url) ?? [];
  const colorHex = mockupColorHex(colorId);
  const previewSaved =
    current?.imageUrl &&
    current.category === category &&
    current.colorId === colorId &&
    current.placement === placement
      ? current.imageUrl
      : undefined;
  const variants = jobs.filter((j) => j.imageUrl && !j.lifestyle).slice(0, 8);
  const lifestyleJobs = jobs.filter((j) => j.imageUrl && j.lifestyle).slice(0, 4);

  async function pickFile(file: UserFile) {
    try {
      const full = await api.files.get(file.id);
      setDesignUrl(full.file.dataUrl || file.downloadUrl || '');
    } catch {
      if (file.downloadUrl) setDesignUrl(file.downloadUrl);
    }
  }

  async function saveComposite() {
    if (!designUrl) {
      setError('Wähle zuerst ein Design (DNA, Files oder URL).');
      return;
    }
    setLoading(true);
    setError(null);
    setStatus(null);
    pulse('generating', 8000);
    try {
      const res = await api.mockups.generate({
        category,
        colorId,
        modelLabel,
        placement,
        scalePercent: scale,
        designUrl,
        lifestyle: false,
        projectId: projectId ?? undefined,
      });
      setCurrent(res.job);
      setJobs((prev) => [res.job, ...prev.filter((j) => j.id !== res.job.id)]);
      setStatus('Composite gespeichert — ohne KI, ohne Coins.');
      pulse('success');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Mockup fehlgeschlagen');
      pulse('warning');
    } finally {
      setLoading(false);
    }
  }

  async function downloadCurrent() {
    const url = current?.imageUrl;
    if (!url) {
      setError('Zuerst ein Composite speichern.');
      return;
    }
    const a = document.createElement('a');
    a.href = url;
    a.download = `mockup-${current.category}-${current.colorId}.svg`;
    a.click();
  }

  async function shareCurrent() {
    const url = current?.imageUrl;
    if (!url) return;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Mockup', url: url.startsWith('http') ? url : undefined });
      }
      await navigator.clipboard.writeText(url);
      setStatus('Link in die Zwischenablage kopiert.');
    } catch {
      setStatus('Teilen abgebrochen.');
    }
  }

  async function saveToFiles() {
    if (!current?.id) return;
    setLoading(true);
    setError(null);
    try {
      await api.mockups.saveFile(current.id);
      setStatus('In Files gespeichert.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Speichern in Files fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }

  async function saveToProject() {
    if (!current?.id || !saveProjectId) {
      setError('Wähle ein Projekt zum Speichern.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await api.mockups.saveProject(current.id, saveProjectId);
      setStatus('Im Projekt gespeichert.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Speichern im Projekt fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }

  const galleryCats = useMemo(
    () => MOCKUP_CATEGORIES.filter((c) => c.id !== category).slice(0, 6),
    [category]
  );

  return (
    <StudioShell
      title="Mockup Studio"
      description="Dein Design auf Tassen, Shirts und mehr — lokales Composite ohne KI. Lifestyle-Fotos nur über Nexter."
      badge={<Badge variant="brand">Produkt-Composite</Badge>}
      nexterHint="Zeig mir schwarze Tasse"
      actions={
        <Badge variant="default">Lifestyle-AI {formatCoins(LIFESTYLE_COST)} Coins via Nexter</Badge>
      }
    >
      <div className="space-y-4" data-testid="mockup-wizard">
        {!activeDna && <DnaRequiredBanner />}
        {error && <StudioErrorBanner message={error} />}
        {status && <StudioSuccessBanner>{status}</StudioSuccessBanner>}
        {current?.imageUrl && !status && (
          <StudioSuccessBanner>Mockup bereit — Download, Files oder Projekt.</StudioSuccessBanner>
        )}

        <div className="flex flex-wrap gap-2" data-testid="mockup-tabs">
          {MOCKUP_CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              data-testid={`mockup-tab-${c.id}`}
              onClick={() => setCategory(c.id)}
              className={`rounded-full px-3 py-1.5 text-sm ${
                category === c.id
                  ? 'bg-violet-600 text-white'
                  : 'border border-white/10 text-zinc-400 hover:border-white/20'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <StudioWorkbench
        settingsTitle="Design & Produkt"
        previewTitle="Live-Vorschau"
        settings={
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">1. Design wählen</p>
            {designUrl ? (
              <img src={designUrl} alt="Design" className="mx-auto h-24 object-contain" />
            ) : (
              <p className="text-sm text-zinc-500">Kein Logo in der DNA — Files, Logo-Job oder URL nutzen.</p>
            )}
            {dnaAssets.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {dnaAssets.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setDesignUrl(a.url)}
                    className={`overflow-hidden rounded-lg border ${designUrl === a.url ? 'border-violet-500' : 'border-white/10'}`}
                  >
                    <img src={a.url} alt="" className="h-12 w-12 object-contain" />
                  </button>
                ))}
              </div>
            )}
            {files.length > 0 && (
              <div>
                <p className="mb-1 text-[11px] text-zinc-500">File Cloud</p>
                <div className="flex flex-wrap gap-2">
                  {files.slice(0, 8).map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => void pickFile(f)}
                      className="rounded-lg border border-white/10 px-2 py-1 text-[11px] text-zinc-300"
                    >
                      {f.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {logoUrls.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {logoUrls.slice(0, 4).map((url) => (
                  <button key={url} type="button" onClick={() => setDesignUrl(url)} className="overflow-hidden rounded-lg border border-white/10">
                    <img src={url} alt="" className="h-12 w-12 object-contain" />
                  </button>
                ))}
              </div>
            )}
            <input
              data-testid="mockup-design-url"
              className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs text-white"
              placeholder="Design-URL oder data:image/…"
              value={designUrl}
              onChange={(e) => setDesignUrl(e.target.value)}
            />

            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">2. Produkt anpassen</p>
            <div className="flex flex-wrap gap-2">
              {MOCKUP_COLORS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  title={c.label}
                  data-testid={`mockup-color-${c.id}`}
                  onClick={() => setColorId(c.id)}
                  className={`h-7 w-7 rounded-full border ${colorId === c.id ? 'ring-2 ring-violet-400' : 'border-white/20'}`}
                  style={{ background: c.hex }}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {models.map((m) => (
                <StudioOptionPill key={m} active={modelLabel === m} onClick={() => setModelLabel(m)}>
                  {m}
                </StudioOptionPill>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {PLACEMENTS.map((p) => (
                <StudioOptionPill key={p.id} active={placement === p.id} onClick={() => setPlacement(p.id)}>
                  {p.label}
                </StudioOptionPill>
              ))}
            </div>
            <label className="block text-xs text-zinc-400">
              Größe {scale}%
              <input
                type="range"
                min={40}
                max={140}
                value={scale}
                onChange={(e) => setScale(Number(e.target.value))}
                className="mt-1 w-full"
              />
            </label>

            <Button
              data-testid="mockup-save-composite"
              onClick={() => void saveComposite()}
              disabled={loading || !designUrl}
            >
              {loading ? 'Speichere …' : 'Mockup speichern (kostenlos)'}
            </Button>

            <button
              type="button"
              data-testid="mockup-nexter-chip"
              onClick={() => queueNexterPrompt(LIFESTYLE_CHIP)}
              className="w-full rounded-full border border-violet-500/40 bg-violet-500/10 px-3 py-2 text-sm text-violet-200"
            >
              Nexter: „{LIFESTYLE_CHIP}“ · {LIFESTYLE_COST} Coins
            </button>
            <p className="text-[11px] text-zinc-500">
              Lifestyle-AI startet erst nach Nexter-Angebot und Klick auf Erstellen. Kein Direkt-POST.
            </p>
          </div>
        }
        preview={
          <LiveMockupPreview
            category={category}
            colorHex={colorHex}
            designUrl={designUrl}
            placement={placement}
            scale={scale}
            savedUrl={previewSaved}
          />
        }
        actions={
          current?.imageUrl ? (
            <>
              <Button variant="outline" size="sm" data-testid="mockup-download" onClick={() => void downloadCurrent()}>
                <Download className="mr-1 h-4 w-4" />
                Herunterladen
              </Button>
              <Button variant="outline" size="sm" data-testid="mockup-share" onClick={() => void shareCurrent()}>
                <Share2 className="mr-1 h-4 w-4" />
                Teilen
              </Button>
              <Button variant="outline" size="sm" data-testid="mockup-save-file" onClick={() => void saveToFiles()}>
                In Files
              </Button>
              <div className="flex items-center gap-2">
                <select
                  data-testid="mockup-project-select"
                  className="rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-xs text-white"
                  value={saveProjectId}
                  onChange={(e) => setSaveProjectId(e.target.value)}
                >
                  <option value="">Projekt wählen</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <Button
                  variant="outline"
                  size="sm"
                  data-testid="mockup-save-project"
                  disabled={!saveProjectId}
                  onClick={() => void saveToProject()}
                >
                  <FolderPlus className="mr-1 h-4 w-4" />
                  Projekt
                </Button>
              </div>
            </>
          ) : null
        }
        history={
          <div className="space-y-4">
            <div data-testid="mockup-variants">
              <p className="mb-2 text-xs uppercase tracking-wider text-zinc-500">Varianten</p>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
                {MOCKUP_COLORS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setColorId(c.id)}
                    className={`overflow-hidden rounded-lg border ${colorId === c.id ? 'border-violet-500' : 'border-white/10'}`}
                    title={c.label}
                  >
                    <div className="flex h-16 items-center justify-center" style={{ background: c.hex }}>
                      {designUrl ? <img src={designUrl} alt="" className="h-8 w-8 object-contain" /> : null}
                    </div>
                  </button>
                ))}
              </div>
              {variants.length > 0 && (
                <div className="mt-3 grid grid-cols-4 gap-2">
                  {variants.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => {
                        setCurrent(v);
                        setCategory(v.category);
                        setColorId(v.colorId);
                        setPlacement(v.placement);
                        setScale(v.scalePercent);
                      }}
                      className={`overflow-hidden rounded-lg border ${current?.id === v.id ? 'border-violet-500' : 'border-white/10'}`}
                    >
                      <img src={v.imageUrl} alt="" className="h-16 w-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div data-testid="mockup-gallery">
              <p className="mb-2 text-xs uppercase tracking-wider text-zinc-500">Weitere Produkte</p>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {galleryCats.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    data-testid={`mockup-gallery-${c.id}`}
                    onClick={() => setCategory(c.id)}
                    className="w-28 shrink-0 overflow-hidden rounded-xl border border-white/10"
                  >
                    <div className={`mx-auto mt-3 h-16 w-14 ${productClip(c.id)}`} style={{ background: colorHex }} />
                    <p className="px-2 py-2 text-center text-[11px] text-zinc-400">{c.label}</p>
                  </button>
                ))}
              </div>
            </div>

            {lifestyleJobs.length > 0 && (
              <GlassCard accent="purple" className="!p-4">
                <p className="mb-2 text-xs uppercase tracking-wider text-zinc-500">Lifestyle-AI</p>
                <div className="grid grid-cols-4 gap-2">
                  {lifestyleJobs.map((v) => (
                    <button key={v.id} type="button" onClick={() => setCurrent(v)} className="overflow-hidden rounded-lg border border-white/10">
                      <img src={v.imageUrl} alt="" className="h-16 w-full object-cover" />
                    </button>
                  ))}
                </div>
              </GlassCard>
            )}
          </div>
        }
      />
    </StudioShell>
  );
}
