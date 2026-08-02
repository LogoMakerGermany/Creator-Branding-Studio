import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, Dna, Palette, Sparkles, Save } from 'lucide-react';
import {
  STYLE_DIRECTIONS,
  DNA_PLATFORMS,
  type StyleDirection,
} from '@ucbs/shared';
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

export function CreatorDNAPage() {
  const { activeDna, refreshUser } = useAuth();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState('');
  const [clanName, setClanName] = useState('');
  const [mascot, setMascot] = useState('');
  const [genres, setGenres] = useState('');
  const [gamingStyle, setGamingStyle] = useState('');
  const [brandingStyle, setBrandingStyle] = useState('');
  const [promptStyle, setPromptStyle] = useState('');
  const [visualLanguage, setVisualLanguage] = useState('');
  const [animations, setAnimations] = useState('');
  const [personalGuidelines, setPersonalGuidelines] = useState('');
  const [primaryFont, setPrimaryFont] = useState('');
  const [secondaryFont, setSecondaryFont] = useState('');
  const [style, setStyle] = useState<StyleDirection>('gaming');
  const [colors, setColors] = useState<string[]>([]);
  const [platforms, setPlatforms] = useState<string[]>(['twitch', 'youtube']);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Awaited<ReturnType<typeof api.dna.analyze>>['analysis'] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!activeDna) return;
    setName(activeDna.name);
    setClanName(activeDna.clanName ?? '');
    setMascot(activeDna.mascot ?? '');
    setGenres((activeDna.favoriteGenres ?? []).join(', '));
    setGamingStyle(activeDna.gamingStyle ?? '');
    setBrandingStyle(activeDna.brandingStyle ?? '');
    setPromptStyle(activeDna.promptStyle ?? '');
    setVisualLanguage(activeDna.visualLanguage ?? '');
    setAnimations((activeDna.animations ?? []).join(', '));
    setPersonalGuidelines(activeDna.personalGuidelines ?? '');
    setPrimaryFont(activeDna.fonts?.find((f) => f.role === 'primary')?.name ?? '');
    setSecondaryFont(activeDna.fonts?.find((f) => f.role === 'secondary')?.name ?? '');
    setStyle(activeDna.styleDirection);
    setColors([
      ...activeDna.primaryColors,
      ...activeDna.secondaryColors,
      ...activeDna.accentColors,
    ].filter(Boolean));
    setPlatforms(activeDna.platformOptimization?.map((p) => p.platform) ?? ['twitch', 'youtube']);
    setAnalysis(activeDna.aiAnalysis ?? null);
    const logo = activeDna.sourceAssets?.find((a) => a.type === 'logo' || a.type === 'reference');
    if (logo?.url) setPreviewUrl(logo.url);
  }, [activeDna]);

  function parseList(value: string): string[] {
    return value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function buildPayload() {
    const fonts = [
      primaryFont.trim()
        ? { name: primaryFont.trim(), role: 'primary' as const, source: 'google' as const }
        : null,
      secondaryFont.trim()
        ? { name: secondaryFont.trim(), role: 'secondary' as const, source: 'google' as const }
        : null,
    ].filter(Boolean) as NonNullable<Parameters<typeof api.dna.create>[0]['fonts']>;

    const sourceAssets = previewUrl
      ? [
          {
            id: crypto.randomUUID(),
            type: 'reference' as const,
            url: previewUrl,
            analyzedAt: analysis?.analyzedAt,
          },
        ]
      : undefined;

    return {
      name: name.trim(),
      clanName: clanName.trim() || undefined,
      mascot: mascot.trim() || undefined,
      styleDirection: style,
      primaryColors: colors.slice(0, 2),
      secondaryColors: colors.slice(2, 4),
      accentColors: colors.slice(4, 6),
      targetPlatforms: platforms,
      favoriteGenres: parseList(genres),
      gamingStyle: gamingStyle.trim() || undefined,
      brandingStyle: brandingStyle.trim() || undefined,
      promptStyle: promptStyle.trim() || undefined,
      visualLanguage: visualLanguage.trim() || undefined,
      animations: parseList(animations),
      personalGuidelines: personalGuidelines.trim() || undefined,
      fonts: fonts?.length ? fonts : undefined,
      sourceAssets,
    };
  }

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
      if (result.detectedStyle) setStyle(result.detectedStyle as StyleDirection);
      if (result.colorPalette?.length) {
        setColors(result.colorPalette.map((c) => c.hex));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analyse fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!name.trim()) {
      setError('Bitte gib deiner DNA einen Namen');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const payload = buildPayload();
      if (activeDna) {
        await api.dna.update(activeDna.id, payload);
      } else {
        await api.dna.create(payload);
      }
      setEditing(false);
      await refreshUser();
      if (!activeDna) navigate('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }

  function togglePlatform(p: string) {
    setPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  }

  const showForm = !activeDna || editing;

  if (activeDna && !editing) {
    return (
      <div>
        <PageHeader
          title="Creator DNA"
          description="Deine einzige Markenidentität — Grundlage aller Generatoren"
          badge={<Badge variant="success">Aktiv</Badge>}
          backTo="/settings"
          backLabel="Einstellungen"
        />
        <NeonCard accent="cyan">
          <div className="flex flex-col gap-6 lg:flex-row">
            <div className="flex-1 space-y-4">
              <div>
                <CardTitle>{activeDna.name}</CardTitle>
                <p className="mt-1 text-sm text-zinc-400">
                  Stil: {activeDna.styleDirection}
                  {activeDna.clanName ? ` · Clan: ${activeDna.clanName}` : ''}
                  {activeDna.mascot ? ` · Mascot: ${activeDna.mascot}` : ''}
                  {' · '}Version {activeDna.version}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {[...activeDna.primaryColors, ...activeDna.secondaryColors, ...activeDna.accentColors]
                  .filter(Boolean)
                  .map((c) => (
                    <div key={c} className="flex items-center gap-2 rounded-lg border border-zinc-700 px-3 py-1.5">
                      <div className="h-5 w-5 rounded" style={{ backgroundColor: c }} />
                      <span className="font-mono text-xs text-zinc-400">{c}</span>
                    </div>
                  ))}
              </div>
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-zinc-500">Genres</dt>
                  <dd className="text-zinc-300">{(activeDna.favoriteGenres ?? []).join(', ') || '—'}</dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Plattformen</dt>
                  <dd className="text-zinc-300 capitalize">
                    {activeDna.platformOptimization?.map((p) => p.platform).join(', ') || '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Gaming-Stil</dt>
                  <dd className="text-zinc-300">{activeDna.gamingStyle || '—'}</dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Branding-Stil</dt>
                  <dd className="text-zinc-300">{activeDna.brandingStyle || '—'}</dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Bildsprache</dt>
                  <dd className="text-zinc-300">{activeDna.visualLanguage || '—'}</dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Schriftarten</dt>
                  <dd className="text-zinc-300">
                    {activeDna.fonts?.map((f) => f.name).join(', ') || '—'}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-zinc-500">Persönliche Vorgaben</dt>
                  <dd className="text-zinc-300">{activeDna.personalGuidelines || '—'}</dd>
                </div>
              </dl>
              {activeDna.aiAnalysis && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-zinc-300">
                    Analyse ({activeDna.aiAnalysis.source === 'vision' ? 'KI-Vision' : 'Farben'})
                  </p>
                  {activeDna.aiAnalysis.suggestions.map((s) => (
                    <p key={s} className="text-sm text-zinc-400">• {s}</p>
                  ))}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Button onClick={() => setEditing(true)}>DNA bearbeiten</Button>
              <Button onClick={() => navigate('/logo-studio')} variant="outline">
                Logo Studio öffnen
              </Button>
            </div>
          </div>
        </NeonCard>
      </div>
    );
  }

  if (!showForm) return null;

  return (
    <div>
      <PageHeader
        title={activeDna ? 'Creator DNA bearbeiten' : 'Creator DNA erstellen'}
        description="Jeder Creator hat genau eine DNA — alle Studios greifen darauf zu"
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
        <NeonCard
          accent="cyan"
          title={
            <span className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-[var(--ucbs-accent-cyan)]" />
              Asset hochladen
            </span>
          }
        >
          <p className="mt-2 text-sm text-zinc-400">
            Logo, Profilbild oder Banner — Farben und Stil werden analysiert und gespeichert.
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

        <NeonCard
          accent="purple"
          title={
            <span className="flex items-center gap-2">
              <Palette className="h-5 w-5 text-[var(--ucbs-accent-purple)]" />
              Farbpalette
            </span>
          }
        >
          {colors.length > 0 ? (
            <div className="mt-4 grid grid-cols-3 gap-2">
              {colors.map((c, i) => (
                <div key={`${c}-${i}`} className="text-center">
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
            <p className="mt-4 text-sm text-zinc-500">Lade ein Bild hoch oder setze Farben nach dem Speichern</p>
          )}
          {analysis && (
            <p className="mt-4 text-sm text-brand-300">
              Erkannter Stil: {analysis.detectedStyle} ({Math.round(analysis.confidence * 100)}%
              {analysis.source === 'vision' ? ', KI-Vision' : ', Farbanalyse'})
            </p>
          )}
        </NeonCard>

        <NeonCard
          accent="green"
          className="lg:col-span-2"
          title={
            <span className="flex items-center gap-2">
              <Dna className="h-5 w-5 text-[var(--ucbs-accent-green)]" />
              DNA konfigurieren
            </span>
          }
        >
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Input label="DNA Name" placeholder="z.B. Mein Stream Brand" value={name} onChange={(e) => setName(e.target.value)} />
            <Input label="Clan / Team" placeholder="z.B. Team Phoenix" value={clanName} onChange={(e) => setClanName(e.target.value)} />
            <Input label="Lieblingsgenres / Games" placeholder="z.B. Valorant, Fortnite" value={genres} onChange={(e) => setGenres(e.target.value)} />
            <Input label="Maskottchen" placeholder="z.B. Cyber-Wolf" value={mascot} onChange={(e) => setMascot(e.target.value)} />
            <Input label="Gaming-Stil" placeholder="z.B. Competitive FPS, high-energy" value={gamingStyle} onChange={(e) => setGamingStyle(e.target.value)} />
            <Input label="Branding-Stil" placeholder="z.B. Bold esports, clean minimal" value={brandingStyle} onChange={(e) => setBrandingStyle(e.target.value)} />
            <Input label="Prompt-Stil" placeholder="z.B. cinematic, detailed, neon accents" value={promptStyle} onChange={(e) => setPromptStyle(e.target.value)} />
            <Input label="Bildsprache" placeholder="z.B. sharp geometry, dark gradients" value={visualLanguage} onChange={(e) => setVisualLanguage(e.target.value)} />
            <Input label="Animationen" placeholder="z.B. glow pulses, wipe transitions" value={animations} onChange={(e) => setAnimations(e.target.value)} />
            <Input label="Primär-Schrift" placeholder="z.B. Orbitron" value={primaryFont} onChange={(e) => setPrimaryFont(e.target.value)} />
            <Input label="Sekundär-Schrift" placeholder="z.B. Inter" value={secondaryFont} onChange={(e) => setSecondaryFont(e.target.value)} />
            <div>
              <label className="mb-1.5 block text-sm font-medium text-zinc-300">Stilrichtung</label>
              <select
                value={style}
                onChange={(e) => setStyle(e.target.value as StyleDirection)}
                className="w-full rounded-lg border border-zinc-700 bg-surface-900 px-4 py-2.5 text-sm text-zinc-100"
              >
                {STYLE_DIRECTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-sm font-medium text-zinc-300">Persönliche Vorgaben</label>
              <textarea
                value={personalGuidelines}
                onChange={(e) => setPersonalGuidelines(e.target.value)}
                rows={3}
                placeholder="Was Generatoren immer beachten sollen…"
                className="w-full rounded-lg border border-zinc-700 bg-surface-900 px-4 py-2.5 text-sm text-zinc-100"
              />
            </div>
          </div>

          <div className="mt-4">
            <label className="mb-2 block text-sm font-medium text-zinc-300">Zielplattformen</label>
            <div className="flex flex-wrap gap-2">
              {DNA_PLATFORMS.map((p) => (
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

          <div className="mt-6 flex flex-wrap gap-3">
            <Button className="gap-2" onClick={handleSave} loading={loading} disabled={!name.trim()}>
              {activeDna ? <Save className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
              {activeDna ? 'DNA speichern' : 'Creator DNA erstellen'}
            </Button>
            {activeDna && (
              <Button variant="outline" onClick={() => setEditing(false)} disabled={loading}>
                Abbrechen
              </Button>
            )}
          </div>
        </NeonCard>
      </div>
    </div>
  );
}
