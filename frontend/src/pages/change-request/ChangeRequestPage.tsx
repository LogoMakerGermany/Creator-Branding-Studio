import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  PageHeader, Badge, Button, NeonCard, CardTitle,
} from '@/components/ui';
import { StudioErrorBanner } from '@/components/studio';
import { RefreshCw, ArrowLeftRight, RotateCcw, Download } from 'lucide-react';
import {
  api,
  ApiError,
  type ChangeableSource,
  type ChangeRequestRecord,
  type DesignVersion,
} from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { formatCoins } from '@/lib/utils';
import { useBrandProjectStore } from '@/v2/store/brand-project-store';

const CHANGE_TEXT_MAX = 500;

const STATUS_LABEL: Record<string, string> = {
  pending: 'Vorgemerkt',
  processing: 'In Arbeit',
  completed: 'Fertig',
  rejected: 'Fehlgeschlagen',
  quoted: 'Angebot',
  confirmed: 'Bestätigt',
  failed: 'Fehlgeschlagen',
};

function scopeLabel(scope?: string): string {
  if (scope === 'set') return 'Ganzes Set';
  if (scope === 'dna') return 'Creator DNA';
  return 'Nur dieses Ergebnis';
}

function mapChangeError(err: unknown): string {
  if (!(err instanceof ApiError)) return 'Netzwerkfehler. Bitte Verbindung prüfen.';
  if (err.code === 'SOURCE_MISSING') return 'Die Ausgangsdatei fehlt oder wurde gelöscht. Es wurde nichts abgebucht.';
  if (err.code === 'NOT_FOUND') return 'Dieses Ergebnis gehört nicht zu deinem Konto oder wurde gelöscht.';
  if (err.code === 'INVALID_CHANGE') return err.message || 'Bitte den Änderungswunsch genauer beschreiben.';
  if (err.code === 'CHANGE_NOT_SUPPORTED') return err.message || 'Diese Änderung ist so nicht möglich.';
  if (err.code === 'DNA_CONFIRMATION_REQUIRED') {
    return 'DNA-Änderungen brauchen eine explizite Bestätigung in der Creator DNA — nicht als Asset-Änderung.';
  }
  if (err.code === 'INSUFFICIENT_COINS') return 'Nicht genügend Coins. Es wurde nichts gestartet und nichts abgebucht.';
  if (err.code === 'PRICE_CHANGED') return 'Der Preis hat sich geändert. Bitte das Angebot erneut bestätigen.';
  if (err.code === 'FILE_MISSING') return 'Die Ergebnisdatei ist nicht verfügbar.';
  if (err.code === 'CHANGE_REQUIRES_QUOTE') return err.message;
  if (err.code === 'QUOTE_USED') return 'Dieses Angebot wurde bereits verwendet.';
  if (err.code === 'QUOTE_EXPIRED') return 'Das Angebot ist abgelaufen. Bitte neu anfragen.';
  if (err.status === 410) return 'Die Ausgangsdatei fehlt oder wurde gelöscht. Es wurde nichts abgebucht.';
  return err.message || 'Änderung fehlgeschlagen.';
}

export function ChangeRequestPage() {
  const { user, refreshUser } = useAuth();
  const [params] = useSearchParams();
  const projectId = useBrandProjectStore((s) => s.activeProjectId);
  const [requests, setRequests] = useState<ChangeRequestRecord[]>([]);
  const [sources, setSources] = useState<ChangeableSource[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [requestText, setRequestText] = useState('');
  const [scope, setScope] = useState<'asset' | 'set' | 'dna'>('asset');
  const [loading, setLoading] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [resultPreviewUrl, setResultPreviewUrl] = useState<string | null>(null);
  const [versions, setVersions] = useState<DesignVersion[]>([]);
  const [comparison, setComparison] = useState<{ before?: string; after?: string; request: string; status: string } | null>(null);
  const [pendingQuote, setPendingQuote] = useState<{
    id: string;
    coinCost: number;
    label: string;
    module: string;
  } | null>(null);

  const selected = sources.find((s) => s.id === selectedId) ?? null;
  const coins = user?.coinBalance ?? 0;
  const canSet = Boolean(selected?.batchId || selected?.kind === 'streamset');

  const load = useCallback(async () => {
    setLoadingList(true);
    try {
      const data = await api.changeRequest.list();
      setRequests(data.changeRequests);
      const nextSources = data.sources?.length
        ? data.sources
        : (data.availableJobs ?? []).map((job) => ({
            id: job.id,
            kind: job.module,
            module: job.module,
            label: job.module,
            fileId: job.fileId,
            projectId: job.projectId,
            version: 1,
            createdAt: job.createdAt,
            resultKind: 'image' as const,
            batchId: job.batchId,
            assetKey: job.assetKey,
          }));
      setSources(nextSources);
      const wantedJob = params.get('jobId');
      const wantedFile = params.get('file');
      const match =
        nextSources.find((s) => wantedJob && s.id === wantedJob) ||
        nextSources.find((s) => wantedFile && s.fileId === wantedFile);
      setSelectedId((prev) => {
        if (match) return match.id;
        if (prev && nextSources.some((s) => s.id === prev)) return prev;
        return nextSources[0]?.id || '';
      });
    } catch (err) {
      setError(mapChangeError(err));
    } finally {
      setLoadingList(false);
    }
  }, [params]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!selected?.fileId) {
      setPreviewUrl(null);
      setPreviewError(null);
      return;
    }
    let cancelled = false;
    setPreviewError(null);
    void api.files.downloadUrl(selected.fileId).then((res) => {
      if (!cancelled) setPreviewUrl(res.downloadUrl);
    }).catch(() => {
      if (!cancelled) {
        setPreviewUrl(null);
        setPreviewError('Vorschau derzeit nicht verfügbar.');
      }
    });
    return () => { cancelled = true; };
  }, [selected?.fileId]);

  useEffect(() => {
    if (!selectedId) {
      setVersions([]);
      return;
    }
    let cancelled = false;
    void api.changeRequest.versions(selectedId).then((res) => {
      if (!cancelled) setVersions(res.versions);
    }).catch(() => {
      if (!cancelled) setVersions([]);
    });
    return () => { cancelled = true; };
  }, [selectedId]);

  const currentVersion = useMemo(
    () => (versions.length ? Math.max(...versions.map((v) => v.version)) : selected?.version || 1),
    [versions, selected?.version]
  );

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selectedId || !requestText.trim()) return;
    if (scope === 'dna') {
      setError('DNA-Änderungen brauchen eine explizite Bestätigung in der Creator DNA — nicht als Asset-Änderung.');
      setPendingQuote(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.changeRequest.quote({
        jobId: selectedId,
        request: requestText.trim(),
        projectId: projectId ?? selected?.projectId ?? undefined,
        scope,
      });
      setPendingQuote({
        id: res.quote.id,
        coinCost: res.quote.coinCost,
        label: res.honestLabel,
        module: res.module,
      });
    } catch (err) {
      setError(mapChangeError(err));
    } finally {
      setLoading(false);
    }
  }

  async function confirmQuote() {
    if (!pendingQuote) return;
    if (coins < pendingQuote.coinCost) {
      setError('Nicht genügend Coins. Es wurde nichts gestartet und nichts abgebucht.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await api.nexter.confirmQuote(pendingQuote.id);
      setPendingQuote(null);
      setRequestText('');
      await refreshUser();
      await load();
    } catch (err) {
      setError(mapChangeError(err));
      await refreshUser();
    } finally {
      setLoading(false);
    }
  }

  async function cancelQuote() {
    if (!pendingQuote) return;
    await api.nexter.cancelQuote(pendingQuote.id);
    setPendingQuote(null);
  }

  async function showCompare(cr: ChangeRequestRecord) {
    setError(null);
    try {
      const res = await api.changeRequest.compare(cr.id);
      setComparison(res.comparison);
      if (cr.fileIdAfter) {
        try {
          const dl = await api.files.downloadUrl(cr.fileIdAfter);
          setResultPreviewUrl(dl.downloadUrl);
        } catch {
          setResultPreviewUrl(res.comparison.after || null);
        }
      } else {
        setResultPreviewUrl(res.comparison.after || null);
      }
    } catch (err) {
      setError(mapChangeError(err));
    }
  }

  async function handleRestore(versionId: string) {
    setError(null);
    try {
      await api.changeRequest.restore(versionId);
      await load();
    } catch (err) {
      setError(mapChangeError(err));
    }
  }

  async function downloadResult(fileId?: string) {
    if (!fileId) {
      setError('Download derzeit nicht verfügbar.');
      return;
    }
    try {
      const res = await api.files.downloadUrl(fileId);
      const link = document.createElement('a');
      link.href = res.downloadUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.click();
    } catch (err) {
      setError(mapChangeError(err));
    }
  }

  const textError =
    requestText.trim().length > 0 && requestText.trim().length < 3
      ? 'Bitte den Wunsch etwas genauer beschreiben.'
      : requestText.length > CHANGE_TEXT_MAX
        ? `Maximal ${CHANGE_TEXT_MAX} Zeichen.`
        : undefined;

  return (
    <div>
      <PageHeader
        title="Änderung anfordern"
        description="Wähle ein eigenes Ergebnis und beschreibe die Änderung. Preis kommt vom Server — Start erst nach Bestätigung. Die Creator DNA ändert sich dabei nicht."
        badge={<Badge variant="brand">NEXTER</Badge>}
      />

      {error && (
        <div role="alert">
          <StudioErrorBanner message={error} />
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-400" aria-live="polite">
          Guthaben: <span className="font-medium text-zinc-100">{formatCoins(coins)} Coins</span>
        </p>
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          onClick={() => void load()}
          loading={loadingList}
          aria-label="Liste aktualisieren"
        >
          <RefreshCw className="h-4 w-4" />
          Aktualisieren
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <NeonCard accent="cyan">
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-brand-400" />
            Änderung anfordern
          </CardTitle>

          {loadingList && sources.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-500" aria-live="polite">Ergebnisse werden geladen…</p>
          ) : sources.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-500">
              Erstelle zuerst ein Ergebnis in einem Studio. Danach kannst du hier eine Änderung anfordern.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <div>
                <label htmlFor="change-source" className="mb-1 block text-sm font-medium text-zinc-300">
                  Eigenes Ergebnis
                </label>
                <select
                  id="change-source"
                  value={selectedId}
                  onChange={(e) => {
                    setSelectedId(e.target.value);
                    setPendingQuote(null);
                    setScope('asset');
                  }}
                  className="min-h-11 w-full rounded-lg border border-zinc-700 bg-surface-900 px-3 py-2 text-sm text-zinc-100 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                >
                  {sources.map((source) => (
                    <option key={source.id} value={source.id}>
                      {source.label}
                      {source.version ? ` · Version ${source.version}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {selected && (
                <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
                  <div className="flex flex-wrap gap-2 text-xs text-zinc-400">
                    <span className="rounded-full border border-zinc-700 px-2 py-1 text-zinc-200">{selected.label}</span>
                    <span className="rounded-full border border-zinc-700 px-2 py-1">Version {currentVersion}</span>
                    <span className="rounded-full border border-zinc-700 px-2 py-1">
                      {selected.projectId ? (selected.projectId === projectId ? 'Aktuelles Projekt' : 'Mit Projekt verknüpft') : 'Ohne Projekt'}
                    </span>
                  </div>
                  {previewError && (
                    <p className="text-xs text-amber-300" role="status">{previewError}</p>
                  )}
                  {previewUrl && selected.resultKind === 'image' && (
                    <img
                      src={previewUrl}
                      alt={`Vorschau: ${selected.label}`}
                      className="max-h-56 w-full rounded-lg border border-zinc-800 object-contain"
                    />
                  )}
                  {previewUrl && selected.resultKind === 'audio' && (
                    <audio controls className="w-full" src={previewUrl} aria-label={`Hörprobe: ${selected.label}`} />
                  )}
                  {previewUrl && selected.resultKind === 'video' && (
                    <video controls className="max-h-56 w-full rounded-lg border border-zinc-800" src={previewUrl} aria-label={`Vorschau: ${selected.label}`} />
                  )}
                  {selected.fileId && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="min-h-11"
                      onClick={() => void downloadResult(selected.fileId)}
                    >
                      <Download className="h-4 w-4" />
                      Original herunterladen
                    </Button>
                  )}
                </div>
              )}

              <fieldset>
                <legend className="mb-2 text-sm font-medium text-zinc-300">Was soll geändert werden?</legend>
                <div className="grid gap-2 sm:grid-cols-3">
                  {([
                    { id: 'asset' as const, label: 'Nur dieses Ergebnis', hint: 'Standard' },
                    { id: 'set' as const, label: 'Ganzes Set', hint: canSet ? 'Zugehörige Streamset-Teile' : 'Nur bei einem Set' },
                    { id: 'dna' as const, label: 'Creator DNA', hint: 'Nur mit Bestätigung' },
                  ]).map((opt) => (
                    <label
                      key={opt.id}
                      className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                        scope === opt.id
                          ? 'border-cyan-500/50 bg-cyan-500/10 text-zinc-100'
                          : 'border-zinc-800 text-zinc-400'
                      } ${opt.id === 'set' && !canSet ? 'opacity-50' : ''}`}
                    >
                      <input
                        type="radio"
                        name="change-scope"
                        value={opt.id}
                        checked={scope === opt.id}
                        disabled={opt.id === 'set' && !canSet}
                        onChange={() => setScope(opt.id)}
                      />
                      <span>
                        {opt.label}
                        <span className="block text-[11px] text-zinc-500">{opt.hint}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              {scope === 'dna' && (
                <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100" role="status">
                  Eine dauerhafte DNA-Änderung startet hier nicht automatisch.{' '}
                  <Link className="underline" to="/creator-dna">Creator DNA öffnen</Link>
                  {' '}und dort bestätigen.
                </p>
              )}

              <div>
                <label htmlFor="change-text" className="mb-1 block text-sm font-medium text-zinc-300">
                  Dein Änderungswunsch
                </label>
                <textarea
                  id="change-text"
                  value={requestText}
                  onChange={(e) => setRequestText(e.target.value)}
                  maxLength={CHANGE_TEXT_MAX}
                  rows={4}
                  placeholder="z. B. Logo etwas dunkler, Schrift größer, Facecam dünner…"
                  aria-invalid={textError ? true : undefined}
                  aria-describedby={textError ? 'change-text-error' : 'change-text-hint'}
                  className="min-h-24 w-full rounded-lg border border-zinc-700 bg-surface-900 px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
                <p id="change-text-hint" className="mt-1 text-xs text-zinc-500">
                  {requestText.trim().length}/{CHANGE_TEXT_MAX} · gilt nur für das gewählte Ergebnis, nicht still für die DNA
                </p>
                {textError && (
                  <p id="change-text-error" className="mt-1 text-xs text-red-400" role="alert">{textError}</p>
                )}
              </div>

              <Button
                type="submit"
                loading={loading}
                className="min-h-11 w-full gap-2"
                disabled={Boolean(pendingQuote) || scope === 'dna' || !requestText.trim() || Boolean(textError)}
              >
                <RefreshCw className="h-4 w-4" />
                Angebot einholen
              </Button>
              {pendingQuote && (
                <div className="rounded-xl border border-violet-500/40 bg-violet-500/10 p-3" data-testid="change-quote-bar">
                  <p className="text-sm text-violet-100">
                    {pendingQuote.label}. {scopeLabel(scope)}. Startet erst nach Bestätigung.
                  </p>
                  <p data-testid="change-quote-cost" className="mt-1 text-sm font-medium text-white">
                    {formatCoins(pendingQuote.coinCost)} Coins · Guthaben {formatCoins(coins)}
                  </p>
                  {coins < pendingQuote.coinCost && (
                    <p className="mt-1 text-xs text-amber-200" role="status">
                      Nicht genügend Coins. Bestätigen startet keinen Job.
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      data-testid="change-confirm"
                      className="min-h-11"
                      onClick={() => void confirmQuote()}
                      loading={loading}
                      disabled={coins < pendingQuote.coinCost}
                    >
                      Bestätigen
                    </Button>
                    <Button
                      type="button"
                      data-testid="change-cancel"
                      variant="outline"
                      className="min-h-11"
                      onClick={() => void cancelQuote()}
                    >
                      Abbrechen
                    </Button>
                  </div>
                </div>
              )}
            </form>
          )}
        </NeonCard>

        <NeonCard accent="magenta">
          <CardTitle className="flex items-center gap-2">
            <ArrowLeftRight className="h-5 w-5 text-brand-400" />
            Vorher / Nachher
          </CardTitle>
          {comparison ? (
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-xs text-zinc-500">Original</p>
                {comparison.before && (
                  <img src={comparison.before} alt="Original vor der Änderung" className="w-full rounded-lg border border-zinc-800" />
                )}
              </div>
              <div>
                <p className="mb-2 text-xs text-zinc-500">Neue Variante</p>
                {(resultPreviewUrl || comparison.after) && (
                  <img src={resultPreviewUrl || comparison.after} alt="Ergebnis nach der Änderung" className="w-full rounded-lg border border-zinc-800" />
                )}
              </div>
              <p className="sm:col-span-2 text-sm text-zinc-400">„{comparison.request}“ · {STATUS_LABEL[comparison.status] || comparison.status}</p>
            </div>
          ) : (
            <p className="mt-4 text-sm text-zinc-500">Wähle einen Eintrag aus der Historie für den Vergleich. Das Original bleibt erhalten.</p>
          )}

          {versions.length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Versionen</p>
              {versions.map((version) => (
                <div key={version.id} className="flex items-center justify-between gap-2 rounded-lg border border-zinc-800 px-3 py-2">
                  <p className="text-sm text-zinc-200">
                    Version {version.version}
                    {version.changeRequest ? ` · ${version.changeRequest}` : ''}
                  </p>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="min-h-11"
                    onClick={() => void handleRestore(version.id)}
                    aria-label={`Version ${version.version} wiederherstellen`}
                  >
                    <RotateCcw className="h-3 w-3" />
                    Wiederherstellen
                  </Button>
                </div>
              ))}
            </div>
          )}
        </NeonCard>
      </div>

      {requests.length > 0 && (
        <NeonCard accent="purple" className="mt-6" title="Verlauf">
          <div className="mt-4 space-y-2">
            {requests.map((cr) => (
              <div key={cr.id} className="flex flex-col gap-3 rounded-lg border border-zinc-800 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-zinc-200">{cr.request}</p>
                  <p className="text-xs text-zinc-500">
                    {STATUS_LABEL[cr.status] || cr.status}
                    {cr.scope ? ` · ${scopeLabel(cr.scope)}` : ''}
                    {' · '}
                    {new Date(cr.createdAt).toLocaleString('de-DE')}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {cr.status === 'completed' && (
                    <>
                      <Button size="sm" variant="outline" className="min-h-11" onClick={() => void showCompare(cr)}>
                        <ArrowLeftRight className="h-3 w-3" />
                        Vergleich
                      </Button>
                      {cr.fileIdAfter && (
                        <Button size="sm" variant="outline" className="min-h-11" onClick={() => void downloadResult(cr.fileIdAfter)}>
                          <Download className="h-3 w-3" />
                          Download
                        </Button>
                      )}
                      {cr.versionAfter && (
                        <Button size="sm" variant="ghost" className="min-h-11" onClick={() => void handleRestore(cr.versionAfter!)}>
                          <RotateCcw className="h-3 w-3" />
                          Diese Variante
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </NeonCard>
      )}
    </div>
  );
}
