import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, AlertCircle, CheckCircle2, Dna, Package, Download, XCircle } from 'lucide-react';
import { PageHeader, Badge, Button, Card, CardTitle } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { api, ApiError, type GenerationJob } from '@/services/api';
import { formatCoins } from '@/lib/utils';

const PACK_ASSETS = [
  { key: 'profile-pic', label: 'Profilbild' },
  { key: 'banner', label: 'Banner' },
  { key: 'facecam', label: 'Facecam' },
  { key: 'overlay', label: 'Overlay' },
  { key: 'stream-start', label: 'Stream Start' },
  { key: 'stream-end', label: 'Stream Ende' },
  { key: 'panel', label: 'Panels' },
  { key: 'alert', label: 'Alerts' },
];

export function BrandingGeneratorPage() {
  const { user, activeDna, refreshUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<GenerationJob[]>([]);
  const [packStatus, setPackStatus] = useState<'completed' | 'partial' | null>(null);
  const [failedCount, setFailedCount] = useState(0);

  async function handleGenerate() {
    if (!activeDna) {
      setError('Erstelle zuerst eine Creator DNA');
      return;
    }

    setLoading(true);
    setError(null);
    setPackStatus(null);
    setFailedCount(0);
    try {
      const res = await api.studio.generateBrandingPack();
      if (res.jobs) setJobs(res.jobs);
      if (res.status === 'partial' || res.status === 'completed') {
        setPackStatus(res.status);
      }
      if (res.failedCount) setFailedCount(res.failedCount);
      await refreshUser();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Generierung fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }

  const completedCount = jobs.filter((j) => j.status === 'completed').length;

  return (
    <div>
      <PageHeader
        title="Branding Generator"
        description="Generiert automatisch 8 Branding-Assets basierend auf deiner Creator DNA"
        badge={<Badge variant="brand">KI-Paket</Badge>}
        actions={<Badge variant="default">{formatCoins(50)} Coins</Badge>}
      />

      {!activeDna && (
        <div className="mb-6 flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-amber-200">
          <AlertCircle className="h-5 w-5" />
          <span className="flex-1 text-sm">Creator DNA erforderlich</span>
          <Link to="/creator-dna"><Button size="sm" variant="outline">DNA erstellen</Button></Link>
        </div>
      )}

      {error && (
        <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-red-300">{error}</div>
      )}

      {packStatus === 'completed' && (
        <div className="mb-6 flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-300">
          <CheckCircle2 className="h-5 w-5" />
          Branding-Paket vollständig generiert — alle 8 Assets in der Datei Cloud
        </div>
      )}

      {packStatus === 'partial' && (
        <div className="mb-6 flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-amber-200">
          <AlertCircle className="h-5 w-5" />
          Teilweise generiert: {completedCount}/8 erfolgreich, {failedCount} fehlgeschlagen
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-brand-400" />
            Branding-Paket
          </CardTitle>
          <ul className="mt-4 grid grid-cols-2 gap-2">
            {PACK_ASSETS.map((asset) => {
              const job = jobs.find((j) => j.module === asset.key);
              const done = job?.status === 'completed';
              const failed = job?.status === 'failed';
              return (
                <li
                  key={asset.key}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                    failed
                      ? 'border-red-500/30 text-red-300'
                      : done
                        ? 'border-emerald-500/30 text-emerald-200'
                        : 'border-zinc-800 text-zinc-300'
                  }`}
                >
                  {failed ? (
                    <XCircle className="h-3.5 w-3.5 shrink-0" />
                  ) : done ? (
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  ) : null}
                  {asset.label}
                </li>
              );
            })}
          </ul>
          <Button
            className="mt-6 w-full gap-2"
            onClick={handleGenerate}
            loading={loading}
            disabled={!activeDna || (user?.coinBalance ?? 0) < 50}
          >
            <Sparkles className="h-4 w-4" />
            Komplettes Paket generieren
          </Button>
        </Card>

        <Card>
          <CardTitle className="flex items-center gap-2">
            <Dna className="h-5 w-5 text-brand-400" />
            Generierte Assets
          </CardTitle>
          {jobs.length > 0 ? (
            <div className="mt-4 grid grid-cols-4 gap-2">
              {jobs.map((job) => (
                <div key={job.id} className="text-center">
                  {job.status === 'failed' ? (
                    <div
                      className="flex aspect-square flex-col items-center justify-center rounded-lg border border-red-500/30 bg-red-500/10 p-1 text-[10px] text-red-300"
                      title={job.error}
                    >
                      <XCircle className="mb-1 h-4 w-4" />
                      {PACK_ASSETS.find((a) => a.key === job.module)?.label ?? job.module}
                    </div>
                  ) : job.imageUrl ? (
                    <img
                      src={job.imageUrl}
                      alt={job.module}
                      className="aspect-square w-full rounded-lg border border-zinc-800 object-cover"
                    />
                  ) : (
                    <div className="flex aspect-square items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-xs text-zinc-500">
                      {job.module}
                    </div>
                  )}
                  <p className="mt-1 text-xs capitalize text-zinc-500">
                    {PACK_ASSETS.find((a) => a.key === job.module)?.label ?? job.module}
                  </p>
                  {job.exports?.png && (
                    <a
                      href={job.exports.png}
                      download={`${job.module}.png`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-[10px] text-brand-400 hover:underline"
                    >
                      <Download className="h-3 w-3" /> PNG
                    </a>
                  )}
                </div>
              ))}
            </div>
          ) : activeDna ? (
            <div className="mt-4">
              <p className="font-medium text-zinc-200">{activeDna.name}</p>
              <p className="text-sm text-zinc-400">Stil: {activeDna.styleDirection}</p>
              <div className="mt-3 flex gap-2">
                {[...activeDna.primaryColors, ...activeDna.secondaryColors].map((c) => (
                  <div key={c} className="h-8 w-8 rounded-lg border border-zinc-700" style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
          ) : (
            <p className="mt-4 text-sm text-zinc-500">Keine aktive DNA</p>
          )}
        </Card>
      </div>
    </div>
  );
}
