import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, Dna, Palette, Sparkles } from 'lucide-react';
import {
  PageHeader,
  Badge,
  Button,
  NeonCard,
  CardTitle,
  Input,
} from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/services/api';
import { extractColorsFromImage, fileToDataUrl } from '@/lib/color-extract';

const STYLES = [
  'gaming', 'streaming', 'esports', 'neon', 'anime', 'fantasy', 'horror', 'music',
] as const;

const PLATFORMS = ['twitch', 'youtube', 'tiktok', 'instagram', 'discord'] as const;

export function CreatorDNAPage() {
  const { activeDna, refreshUser } = useAuth();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState('');
  const [clanName, setClanName] = useState('');
  const [games, setGames] = useState('');
  const [mascot, setMascot] = useState('');
  const [style, setStyle] = useState<string>('gaming');
  const [colors, setColors] = useState<string[]>([]);
  const [platforms, setPlatforms] = useState<string[]>(['twitch', 'youtube']);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Awaited<ReturnType<typeof api.dna.analyze>>['analysis'] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);
    try {
      const extracted = await extractColorsFromImage(file);
      const dataUrl = await fileToDataUrl(file);
      setColors(extracted);
      setPreviewUrl(dataUrl);
      const { analysis: result } = await api.dna.analyze(extracted, style, dataUrl);
      setAnalysis(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analyse fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!name.trim()) {
      setError('Bitte gib deiner DNA einen Namen');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await api.dna.create({
        name: [name.trim(), clanName && `Clan: ${clanName}`, games && `Games: ${games}`, mascot && `Mascot: ${mascot}`]
          .filter(Boolean)
          .join(' · '),
        styleDirection: style,
        primaryColors: colors.slice(0, 2),
        secondaryColors: colors.slice(2, 4),
        accentColors: colors.slice(4, 6),
        targetPlatforms: platforms,
      });
      setShowCreateForm(false);
      await refreshUser();
      navigate('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erstellung fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }

  function togglePlatform(p: string) {
    setPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  }

  if (activeDna && !showCreateForm) {
    return (
      <div>
        <PageHeader
          title="Creator DNA Engine"
          description="Deine aktive Markenidentität"
          badge={<Badge variant="success">Aktiv</Badge>}
          backTo="/settings"
          backLabel="Einstellungen"
        />
        <NeonCard accent="cyan">
          <div className="flex flex-col gap-6 lg:flex-row">
            <div className="flex-1">
              <CardTitle>{activeDna.name}</CardTitle>
              <p className="mt-1 text-sm text-zinc-400">
                Stil: {activeDna.styleDirection} · Version {activeDna.version}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {[...activeDna.primaryColors, ...activeDna.secondaryColors, ...activeDna.accentColors]
                  .filter(Boolean)
                  .map((c) => (
                    <div key={c} className="flex items-center gap-2 rounded-lg border border-zinc-700 px-3 py-1.5">
                      <div className="h-5 w-5 rounded" style={{ backgroundColor: c }} />
                      <span className="font-mono text-xs text-zinc-400">{c}</span>
                    </div>
                  ))}
              </div>
              {activeDna.aiAnalysis && (
                <div className="mt-4 space-y-2">
                  <p className="text-sm font-medium text-zinc-300">KI-Vorschläge</p>
                  {activeDna.aiAnalysis.suggestions.map((s) => (
                    <p key={s} className="text-sm text-zinc-400">• {s}</p>
                  ))}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Button onClick={() => setShowCreateForm(true)} variant="outline">
                Neue DNA erstellen
              </Button>
              <Button onClick={() => navigate('/logo-studio')}>Logo Studio öffnen</Button>
            </div>
          </div>
        </NeonCard>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Creator DNA Engine"
        description="Analysiere deine Assets und erstelle deine einzigartige Creator DNA"
        badge={<Badge variant="brand">UCBS</Badge>}
        backTo="/settings"
        backLabel="Einstellungen"
      />

      {error && (
        <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-red-300">
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <NeonCard accent="cyan" title={
          <span className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-[var(--ucbs-accent-cyan)]" />
            Asset hochladen
          </span>
        }>
          <p className="mt-2 text-sm text-zinc-400">
            Logo, Profilbild oder Banner – wir extrahieren Farben und Stil.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileUpload}
          />
          <Button
            className="mt-4 w-full gap-2"
            variant="secondary"
            onClick={() => fileRef.current?.click()}
            loading={loading}
          >
            <Upload className="h-4 w-4" />
            Bild auswählen
          </Button>
          {previewUrl && (
            <img
              src={previewUrl}
              alt="Preview"
              className="mt-4 max-h-48 rounded-lg border border-zinc-700 object-contain"
            />
          )}
        </NeonCard>

        <NeonCard accent="purple" title={
          <span className="flex items-center gap-2">
            <Palette className="h-5 w-5 text-[var(--ucbs-accent-purple)]" />
            Farbpalette
          </span>
        }>
          {colors.length > 0 ? (
            <div className="mt-4 grid grid-cols-3 gap-2">
              {colors.map((c, i) => (
                <div key={c} className="text-center">
                  <div
                    className="mx-auto h-12 w-12 rounded-lg border border-zinc-700"
                    style={{ backgroundColor: c }}
                  />
                  <p className="mt-1 font-mono text-[10px] text-zinc-500">{c}</p>
                  <p className="text-[10px] text-zinc-600">
                    {i < 2 ? 'Primary' : i < 4 ? 'Secondary' : 'Accent'}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-zinc-500">Lade ein Bild hoch, um Farben zu extrahieren</p>
          )}
          {analysis && (
            <p className="mt-4 text-sm text-brand-300">
              Erkannter Stil: {analysis.detectedStyle} ({Math.round(analysis.confidence * 100)}%)
            </p>
          )}
        </NeonCard>

        <NeonCard accent="green" className="lg:col-span-2" title={
          <span className="flex items-center gap-2">
            <Dna className="h-5 w-5 text-[var(--ucbs-accent-green)]" />
            DNA konfigurieren
          </span>
        }>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Input
              label="DNA Name"
              placeholder="z.B. Mein Stream Brand"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Input
              label="Clan / Team"
              placeholder="z.B. Team Phoenix"
              value={clanName}
              onChange={(e) => setClanName(e.target.value)}
            />
            <Input
              label="Hauptspiele"
              placeholder="z.B. Valorant, Fortnite"
              value={games}
              onChange={(e) => setGames(e.target.value)}
            />
            <Input
              label="Maskottchen / Mascot"
              placeholder="z.B. Cyber-Wolf"
              value={mascot}
              onChange={(e) => setMascot(e.target.value)}
            />
            <div>
              <label className="mb-1.5 block text-sm font-medium text-zinc-300">Stilrichtung</label>
              <select
                value={style}
                onChange={(e) => setStyle(e.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-surface-900 px-4 py-2.5 text-sm text-zinc-100"
              >
                {STYLES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4">
            <label className="mb-2 block text-sm font-medium text-zinc-300">Zielplattformen</label>
            <div className="flex flex-wrap gap-2">
              {PLATFORMS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => togglePlatform(p)}
                  className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors ${
                    platforms.includes(p)
                      ? 'bg-brand-600 text-white'
                      : 'border border-zinc-700 text-zinc-400 hover:border-zinc-600'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <Button
            className="mt-6 gap-2"
            onClick={handleCreate}
            loading={loading}
            disabled={!name.trim()}
          >
            <Sparkles className="h-4 w-4" />
            Creator DNA erstellen
          </Button>
        </NeonCard>
      </div>
    </div>
  );
}
