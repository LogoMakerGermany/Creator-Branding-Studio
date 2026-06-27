import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, AlertCircle, CheckCircle2, Dna, Package } from 'lucide-react';
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

  async function handleGenerate() {
    if (!activeDna) {
      setError('Erstelle zuerst eine Creator DNA');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await api.studio.generateBrandingPack();
      if (res.jobs) setJobs(res.jobs);
      await refreshUser();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Generierung fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }

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

      {jobs.length > 0 && (
        <div className="mb-6 flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-300">
          <CheckCircle2 className="h-5 w-5" />
          Branding-Paket generiert: alle 8 Assets · gespeichert in Datei Cloud
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-brand-400" />
            Branding-Paket
          </CardTitle>
          <ul className="mt-4 grid grid-cols-2 gap-2">
            {PACK_ASSETS.map((asset) => (
              <li key={asset.key} className="rounded-lg border border-zinc-800 px-3 py-2 text-sm text-zinc-300">
                {asset.label}
              </li>
            ))}
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
                  {job.imageUrl ? (
                    <img src={job.imageUrl} alt={job.module} className="aspect-square w-full rounded-lg border border-zinc-800 object-cover" />
                  ) : (
                    <div className="flex aspect-square items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-xs text-zinc-500">
                      {job.module}
                    </div>
                  )}
                  <p className="mt-1 text-xs capitalize text-zinc-500">
                    {PACK_ASSETS.find((a) => a.key === job.module)?.label ?? job.module}
                  </p>
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
