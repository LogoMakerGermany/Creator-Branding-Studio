import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Layers } from 'lucide-react';
import {
  STREAMSET_CONFIGURATOR_SLOTS,
  STREAMSET_PACK_COIN_COST,
  STREAMSET_PLATFORMS,
  STREAMSET_TABS,
  STREAMSET_THREE_PART_COIN_COST,
  STREAMSET_THREE_PART_SLOT_IDS,
  streamsetPriceCaption,
  type StreamsetPlatform,
  type StreamsetPricingSku,
  type StreamsetTab,
} from '@ucbs/shared';
import { StudioShell } from '@/v2/components/StudioShell';
import { StudioWorkbench } from '@/v2/components/StudioWorkbench';
import { Button } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { api, ApiError, type GenerationJob, type StreamsetDraft, type StreamsetStatus } from '@/services/api';
import { DnaRequiredBanner, StudioSuccessBanner } from '@/v2/components/StudioAlerts';
import { StudioErrorBanner } from '@/components/studio';
import { StudioOptionPill } from '@/v2/components/StudioOptionPill';
import { useNexterStore } from '@/v2/store/nexter-store';
import { useBrandProjectStore } from '@/v2/store/brand-project-store';
import { formatCoins } from '@/lib/utils';
import { GlassCard } from '@/v2/components/GlassCard';

const PACK_COST = STREAMSET_PACK_COIN_COST;
const THREE_PART_COST = STREAMSET_THREE_PART_COIN_COST;
const THREE_PART_SLOTS = [...STREAMSET_THREE_PART_SLOT_IDS];

function userMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message;
  return fallback;
}

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
  const [statusLoading, setStatusLoading] = useState(true);
  const [platform, setPlatform] = useState<StreamsetPlatform>('twitch');
  const [slotIds, setSlotIds] = useState<string[]>([
    'facecam',
    'gameplay-overlay',
    'starting-screen',
    'brb-screen',
    'ending-screen',
    'banner',
  ]);
  const [creatorName, setCreatorName] = useState('');
  const [includeCreatorName, setIncludeCreatorName] = useState(true);
  const [draft, setDraft] = useState<StreamsetDraft | null>(null);
  const [quoteReady, setQuoteReady] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [showProgress, setShowProgress] = useState(false);
  const [retryQuote, setRetryQuote] = useState<{ id: string; coinCost: number; assetKey: string; label: string } | null>(
    null
  );

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
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
      setError(userMessage(err, 'Streamset-Status nicht ladbar'));
    } finally {
      setStatusLoading(false);
    }
  }, [projectId]);

  const loadDraft = useCallback(async () => {
    try {
      const next = await api.streamset.preview({
        projectId: projectId ?? undefined,
        platform,
        selectedSlotIds: slotIds,
        includeCreatorName,
      });
      setDraft(next);
      setCreatorName((prev) => prev || next.creatorName);
    } catch (err) {
      setError(userMessage(err, 'Streamset-Entwurf nicht ladbar'));
    }
  }, [projectId, platform, slotIds, includeCreatorName]);

  useEffect(() => {
    void refreshUser();
    void loadStatus();
  }, [loadStatus, activeDna?.id, refreshUser]);

  useEffect(() => {
    if (status?.latestBatch?.jobs?.length) setShowProgress(true);
  }, [status?.latestBatch?.id, status?.latestBatch?.jobs?.length]);

  useEffect(() => {
    void loadDraft();
  }, [loadDraft]);

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
  const canPayThreePart = (user?.coinBalance ?? 0) >= THREE_PART_COST;
  const coinBalance = user?.coinBalance ?? 0;
  const estimatedCoins = draft?.estimatedCoins ?? 0;
  const expectedBalanceAfter = Math.max(0, coinBalance - estimatedCoins);
  const failedJob = jobs.find((j) => j.status === 'failed');
  const runningJob = jobs.find((j) => j.status === 'processing' || j.status === 'queued');
  const progressItems = status?.latestBatch?.jobs?.length
    ? status.latestBatch.jobs
    : (draft?.includedAssets ?? []).map((asset) => {
        const job = jobs.find((j) => j.assetKey === asset.key);
        return {
          id: job?.id ?? asset.key,
          key: asset.key,
          label: asset.label,
          status: job?.status ?? (showProgress ? 'queued' : 'idle'),
          imageUrl: job?.imageUrl,
          error: job?.error,
        };
      });

  function toggleSlot(id: string) {
    setSlotIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    setQuoteReady(null);
  }

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
      setError(userMessage(err, 'Streamset fehlgeschlagen'));
      pulse('warning');
      await refreshUser();
      await loadStatus();
    } finally {
      setLoading(false);
      setLoadingKey(null);
    }
  }

  async function runThreePart() {
    if (confirming || loading) return;
    setConfirming(true);
    setLoading(true);
    setLoadingKey('three-part');
    setError(null);
    setQuoteReady(null);
    setSlotIds(THREE_PART_SLOTS);
    pulse('generating', 60000);
    try {
      const quoted = await api.streamset.quote({
        projectId: projectId ?? undefined,
        platform,
        selectedSlotIds: THREE_PART_SLOTS,
        creatorName: includeCreatorName ? creatorName || undefined : '',
        includeCreatorName,
      });
      const res = await api.streamset.confirm(quoted.quote.id);
      setJobs(res.jobs ?? []);
      setShowProgress(true);
      setQuoteReady(null);
      await refreshUser();
      await loadStatus();
      pulse('success');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'INSUFFICIENT_COINS') {
        setError('Nicht genügend Coins. Es wurde nichts abgebucht und kein Job gestartet.');
      } else {
        setError(userMessage(err, 'Streamset – 3 Teile fehlgeschlagen'));
      }
      pulse('warning');
      await refreshUser();
      await loadStatus();
    } finally {
      setLoading(false);
      setLoadingKey(null);
      setConfirming(false);
    }
  }

  async function confirmConfigurableSet() {
    if (confirming || loading) return;
    setConfirming(true);
    setLoading(true);
    setLoadingKey('quote');
    setError(null);
    setQuoteReady(null);
    try {
      const quoted = await api.streamset.quote({
        draftId: draft?.id,
        projectId: projectId ?? undefined,
        platform,
        selectedSlotIds: slotIds,
        creatorName: includeCreatorName ? creatorName || undefined : '',
        includeCreatorName,
      });
      const res = await api.streamset.confirm(quoted.quote.id);
      setJobs(res.jobs ?? []);
      setShowProgress(true);
      setQuoteReady(null);
      await refreshUser();
      await loadStatus();
      pulse('success');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'INSUFFICIENT_COINS') {
        setError('Nicht genügend Coins. Es wurde nichts abgebucht und kein Job gestartet.');
      } else {
        setError(userMessage(err, 'Streamset-Bestätigung fehlgeschlagen'));
      }
      pulse('warning');
      await refreshUser();
      await loadStatus();
    } finally {
      setLoading(false);
      setLoadingKey(null);
      setConfirming(false);
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
      setError(userMessage(err, 'Asset fehlgeschlagen'));
      pulse('warning');
      await refreshUser();
    } finally {
      setLoading(false);
      setLoadingKey(null);
    }
  }

  async function downloadResult(fileId: string | undefined, filename: string) {
    if (!fileId) {
      setError('Datei nicht verfügbar.');
      return;
    }
    try {
      const issued = await api.files.downloadUrl(fileId);
      const a = document.createElement('a');
      a.href = issued.downloadUrl;
      a.download = filename;
      a.click();
    } catch (err) {
      setError(userMessage(err, 'Download fehlgeschlagen'));
    }
  }

  async function retryAsset(assetKey: string, variant?: boolean) {
    const batchId = status?.latestBatch?.id;
    if (!batchId) return;
    setLoading(true);
    setLoadingKey(`retry-${assetKey}`);
    setError(null);
    try {
      const res = await api.streamset.retry({ batchId, assetKey, variant });
      if (res.requiresQuote && res.quote) {
        const label = status?.latestBatch?.jobs?.find((j) => j.key === assetKey)?.label ?? assetKey;
        setRetryQuote({ id: res.quote.id, coinCost: res.quote.coinCost, assetKey, label });
      } else {
        setRetryQuote(null);
        await refreshUser();
        await loadStatus();
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === 'INSUFFICIENT_COINS') {
        setError('Nicht genügend Coins für einen neuen Versuch. Es startet kein Job und kein Checkout.');
      } else {
        setError(userMessage(err, 'Retry nicht möglich'));
      }
    } finally {
      setLoading(false);
      setLoadingKey(null);
    }
  }

  async function confirmRetryQuote() {
    if (!retryQuote || confirming) return;
    setConfirming(true);
    setLoading(true);
    setError(null);
    try {
      await api.streamset.confirm(retryQuote.id);
      setRetryQuote(null);
      await refreshUser();
      await loadStatus();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'INSUFFICIENT_COINS') {
        setError('Nicht genügend Coins für einen neuen Versuch. Es startet kein Job und kein Checkout.');
      } else {
        setError(userMessage(err, 'Retry-Bestätigung fehlgeschlagen'));
      }
    } finally {
      setLoading(false);
      setConfirming(false);
    }
  }

  const wizardStep = !dnaName ? 1 : hasImages || completedCount > 0 || showProgress ? 3 : 2;
  const pricingSku: StreamsetPricingSku = draft?.pricingSku ?? 'a_la_carte';
  const selectionPriceLabel = draft ? streamsetPriceCaption(pricingSku, draft.estimatedCoins) : null;

  return (
    <StudioShell
      title="Streamset Studio"
      description="Aus Creator DNA das komplette Stream-Set — Overlay, Banner, Facecam und Sticker über die echten Generatoren"
      coinCost={draft?.estimatedCoins}
      coinCostLabel={selectionPriceLabel ?? undefined}
      nexterHint="Soll ich dir daraus ein Komplettset erstellen?"
    >
      <div className="space-y-4" data-testid="streamset-wizard">
        {!activeDna && !status?.dna && (
          <DnaRequiredBanner message="Keine Creator DNA — Farben und Stil können nicht automatisch übernommen werden." />
        )}
        {!projectId && (
          <p className="text-sm text-zinc-500" data-testid="streamset-empty-project">
            Kein aktives Projekt. Der Entwurf bleibt lokal am Account, DNA wird nicht überschrieben.
          </p>
        )}
        {draft && !draft.sourceLogoPresent && (
          <p className="text-sm text-zinc-500" data-testid="streamset-empty-logo">
            Kein eigenes Logo gefunden. Du kannst trotzdem aus der Creator DNA vorbereiten — fremde Logos werden nicht verwendet.
          </p>
        )}
        {draft?.insufficientCoins && (
          <p className="text-sm text-amber-300" data-testid="streamset-insufficient-coins">
            Nicht genügend Coins für dieses Set ({formatCoins(draft.estimatedCoins)}). Es wird nichts abgebucht.
          </p>
        )}
        {statusLoading && (
          <p className="text-sm text-zinc-500" data-testid="streamset-loading">
            Streamset wird geladen …
          </p>
        )}
        {runningJob && (
          <p className="text-sm text-cyan-300" data-testid="streamset-job-running">
            Ein Job läuft noch. Es werden keine technischen Details angezeigt.
          </p>
        )}
        {failedJob && (
          <StudioErrorBanner message={failedJob.error || 'Generierung fehlgeschlagen. Datei nicht verfügbar.'} />
        )}
        {error && <StudioErrorBanner message={error} />}
        {retryQuote && (
          <div className="rounded-xl border border-amber-400/30 p-3 text-sm" data-testid="streamset-retry-quote">
            <p>
              {retryQuote.label}: neuer Versuch kostet {formatCoins(retryQuote.coinCost)}. Bestand:{' '}
              {formatCoins(coinBalance)}.
            </p>
            {coinBalance < retryQuote.coinCost ? (
              <p className="mt-1 text-amber-300">Nicht genügend Coins. Kein Checkout.</p>
            ) : (
              <Button
                className="mt-2"
                data-testid="streamset-retry-confirm"
                disabled={loading || confirming}
                onClick={() => void confirmRetryQuote()}
              >
                Für {formatCoins(retryQuote.coinCost)} Coins erneut versuchen
              </Button>
            )}
          </div>
        )}
        {quoteReady && <StudioSuccessBanner>{quoteReady}</StudioSuccessBanner>}
        {(showProgress || (status?.latestBatch?.jobs?.length ?? 0) > 0) && (
          <div className="rounded-xl border border-white/10 p-3" data-testid="streamset-generation-progress">
            <p className="text-xs uppercase tracking-wider text-zinc-500">Generierung</p>
            <ul className="mt-2 space-y-1 text-sm">
              {progressItems.map((item) => {
                const state = item.status;
                const label =
                  state === 'completed'
                    ? '✓'
                    : state === 'failed'
                      ? '✕'
                      : state === 'processing'
                        ? 'wird erstellt …'
                        : 'wartet …';
                return (
                  <li
                    key={item.id}
                    className={
                      state === 'completed'
                        ? 'text-emerald-300'
                        : state === 'failed'
                          ? 'text-rose-300'
                          : 'text-cyan-200'
                    }
                    data-testid={`streamset-progress-${item.key ?? item.id}`}
                  >
                    {item.label}: {label}
                    {state === 'failed' && item.error ? ` — ${item.error}` : ''}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
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

            <div data-testid="streamset-configurator">
              <p className="text-xs uppercase tracking-wider text-zinc-500">Plattform</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {STREAMSET_PLATFORMS.map((p) => (
                  <StudioOptionPill
                    key={p}
                    active={platform === p}
                    onClick={() => {
                      setPlatform(p);
                      setQuoteReady(null);
                    }}
                  >
                    <span data-testid={`streamset-platform-${p}`}>{p}</span>
                  </StudioOptionPill>
                ))}
              </div>
              <p className="mt-3 text-xs uppercase tracking-wider text-zinc-500">Bestandteile</p>
              <ul className="mt-2 space-y-1 text-sm">
                {STREAMSET_CONFIGURATOR_SLOTS.map((slot) => (
                  <li key={slot.id}>
                    <label className="flex items-center gap-2 text-zinc-300">
                      <input
                        type="checkbox"
                        data-testid={`streamset-slot-${slot.id}`}
                        checked={slotIds.includes(slot.id)}
                        onChange={() => toggleSlot(slot.id)}
                      />
                      <span>
                        {slot.label}
                        {slot.optional ? ' (optional)' : ''}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              <label className="mt-3 block text-xs text-zinc-500">
                Creator-Name (nur Vorschlag, nicht bei jedem Asset nötig)
                <input
                  className="mt-1 w-full rounded-lg border border-white/10 bg-transparent px-2 py-1 text-sm text-white"
                  data-testid="streamset-creator-name"
                  value={creatorName}
                  onChange={(e) => setCreatorName(e.target.value)}
                />
              </label>
              <label className="mt-2 flex items-center gap-2 text-xs text-zinc-400">
                <input
                  type="checkbox"
                  checked={includeCreatorName}
                  onChange={(e) => setIncludeCreatorName(e.target.checked)}
                />
                Name auf textfähigen Assets vorschlagen
              </label>
              <p className="mt-3 text-sm text-white" data-testid="streamset-cost-preview">
                {draft
                  ? pricingSku === 'a_la_carte'
                    ? `Ausgewählte Einzelteile: ${draft.includedAssets.length} Assets · ${formatCoins(draft.estimatedCoins)} Coins`
                    : streamsetPriceCaption(pricingSku, draft.estimatedCoins)
                  : 'Kosten werden berechnet …'}
              </p>
              {draft && (
                <div className="mt-2 space-y-1 text-xs text-zinc-400" data-testid="streamset-confirm-summary">
                  <p>Plattform: {draft.platform}</p>
                  <p>Ausgewählt: {draft.includedAssets.map((a) => a.label).join(', ')}</p>
                  <p data-testid="streamset-coin-balance">Aktueller Bestand: {formatCoins(coinBalance)}</p>
                  <p data-testid="streamset-coin-after">
                    Danach erwartet: {formatCoins(expectedBalanceAfter)}
                  </p>
                </div>
              )}
              {draft && (
                <p className="text-xs text-zinc-500" data-testid="streamset-confirm-copy">
                  {draft.confirmationSummary}
                </p>
              )}
              <Button
                className="mt-3 w-full"
                data-testid="streamset-confirm-cta"
                disabled={
                  loading ||
                  confirming ||
                  !dnaName ||
                  !draft ||
                  draft.insufficientCoins ||
                  slotIds.length === 0
                }
                onClick={() => void confirmConfigurableSet()}
              >
                {loadingKey === 'quote' || confirming
                  ? 'Wird erstellt …'
                  : draft
                    ? `${streamsetPriceCaption(pricingSku, draft.estimatedCoins)} — erstellen`
                    : 'Für 0 Coins erstellen'}
              </Button>
              {draft?.insufficientCoins && (
                <p className="mt-1 text-xs text-amber-300" data-testid="streamset-insufficient-confirm">
                  Nicht genügend Coins. Es startet kein Job und kein Checkout.
                </p>
              )}
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
              data-testid="streamset-three-part"
              onClick={() => void runThreePart()}
              disabled={loading || !dnaName || !canPayThreePart}
              className="w-full gap-2"
              variant="outline"
            >
              {loadingKey === 'three-part'
                ? 'Nexter arbeitet …'
                : `Streamset – 3 Teile (${formatCoins(THREE_PART_COST)} Coins)`}
            </Button>
            <Button
              data-testid="streamset-pack"
              onClick={() => void runPack()}
              disabled={loading || !dnaName || !canPayPack}
              className="w-full gap-2"
            >
              <Layers className="h-4 w-4" />
              {loadingKey === 'pack'
                ? 'Nexter arbeitet …'
                : `Komplettset (${formatCoins(PACK_COST)} Coins)`}
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
                      a.download = res.fileName || 'streamset.zip';
                      a.click();
                    })
                    .catch((err) => setError(userMessage(err, 'Kein Streamset-ZIP')));
                }}
              >
                {status?.latestBatch?.incomplete
                  ? 'Erfolgreiche Teile als ZIP (Set unvollständig)'
                  : 'Streamset-ZIP (nur vorhandene Dateien)'}
              </Button>
            )}
            {status?.latestBatch?.incomplete && completedCount > 0 && (
              <p className="text-[11px] text-amber-200" data-testid="streamset-zip-incomplete">
                Das Set ist unvollständig. Der Export enthält nur erfolgreiche eigene Dateien — kein komplettes Streamset.
              </p>
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

            <div
              className="grid gap-2 sm:grid-cols-2"
              data-testid="streamset-result-set"
            >
              {(status?.latestBatch?.jobs ?? []).map((item) => (
                <GlassCard
                  key={item.id}
                  accent={item.status === 'completed' ? 'green' : item.status === 'failed' ? 'none' : 'none'}
                  hover={false}
                  className="!p-3"
                >
                  <p className="text-sm font-medium text-white" data-testid={`streamset-result-${item.key}`}>
                    {item.label} —{' '}
                    {item.status === 'completed'
                      ? 'Fertig'
                      : item.status === 'failed'
                        ? 'Fehlgeschlagen'
                        : item.status === 'processing'
                          ? 'wird erstellt …'
                          : 'wartet …'}
                    {item.version ? ` · v${item.version}` : ''}
                  </p>
                  {item.fileMissing && (
                    <p className="mt-1 text-[11px] text-amber-300">Datei fehlt. Download nicht verfügbar.</p>
                  )}
                  {item.status === 'failed' && item.error && (
                    <p className="mt-1 text-[11px] text-rose-300">{item.error}</p>
                  )}
                  {item.imageUrl && !item.fileMissing ? (
                    <a href={item.imageUrl} target="_blank" rel="noreferrer" className="mt-2 block">
                      <img src={item.imageUrl} alt={item.label} className="h-24 w-full rounded-lg object-cover" />
                    </a>
                  ) : (
                    <div className="mt-2 flex h-24 items-center justify-center rounded-lg border border-dashed border-white/10 text-[11px] text-zinc-600">
                      {item.status === 'failed' ? 'Kein Ergebnis' : 'Noch kein Bild'}
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {item.status === 'completed' && item.imageUrl && !item.fileMissing && (
                      <Button size="sm" variant="ghost" onClick={() => window.open(item.imageUrl, '_blank')}>
                        Ansehen
                      </Button>
                    )}
                    {item.canDownload && item.fileId && (
                      <Button
                        size="sm"
                        variant="ghost"
                        data-testid={`streamset-download-${item.key}`}
                        onClick={() => void downloadResult(item.fileId, item.downloadName || `${item.key}.png`)}
                      >
                        Herunterladen
                      </Button>
                    )}
                    {item.status === 'completed' && (
                      <Link
                        to={`/change-request?jobId=${encodeURIComponent(item.id)}`}
                        className="inline-flex items-center rounded-lg border border-white/10 px-2 py-1 text-xs text-zinc-300"
                        data-testid={`streamset-change-${item.key}`}
                      >
                        Ändern
                      </Link>
                    )}
                    {item.status === 'completed' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={loading || coinBalance < (item.retryCoinCost ?? 0)}
                        onClick={() => void retryAsset(String(item.key), true)}
                      >
                        Neue Variante
                        {item.retryCoinCost ? ` (${formatCoins(item.retryCoinCost)})` : ''}
                      </Button>
                    )}
                    {item.status === 'failed' && item.canRetry && (
                      <Button
                        size="sm"
                        data-testid={`streamset-retry-${item.key}`}
                        disabled={loading || loadingKey === `retry-${item.key}`}
                        onClick={() => void retryAsset(String(item.key))}
                      >
                        {loadingKey === `retry-${item.key}` ? 'Versuche …' : 'Erneut versuchen'}
                      </Button>
                    )}
                    {item.status === 'failed' && !item.canRetry && (
                      <p className="text-[11px] text-zinc-500">Retry nicht möglich</p>
                    )}
                  </div>
                </GlassCard>
              ))}
            </div>
            {!status?.latestBatch?.jobs?.length && !statusLoading && (
              <p className="text-sm text-zinc-500" data-testid="streamset-empty-results">
                Noch keine Streamset-Ergebnisse. Bestätige ein Angebot, um Assets zu erstellen.
              </p>
            )}

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
