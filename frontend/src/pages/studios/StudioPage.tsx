import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, AlertCircle, CheckCircle2, Dna, Download } from 'lucide-react';
import { PageHeader, Badge, Button, Card, CardTitle } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { api, ApiError } from '@/services/api';
import { formatCoins } from '@/lib/utils';

interface StudioPageProps {
  title: string;
  description: string;
  module: 'logo' | 'banner' | 'facecam';
  coinCost: number;
  styles?: string[];
  exports?: string[];
  styleLabel?: string;
}

export function StudioPage({
  title,
  description,
  module,
  coinCost,
  styles = [],
  exports = ['PNG'],
  styleLabel = 'Stil',
}: StudioPageProps) {
  const { user, activeDna, refreshUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const [selectedStyle, setSelectedStyle] = useState(styles[0] ?? '');
  const [jobInfo, setJobInfo] = useState<{ jobId: string; newBalance?: number } | null>(null);

  async function handleGenerate() {
    if (!activeDna) {
      setError('Erstelle zuerst eine Creator DNA');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const options =
        module === 'banner'
          ? { platform: selectedStyle }
          : selectedStyle
            ? { style: selectedStyle }
            : undefined;
      const res = await api.studio.generate(module, options);
      setJobInfo({ jobId: res.jobId, newBalance: res.newBalance });
      if (res.imageUrl) {
        setImageUrl(res.imageUrl);
        setProvider(res.provider ?? null);
      }
      await refreshUser();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Generierung fehlgeschlagen');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <PageHeader
        title={title}
        description={description}
        badge={<Badge variant="brand">KI-generiert</Badge>}
        actions={<Badge variant="default">{formatCoins(coinCost)} Coins</Badge>}
      />

      {!activeDna && (
        <div className="mb-6 flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-amber-200">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm">Du brauchst eine Creator DNA, bevor du generieren kannst.</p>
          </div>
          <Link to="/creator-dna">
            <Button size="sm" variant="outline" className="gap-1">
              <Dna className="h-4 w-4" />
              DNA erstellen
            </Button>
          </Link>
        </div>
      )}

      {error && (
        <div className="mb-6 flex items-center gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-red-300">
          <AlertCircle className="h-5 w-5" />
          {error}
        </div>
      )}

      {imageUrl && (
        <div className="mb-6 flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-300">
          <CheckCircle2 className="h-5 w-5" />
          <div>
            <p>Generierung abgeschlossen{provider ? ` (${provider})` : ''}</p>
            {jobInfo && (
              <p className="mt-1 text-xs opacity-75">
                Guthaben: {formatCoins(jobInfo.newBalance ?? 0)} Coins · Gespeichert in Datei Cloud
              </p>
            )}
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex aspect-video items-center justify-center overflow-hidden rounded-lg border border-zinc-800 bg-surface-900/50">
            {imageUrl ? (
              <img src={imageUrl} alt={title} className="h-full w-full object-contain" />
            ) : (
              <div className="text-center">
                <Sparkles className="mx-auto h-12 w-12 text-zinc-600" />
                <p className="mt-2 text-sm text-zinc-500">KI-Vorschau erscheint hier</p>
                {activeDna && (
                  <div className="mt-4 flex justify-center gap-2">
                    {activeDna.primaryColors.map((c) => (
                      <div key={c} className="h-6 w-6 rounded" style={{ backgroundColor: c }} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="mt-4 flex gap-2">
            <Button
              className="flex-1 gap-2"
              onClick={handleGenerate}
              loading={loading}
              disabled={!activeDna || (user?.coinBalance ?? 0) < coinCost}
            >
              <Sparkles className="h-4 w-4" />
              Generieren ({formatCoins(coinCost)} Coins)
            </Button>
            {imageUrl && (
              <a href={imageUrl} download target="_blank" rel="noreferrer">
                <Button variant="outline" className="gap-2">
                  <Download className="h-4 w-4" />
                  PNG
                </Button>
              </a>
            )}
          </div>
        </Card>

        <div className="space-y-4">
          {activeDna && (
            <Card>
              <CardTitle className="text-sm">Aktive DNA</CardTitle>
              <p className="mt-1 text-sm text-zinc-400">{activeDna.name}</p>
              <p className="text-xs text-zinc-500">Stil: {activeDna.styleDirection}</p>
            </Card>
          )}

          {styles.length > 0 && (
            <Card>
              <CardTitle className="text-sm">{styleLabel}</CardTitle>
              <div className="mt-2 flex flex-wrap gap-1">
                {styles.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSelectedStyle(s)}
                    className={`rounded-lg border px-2 py-1 text-xs ${
                      selectedStyle === s
                        ? 'border-brand-500 bg-brand-500/10 text-brand-300'
                        : 'border-zinc-800 text-zinc-400'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </Card>
          )}

          <Card>
            <CardTitle className="text-sm">Export</CardTitle>
            <div className="mt-2 flex flex-wrap gap-1">
              {exports.map((e) => (
                <Badge key={e} variant="brand">{e}</Badge>
              ))}
            </div>
          </Card>

          <Card>
            <CardTitle className="text-sm">Guthaben</CardTitle>
            <p className="mt-1 font-display text-xl font-bold text-zinc-100">
              {formatCoins(user?.coinBalance ?? 0)} Coins
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
