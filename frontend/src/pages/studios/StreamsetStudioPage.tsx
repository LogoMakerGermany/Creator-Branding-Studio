import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Layers } from 'lucide-react';
import { STREAMSET_PACK_COIN_COST, STREAMSET_TABS, type StreamsetTab } from '@ucbs/shared';
import { StudioShell } from '@/v2/components/StudioShell';
import { StudioWorkbench } from '@/v2/components/StudioWorkbench';
import { Button } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { api, ApiError, type GenerationJob, type StreamsetStatus } from '@/services/api';
import { DnaRequiredBanner, StudioSuccessBanner } from '@/v2/components/StudioAlerts';
import { StudioErrorBanner } from '@/components/studio';
import { StudioOptionPill } from '@/v2/components/StudioOptionPill';
import { useNexterStore } from '@/v2/store/nexter-store';
import { useBrandProjectStore } from '@/v2/store/brand-project-store';
import { formatCoins } from '@/lib/utils';
import { GlassCard } from '@/v2/components/GlassCard';

const PACK_COST = STREAMSET_PACK_COIN_COST;

export function StreamsetStudioPage() {
  const { user, activeDna, refreshUser } = useAuth();
  const pulse = useNexterStore((s) => s.pulse);
  const projectId = useBrandProjectStore((s) => s.activeProjectId);
  const [status, setStatus] = useState<StreamsetStatus | null>(null);
  const [tab, setTab] = useState<StreamsetTab>('screens');
  const [jobs, setJobs] = useState<GenerationJob[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingKey, setLoadingKey] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const next = await api.streamset.status(projectId ?? undefined);
      setStatus(next);
      if (next.jobs?.length) {
        setJobs((prev) => {
          const byId = new Map(prev.map((j) => [j.id, j]));
          for (const job of next.jobs) byId.set(job.id, job);
          return [...byId.values()].sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
        });
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Streamset-Status nicht ladbar');
    }
  }, [projectId]);

  useEffect(() => {
    void refreshUser();
    void loadStatus();
  }, [loadStatus, activeDna?.id, refreshUser]);

  const dnaName = status?.dna?.name ?? activeDna?.name;
  const missing = status?.missing ?? [];
  const tabAssets = useMemo(
    () => (status?.assets ?? []).filter((a) => a.tab === tab),
    [status, tab]
  );
  const completedCount = (status?.assets ?? []).filter((a) => a.present).length;
  const totalCount = status?.assets?.length ?? 12;
  const hasImages = jobs.some((j) => j.imageUrl);
  const canPayPack = (user?.coinBalance ?? 0) >= PACK_COST;

  async function runPack() {
    setLoading(true);
    setLoadingKey('pack');
    setError(null);
    pulse('generating', 60000);
    try {
      const res = await api.streamset.pack(projectId ?? undefined);
      setJobs(res.jobs);
      await refreshUser();
      await loadStatus();
      pulse('success');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Streamset fehlgeschlagen');
      pulse('warning');
      await refreshUser();
      await loadStatus();
    } finally {
      setLoading(false);
      setLoadingKey(null);
    }
  }

  async function runAsset(assetKey: string) {
    setLoading(true);
    setLoadingKey(assetKey);
    setError(null);
    pulse('generating', 30000);
    try {
      const res = await api.streamset.asset({ assetKey, projectId: projectId ?? undefined });
      setJobs((prev) => [res.job, ...prev]);
      await refreshUser();
      await loadStatus();
      pulse('success');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Asset fehlgeschlagen');
      pulse('warning');
      await refreshUser();
    } finally {
      setLoading(false);
      setLoadingKey(null);
    }
  }

  const wizardStep = !dnaName ? 1 : hasImages || completedCount > 0 ? 3 : 2;

  return (
    <StudioShell
      title="Streamset Studio"
      description="Aus Creator DNA das komplette Stream-Set — Overlay, Banner, Facecam und Sticker über die echten Generatoren"
      coinCost={PACK_COST}
      nexterHint="Soll ich dir daraus ein vollständiges Streamset erstellen?"
    >
      <div className="space-y-4" data-testid="streamset-wizard">
        {!activeDna && !status?.dna && <DnaRequiredBanner />}
        {error && <StudioErrorBanner message={error} />}
        {hasImages && (
          <StudioSuccessBanner>
            <span className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5" />
              {completedCount}/{totalCount} Set-Teile vorhanden.
            </span>
          </StudioSuccessBanner>
        )}

        <ol className="flex flex-wrap gap-2 text-xs uppercase tracking-wider text-zinc-500">
          <li className={wizardStep >= 1 ? 'text-[var(--ucbs-accent-cyan)]' : ''} data-testid="streamset-step-dna">
            1. DNA
          </li>
          <li className={wizardStep >= 2 ? 'text-[var(--ucbs-accent-cyan)]' : ''}>2. Paket</li>
          <li className={wizardStep >= 3 ? 'text-[var(--ucbs-accent-cyan)]' : ''}>3. Ergebnis</li>
        </ol>
      </div>

      <StudioWorkbench
        settingsTitle="DNA & fehlende Teile"
        previewTitle="Set-Vorschau"
        settings={
          <div className="space-y-4">
            <div data-testid="streamset-dna-name">
              <p className="text-xs uppercase tracking-wider text-zinc-500">Creator DNA</p>
              {dnaName ? (
                <p className="mt-1 text-sm text-white">
                  {dnaName}
                  {status?.dna?.source === 'project' && status.projectName
                    ? ` · Projekt ${status.projectName}`
                    : ''}
                </p>
              ) : (
                <p className="mt-1 text-sm text-zinc-400">Noch keine DNA — zuerst anlegen.</p>
              )}
              {status?.dna?.primaryColors?.length ? (
                <div className="mt-2 flex gap-1">
                  {status.dna.primaryColors.slice(0, 6).map((c) => (
                    <span
                      key={c}
                      className="h-5 w-5 rounded-full border border-white/20"
                      style={{ background: c }}
                      title={c}
                    />
                  ))}
                </div>
              ) : null}
            </div>

            <div data-testid="streamset-missing">
              <p className="text-xs uppercase tracking-wider text-zinc-500">Checkliste</p>
              <ul className="mt-2 space-y-1 text-sm">
                {(status?.assets ?? []).map((asset) => (
                  <li key={asset.key} className="flex items-center justify-between gap-2">
                    <span className={asset.present ? 'text-emerald-300' : 'text-zinc-400'}>
                      {asset.present ? '✓' : '○'} {asset.label}
                    </span>
                    {!asset.present && (
                      <span className="text-[10px] text-zinc-600">{formatCoins(asset.coinCost)}</span>
                    )}
                  </li>
                ))}
              </ul>
              {missing.length > 0 && (
                <p className="mt-2 text-xs text-zinc-500">
                  Es fehlen {missing.length} Teile. Ohne Bild-KI schlagen Jobs ehrlich fehl — Coins werden erstattet.
                </p>
              )}
            </div>

            <Button
              data-testid="streamset-pack"
              onClick={() => void runPack()}
              disabled={loading || !dnaName || !canPayPack}
              className="w-full gap-2"
            >
              <Layers className="h-4 w-4" />
              {loadingKey === 'pack'
                ? 'Nexter arbeitet …'
                : `Komplettes Streamset (${formatCoins(PACK_COST)} Coins)`}
            </Button>
            {completedCount > 0 && (
              <Button
                variant="outline"
                className="w-full"
                data-testid="streamset-zip"
                onClick={() => {
                  void api.streamset
                    .exportZip(projectId ?? undefined)
                    .then((res) => {
                      const a = document.createElement('a');
                      a.href = res.exportUrl;
                      a.download = 'streamset.zip';
                      a.click();
                    })
                    .catch((err) => setError(err instanceof ApiError ? err.message : 'Kein Streamset-ZIP'));
                }}
              >
                Streamset-ZIP (nur vorhandene Dateien)
              </Button>
            )}
          </div>
        }
        preview={
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2" data-testid="streamset-tabs">
              {STREAMSET_TABS.map((t) => (
                <StudioOptionPill key={t.id} active={tab === t.id} onClick={() => setTab(t.id)}>
                  <span data-testid={`streamset-tab-${t.id}`}>{t.label}</span>
                </StudioOptionPill>
              ))}
              <Link
                to="/intro-outro"
                className="rounded-lg border border-white/10 px-2 py-1 text-xs text-zinc-400 hover:border-white/20"
                data-testid="streamset-tab-intro"
              >
                Intro / Outro
              </Link>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {tabAssets.map((asset) => (
                <GlassCard key={asset.key} accent={asset.present ? 'green' : 'none'} hover={false} className="!p-3">
                  <p className="text-sm font-medium text-white">{asset.label}</p>
                  <p className="mt-1 text-[11px] text-zinc-500">
                    {asset.present ? 'Vorhanden' : `${formatCoins(asset.coinCost)} Coins · echter Generator`}
                  </p>
                  {asset.job?.imageUrl ? (
                    <a href={asset.job.imageUrl} target="_blank" rel="noreferrer" className="mt-2 block">
                      <img src={asset.job.imageUrl} alt={asset.label} className="h-24 w-full rounded-lg object-cover" />
                    </a>
                  ) : (
                    <div className="mt-2 flex h-24 items-center justify-center rounded-lg border border-dashed border-white/10 text-[11px] text-zinc-600">
                      Noch kein Bild
                    </div>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="mt-2 w-full"
                    data-testid={`streamset-asset-${asset.key}`}
                    disabled={loading || !dnaName}
                    onClick={() => void runAsset(asset.key)}
                  >
                    {loadingKey === asset.key ? 'Generiert …' : asset.present ? 'Neu erzeugen' : 'Dieses Teil erzeugen'}
                  </Button>
                </GlassCard>
              ))}
            </div>

            {tab === 'screens' && (
              <p className="text-xs text-zinc-500">
                Screens nutzen Overlay-Studio (Starting Soon, BRB, Offline, Ending, Just Chatting).
              </p>
            )}
          </div>
        }
      />

      <div className="flex flex-wrap gap-3 text-sm">
        <Link className="text-violet-300 underline" to="/overlay-studio">
          Overlay Studio
        </Link>
        <Link className="text-violet-300 underline" to="/banner-studio">
          Banner Studio
        </Link>
        <Link className="text-violet-300 underline" to="/facecam-studio">
          Facecam Studio
        </Link>
        <Link className="text-violet-300 underline" to="/sticker-studio">
          Sticker Studio
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="streamset-results">
        {jobs
          .filter((j) => j.imageUrl)
          .map((j) => (
            <a key={j.id} href={j.imageUrl} target="_blank" rel="noreferrer" className="overflow-hidden rounded-xl border border-white/10">
              <img src={j.imageUrl} alt={j.assetKey || j.module} className="h-32 w-full object-cover" />
              <p className="px-2 py-1 text-[11px] text-zinc-400">{j.assetKey || j.module}</p>
            </a>
          ))}
      </div>
    </StudioShell>
  );
}
