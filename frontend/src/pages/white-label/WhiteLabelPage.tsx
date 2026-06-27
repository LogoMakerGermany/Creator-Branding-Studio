import { useEffect, useState } from 'react';
import { PageHeader, Badge, Button, Card, CardTitle, Input, StatCard } from '@/components/ui';
import { Palette, Globe, Save } from 'lucide-react';
import { api, ApiError, type WhiteLabelConfig, type WhiteLabelPreview } from '@/services/api';

export function WhiteLabelPage() {
  const [config, setConfig] = useState<WhiteLabelConfig | null>(null);
  const [preview, setPreview] = useState<WhiteLabelPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    const res = await api.whiteLabel.get();
    setConfig(res.config);
    setPreview(res.preview);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!config) return;
    setLoading(true);
    setError(null);
    setSaved(false);
    try {
      const res = await api.whiteLabel.update(config);
      setConfig(res.config);
      setPreview(res.preview);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Speichern fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }

  function update(field: keyof WhiteLabelConfig, value: string | boolean) {
    setConfig((prev) => prev ? { ...prev, [field]: value } : prev);
  }

  if (!config) return null;

  return (
    <div>
      <PageHeader
        title="White Label"
        description="Eigene Domain, Farben und Plattform-Branding konfigurieren"
        badge={<Badge variant="brand">UCBS</Badge>}
      />

      {error && <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-red-300">{error}</div>}
      {saved && <div className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-emerald-300">Gespeichert!</div>}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle className="flex items-center gap-2"><Palette className="h-4 w-4" /> Konfiguration</CardTitle>
          <form onSubmit={handleSave} className="mt-4 space-y-4">
            <label className="flex items-center gap-3 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={(e) => update('enabled', e.target.checked)}
                className="rounded border-zinc-700"
              />
              White Label aktivieren
            </label>
            <Input
              placeholder="Plattform-Name"
              value={config.platformName ?? ''}
              onChange={(e) => update('platformName', e.target.value)}
            />
            <Input
              placeholder="Custom Domain (z.B. studio.meineagentur.de)"
              value={config.customDomain ?? ''}
              onChange={(e) => update('customDomain', e.target.value)}
            />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-zinc-500">Primärfarbe</label>
                <Input type="color" value={config.primaryColor ?? '#7C3AED'} onChange={(e) => update('primaryColor', e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-zinc-500">Sekundärfarbe</label>
                <Input type="color" value={config.secondaryColor ?? '#1E1B4B'} onChange={(e) => update('secondaryColor', e.target.value)} />
              </div>
            </div>
            <Input
              placeholder="Logo URL (optional)"
              value={config.logoUrl ?? ''}
              onChange={(e) => update('logoUrl', e.target.value)}
            />
            <Button type="submit" loading={loading} className="gap-2">
              <Save className="h-4 w-4" />
              Speichern
            </Button>
          </form>
        </Card>

        <Card>
          <CardTitle className="flex items-center gap-2"><Globe className="h-4 w-4" /> Live-Vorschau</CardTitle>
          <div
            className="mt-4 overflow-hidden rounded-lg border border-zinc-800"
            style={{
              background: `linear-gradient(135deg, ${config.secondaryColor ?? '#1E1B4B'}, ${config.primaryColor ?? '#7C3AED'})`,
            }}
          >
            <div className="p-8 text-center">
              {config.logoUrl ? (
                <img src={config.logoUrl} alt="Logo" className="mx-auto h-16 object-contain" />
              ) : (
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-xl bg-white/10 text-2xl font-bold text-white">
                  {(config.platformName ?? 'UCBS').slice(0, 2).toUpperCase()}
                </div>
              )}
              <h3 className="mt-4 text-xl font-bold text-white">{preview?.platformName ?? config.platformName}</h3>
              {config.customDomain && (
                <p className="mt-1 text-sm text-white/70">{config.customDomain}</p>
              )}
              <div className="mt-6 flex justify-center gap-3">
                <div className="rounded-lg bg-white/20 px-4 py-2 text-sm text-white">Dashboard</div>
                <div className="rounded-lg bg-white/10 px-4 py-2 text-sm text-white/70">Studios</div>
                <div className="rounded-lg bg-white/10 px-4 py-2 text-sm text-white/70">Marketplace</div>
              </div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <StatCard label="Status" value={config.enabled ? 'Aktiv' : 'Inaktiv'} />
            <StatCard label="Domain" value={config.customDomain ?? '—'} />
          </div>
        </Card>
      </div>
    </div>
  );
}
