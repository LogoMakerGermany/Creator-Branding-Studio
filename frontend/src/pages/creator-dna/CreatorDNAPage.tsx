import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, Dna, Palette, Sparkles, Save, Lock } from 'lucide-react';
import {
  STYLE_DIRECTIONS,
  DNA_PLATFORMS,
  DNA_CHARACTER_TYPES,
  type StyleDirection,
  type DNAVersion,
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
import { useBrandProjectStore } from '@/v2/store/brand-project-store';

type LockState = {
  name: boolean;
  colors: boolean;
  character: boolean;
  style: boolean;
  typography: boolean;
};

const EMPTY_LOCKS: LockState = {
  name: false,
  colors: false,
  character: false,
  style: false,
  typography: false,
};

export function CreatorDNAPage() {
  const { activeDna, refreshUser } = useAuth();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const activeProjectId = useBrandProjectStore((s) => s.activeProjectId);

  const [name, setName] = useState('');
  const [clanName, setClanName] = useState('');
  const [slogan, setSlogan] = useState('');
  const [usagePurpose, setUsagePurpose] = useState('');
  const [mascot, setMascot] = useState('');
  const [charPresent, setCharPresent] = useState(false);
  const [charType, setCharType] = useState('custom');
  const [charDescription, setCharDescription] = useState('');
  const [charClothing, setCharClothing] = useState('');
  const [charHair, setCharHair] = useState('');
  const [charFace, setCharFace] = useState('');
  const [charAccessories, setCharAccessories] = useState('');
  const [charTraits, setCharTraits] = useState('');
  const [genres, setGenres] = useState('');
  const [gamingStyle, setGamingStyle] = useState('');
  const [brandingStyle, setBrandingStyle] = useState('');
  const [promptStyle, setPromptStyle] = useState('');
  const [visualLanguage, setVisualLanguage] = useState('');
  const [animations, setAnimations] = useState('');
  const [personalGuidelines, setPersonalGuidelines] = useState('');
  const [primaryFont, setPrimaryFont] = useState('');
  const [secondaryFont, setSecondaryFont] = useState('');
  const [typoCharacter, setTypoCharacter] = useState('');
  const [typoWeight, setTypoWeight] = useState('');
  const [typoDirection, setTypoDirection] = useState('');
  const [typoName, setTypoName] = useState('');
  const [atmLighting, setAtmLighting] = useState('');
  const [atmMood, setAtmMood] = useState('');
  const [atmEffects, setAtmEffects] = useState('');
  const [atmParticles, setAtmParticles] = useState(false);
  const [atmGlow, setAtmGlow] = useState(false);
  const [atmSmoke, setAtmSmoke] = useState(false);
  const [outputPlatform, setOutputPlatform] = useState('');
  const [outputRatios, setOutputRatios] = useState('');
  const [style, setStyle] = useState<StyleDirection>('gaming');
  const [dimension, setDimension] = useState<'2d' | '3d'>('2d');
  const [colors, setColors] = useState<string[]>([]);
  const [bgColors, setBgColors] = useState('');
  const [platforms, setPlatforms] = useState<string[]>(['twitch', 'youtube']);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Awaited<ReturnType<typeof api.dna.analyze>>['analysis'] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [locks, setLocks] = useState<LockState>(EMPTY_LOCKS);
  const [versions, setVersions] = useState<DNAVersion[]>([]);

  useEffect(() => {
    if (!activeDna) return;
    setName(activeDna.name);
    setClanName(activeDna.clanName ?? '');
    setSlogan(activeDna.slogan ?? '');
    setUsagePurpose(activeDna.usagePurpose ?? '');
    setMascot(activeDna.mascot ?? '');
    setCharPresent(Boolean(activeDna.character?.present || activeDna.mascot));
    setCharType(activeDna.character?.type ?? 'custom');
    setCharDescription(activeDna.character?.description ?? activeDna.mascot ?? '');
    setCharClothing(activeDna.character?.clothing ?? '');
    setCharHair(activeDna.character?.hair ?? '');
    setCharFace(activeDna.character?.face ?? '');
    setCharAccessories(activeDna.character?.accessories ?? '');
    setCharTraits((activeDna.character?.traits ?? []).join(', '));
    setGenres((activeDna.favoriteGenres ?? []).join(', '));
    setGamingStyle(activeDna.gamingStyle ?? '');
    setBrandingStyle(activeDna.brandingStyle ?? '');
    setPromptStyle(activeDna.promptStyle ?? '');
    setVisualLanguage(activeDna.visualLanguage ?? '');
    setAnimations((activeDna.animations ?? []).join(', '));
    setPersonalGuidelines(activeDna.personalGuidelines ?? '');
    setPrimaryFont(activeDna.fonts?.find((f) => f.role === 'primary')?.name ?? '');
    setSecondaryFont(activeDna.fonts?.find((f) => f.role === 'secondary')?.name ?? '');
    setTypoCharacter(activeDna.typography?.character ?? '');
    setTypoWeight(activeDna.typography?.weight ?? '');
    setTypoDirection(activeDna.typography?.direction ?? '');
    setTypoName(activeDna.typography?.nameTreatment ?? '');
    setAtmLighting(activeDna.atmosphere?.lighting ?? activeDna.lightingStyle ?? '');
    setAtmMood(activeDna.atmosphere?.mood ?? '');
    setAtmEffects((activeDna.atmosphere?.effects ?? []).join(', '));
    setAtmParticles(Boolean(activeDna.atmosphere?.particles));
    setAtmGlow(Boolean(activeDna.atmosphere?.glow));
    setAtmSmoke(Boolean(activeDna.atmosphere?.smoke));
    setOutputPlatform(activeDna.outputPrefs?.platform ?? '');
    setOutputRatios((activeDna.outputPrefs?.aspectRatios ?? []).join(', '));
    setStyle(activeDna.styleDirection);
    setDimension(activeDna.dimension === '3d' ? '3d' : '2d');
    setColors(
      [...activeDna.primaryColors, ...activeDna.secondaryColors, ...activeDna.accentColors].filter(Boolean)
    );
    setBgColors((activeDna.backgroundColors ?? []).join(', '));
    setPlatforms(activeDna.platformOptimization?.map((p) => p.platform) ?? ['twitch', 'youtube']);
    setAnalysis(activeDna.aiAnalysis ?? null);
    setLocks({
      name: Boolean(activeDna.locks?.name),
      colors: Boolean(activeDna.locks?.colors),
      character: Boolean(activeDna.locks?.character || activeDna.locks?.mascot),
      style: Boolean(activeDna.locks?.style),
      typography: Boolean(activeDna.locks?.typography || activeDna.locks?.fonts),
    });
    const logo = activeDna.sourceAssets?.find((a) => a.type === 'logo' || a.type === 'reference');
    if (logo?.url) setPreviewUrl(logo.url);
    api.dna
      .versions(activeDna.id)
      .then((r) => setVersions(r.versions))
      .catch(() => setVersions([]));
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
      slogan: slogan.trim() || undefined,
      usagePurpose: usagePurpose.trim() || undefined,
      mascot: mascot.trim() || charDescription.trim() || undefined,
      styleDirection: style,
      dimension,
      primaryColors: colors.slice(0, 2),
      secondaryColors: colors.slice(2, 4),
      accentColors: colors.slice(4, 6),
      backgroundColors: parseList(bgColors),
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
      character: {
        present: charPresent || Boolean(mascot.trim() || charDescription.trim()),
        type: charType,
        description: charDescription.trim() || mascot.trim() || undefined,
        clothing: charClothing.trim() || undefined,
        hair: charHair.trim() || undefined,
        face: charFace.trim() || undefined,
        accessories: charAccessories.trim() || undefined,
        traits: parseList(charTraits),
      },
      typography: {
        character: typoCharacter.trim() || undefined,
        weight: typoWeight.trim() || undefined,
        direction: typoDirection.trim() || undefined,
        nameTreatment: typoName.trim() || undefined,
      },
      atmosphere: {
        lighting: atmLighting.trim() || undefined,
        mood: atmMood.trim() || undefined,
        effects: parseList(atmEffects),
        particles: atmParticles,
        glow: atmGlow,
        smoke: atmSmoke,
      },
      lightingStyle: atmLighting.trim() || undefined,
      outputPrefs: {
        platform: outputPlatform.trim() || platforms[0],
        aspectRatios: parseList(outputRatios),
        outputKinds: ['logo', 'streamset'],
      },
      locks: {
        name: locks.name,
        colors: locks.colors,
        character: locks.character,
        mascot: locks.character,
        style: locks.style,
        fonts: locks.typography,
        typography: locks.typography,
      },
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
      if (!locks.colors) setColors(extracted);
      setPreviewUrl(dataUrl);
      if (activeDna) {
        const { dna, analysis: result } = await api.dna.applyAnalysis(activeDna.id, {
          colors: extracted,
          styleHint: style,
          imageDataUrl: dataUrl,
        });
        setAnalysis(result);
        await refreshUser();
        void dna;
      } else {
        const { analysis: result } = await api.dna.analyze(extracted, style, dataUrl);
        setAnalysis(result);
        if (!locks.style && result.detectedStyle) setStyle(result.detectedStyle as StyleDirection);
        if (!locks.colors && result.colorPalette?.length) {
          setColors(result.colorPalette.map((c) => c.hex));
        }
        if (!locks.character && result.character) {
          setCharPresent(true);
          setCharDescription(result.character);
          setMascot(result.character);
        }
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
      const saved = activeDna
        ? (await api.dna.update(activeDna.id, payload)).dna
        : (await api.dna.create(payload)).dna;
      if (activeProjectId && saved?.id) {
        await api.projects.update(activeProjectId, { dnaId: saved.id }).catch(() => undefined);
      }
      setEditing(false);
      await refreshUser();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Speichern fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }

  async function handleRestore(versionId: string) {
    if (!activeDna) return;
    setLoading(true);
    setError(null);
    try {
      await api.dna.restore(activeDna.id, versionId);
      await refreshUser();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Wiederherstellen fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }

  function togglePlatform(p: string) {
    setPlatforms((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  }

  const showForm = !activeDna || editing;

  if (activeDna && !editing) {
    return (
      <div>
        <PageHeader
          title="Creator DNA"
          description="Zentrale Stil- und Identitätsquelle für Nexter und alle Studios"
          badge={<Badge variant="success">Aktiv · v{activeDna.version}</Badge>}
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
                  {activeDna.mascot ? ` · Figur: ${activeDna.mascot}` : ''}
                  {' · '}Version {activeDna.version}
                  {activeDna.locks?.style ? ' · Stil gesperrt' : ''}
                  {activeDna.locks?.colors ? ' · Farben gesperrt' : ''}
                  {activeDna.locks?.character || activeDna.locks?.mascot ? ' · Figur gesperrt' : ''}
                </p>
                {activeDna.slogan ? <p className="mt-1 text-sm text-zinc-300">{activeDna.slogan}</p> : null}
              </div>
              <div className="flex flex-wrap gap-2" data-testid="dna-color-swatches">
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
                  <dt className="text-zinc-500">Figur</dt>
                  <dd className="text-zinc-300">{activeDna.character?.description || activeDna.mascot || '—'}</dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Typografie</dt>
                  <dd className="text-zinc-300">
                    {activeDna.typography?.character || activeDna.fonts?.map((f) => f.name).join(', ') || '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Atmosphäre</dt>
                  <dd className="text-zinc-300">
                    {activeDna.atmosphere?.lighting || activeDna.lightingStyle || '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Plattformen</dt>
                  <dd className="text-zinc-300 capitalize">
                    {activeDna.platformOptimization?.map((p) => p.platform).join(', ') || '—'}
                  </dd>
                </div>
              </dl>
              {versions.length > 0 && (
                <div className="space-y-2" data-testid="dna-versions">
                  <p className="text-sm font-medium text-zinc-300">Versionen</p>
                  {versions.slice(0, 8).map((v) => (
                    <div key={v.id} className="flex items-center justify-between gap-2 text-sm text-zinc-400">
                      <span>
                        v{v.version} · {new Date(v.createdAt).toLocaleString()} {v.changeDescription ?? ''}
                      </span>
                      {v.version !== activeDna.version && (
                        <Button
                          variant="outline"
                          size="sm"
                          data-testid={`dna-restore-${v.id}`}
                          onClick={() => void handleRestore(v.id)}
                          loading={loading}
                        >
                          Wiederherstellen
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Button onClick={() => setEditing(true)} data-testid="dna-edit">
                DNA bearbeiten
              </Button>
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
        description="Jeder Creator hat genau eine DNA — Nexter und alle Studios greifen darauf zu"
        badge={<Badge variant="brand">NEXTER</Badge>}
        backTo="/settings"
        backLabel="Einstellungen"
      />

      {error && (
        <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-red-300">{error}</div>
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
            Logo, Profilbild oder Banner — Farben und Stil werden analysiert. Gesperrte Merkmale bleiben unverändert.
          </p>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
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
          <Input
            className="mt-4"
            label="Farben (Hex, kommagetrennt)"
            data-testid="dna-colors-input"
            placeholder="#7C3AED, #22D3EE"
            value={colors.join(', ')}
            onChange={(e) => setColors(parseList(e.target.value))}
          />
          <Input
            className="mt-3"
            label="Hintergrundfarben"
            placeholder="#0B0B12"
            value={bgColors}
            onChange={(e) => setBgColors(e.target.value)}
          />
          {colors.length > 0 ? (
            <div className="mt-4 grid grid-cols-3 gap-2">
              {colors.map((c, i) => (
                <div key={`${c}-${i}`} className="text-center">
                  <div className="mx-auto h-12 w-12 rounded-lg border border-zinc-700" style={{ backgroundColor: c }} />
                  <p className="mt-1 font-mono text-[10px] text-zinc-500">{c}</p>
                  <p className="text-[10px] text-zinc-600">
                    {i < 2 ? 'Primary' : i < 4 ? 'Secondary' : 'Accent'}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-zinc-500">Hex-Farben eintragen oder Bild analysieren</p>
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
            <Input
              label="DNA Name"
              placeholder="z.B. Mein Stream Brand"
              data-testid="dna-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Input label="Slogan" placeholder="optional" value={slogan} onChange={(e) => setSlogan(e.target.value)} />
            <Input
              label="Clan / Team"
              placeholder="z.B. Team Phoenix"
              value={clanName}
              onChange={(e) => setClanName(e.target.value)}
            />
            <Input
              label="Verwendungszweck"
              placeholder="z.B. Twitch, YouTube, Esports"
              value={usagePurpose}
              onChange={(e) => setUsagePurpose(e.target.value)}
            />
            <Input
              label="Lieblingsgenres / Games"
              placeholder="z.B. Valorant, Fortnite"
              value={genres}
              onChange={(e) => setGenres(e.target.value)}
            />
            <Input
              label="Maskottchen / Figur-Kurzname"
              placeholder="z.B. Cyber-Wolf"
              data-testid="dna-mascot"
              value={mascot}
              onChange={(e) => {
                setMascot(e.target.value);
                setCharPresent(Boolean(e.target.value.trim()));
              }}
            />
            <Input
              label="Figur-Beschreibung"
              placeholder="Wiederkehrende Merkmale"
              data-testid="dna-character"
              value={charDescription}
              onChange={(e) => {
                setCharDescription(e.target.value);
                setCharPresent(Boolean(e.target.value.trim() || mascot.trim()));
              }}
            />
            <div>
              <label className="mb-1.5 block text-sm font-medium text-zinc-300">Character-Typ</label>
              <select
                value={charType}
                onChange={(e) => setCharType(e.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-surface-900 px-4 py-2.5 text-sm text-zinc-100"
              >
                {DNA_CHARACTER_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <Input label="Kleidung / Rüstung" value={charClothing} onChange={(e) => setCharClothing(e.target.value)} />
            <Input label="Haare" value={charHair} onChange={(e) => setCharHair(e.target.value)} />
            <Input label="Gesicht / Maskierung" value={charFace} onChange={(e) => setCharFace(e.target.value)} />
            <Input label="Accessoires" value={charAccessories} onChange={(e) => setCharAccessories(e.target.value)} />
            <Input
              label="Wiederkehrende Merkmale"
              placeholder="z.B. violette Augen, Wolfsohren"
              value={charTraits}
              onChange={(e) => setCharTraits(e.target.value)}
            />
            <Input
              label="Gaming-Stil"
              placeholder="z.B. Competitive FPS, high-energy"
              value={gamingStyle}
              onChange={(e) => setGamingStyle(e.target.value)}
            />
            <Input
              label="Branding-Stil"
              placeholder="z.B. Bold esports, clean minimal"
              value={brandingStyle}
              onChange={(e) => setBrandingStyle(e.target.value)}
            />
            <Input
              label="Prompt-Stil"
              placeholder="z.B. cinematic, detailed, neon accents"
              value={promptStyle}
              onChange={(e) => setPromptStyle(e.target.value)}
            />
            <Input
              label="Bildsprache"
              placeholder="z.B. sharp geometry, dark gradients"
              value={visualLanguage}
              onChange={(e) => setVisualLanguage(e.target.value)}
            />
            <Input
              label="Animationen"
              placeholder="z.B. glow pulses, wipe transitions"
              value={animations}
              onChange={(e) => setAnimations(e.target.value)}
            />
            <Input
              label="Primär-Schrift"
              placeholder="z.B. Orbitron"
              value={primaryFont}
              onChange={(e) => setPrimaryFont(e.target.value)}
            />
            <Input
              label="Sekundär-Schrift"
              placeholder="z.B. Inter"
              value={secondaryFont}
              onChange={(e) => setSecondaryFont(e.target.value)}
            />
            <Input
              label="Schriftcharakter"
              placeholder="z.B. bold sans"
              value={typoCharacter}
              onChange={(e) => setTypoCharacter(e.target.value)}
            />
            <Input label="Schriftgewicht" placeholder="z.B. black" value={typoWeight} onChange={(e) => setTypoWeight(e.target.value)} />
            <Input
              label="Typo-Stilrichtung"
              placeholder="z.B. geometric"
              value={typoDirection}
              onChange={(e) => setTypoDirection(e.target.value)}
            />
            <Input
              label="Namensdarstellung"
              placeholder="z.B. stacked NightWolf"
              value={typoName}
              onChange={(e) => setTypoName(e.target.value)}
            />
            <Input
              label="Lichtstil"
              placeholder="z.B. neon glow"
              value={atmLighting}
              onChange={(e) => setAtmLighting(e.target.value)}
            />
            <Input label="Stimmung" placeholder="z.B. cinematic dark" value={atmMood} onChange={(e) => setAtmMood(e.target.value)} />
            <Input
              label="Effekte"
              placeholder="glow, particles, smoke"
              value={atmEffects}
              onChange={(e) => setAtmEffects(e.target.value)}
            />
            <Input
              label="Bevorzugte Plattform"
              placeholder="twitch"
              value={outputPlatform}
              onChange={(e) => setOutputPlatform(e.target.value)}
            />
            <Input
              label="Seitenverhältnisse"
              placeholder="16:9, 9:16"
              value={outputRatios}
              onChange={(e) => setOutputRatios(e.target.value)}
            />
            <div className="sm:col-span-2 flex flex-wrap gap-4 text-sm text-zinc-300">
              {(
                [
                  ['name', 'Name sperren'],
                  ['colors', 'Farben sperren'],
                  ['character', 'Figur sperren'],
                  ['style', 'Stil sperren'],
                  ['typography', 'Typografie sperren'],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    data-testid={`dna-lock-${key}`}
                    checked={locks[key]}
                    onChange={(e) => setLocks((prev) => ({ ...prev, [key]: e.target.checked }))}
                  />
                  <Lock className="h-3.5 w-3.5 text-zinc-500" />
                  {label}
                </label>
              ))}
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-zinc-300">Stilrichtung</label>
              <select
                value={style}
                onChange={(e) => setStyle(e.target.value as StyleDirection)}
                className="w-full rounded-lg border border-zinc-700 bg-surface-900 px-4 py-2.5 text-sm text-zinc-100"
                data-testid="dna-style"
              >
                {STYLE_DIRECTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-zinc-300">Dimension</label>
              <select
                value={dimension}
                onChange={(e) => setDimension(e.target.value as '2d' | '3d')}
                className="w-full rounded-lg border border-zinc-700 bg-surface-900 px-4 py-2.5 text-sm text-zinc-100"
              >
                <option value="2d">2D</option>
                <option value="3d">3D</option>
              </select>
            </div>
            <div className="flex flex-wrap gap-4 text-sm text-zinc-300 sm:col-span-2">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={atmParticles} onChange={(e) => setAtmParticles(e.target.checked)} />
                Partikel
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={atmGlow} onChange={(e) => setAtmGlow(e.target.checked)} />
                Glow
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={atmSmoke} onChange={(e) => setAtmSmoke(e.target.checked)} />
                Rauch
              </label>
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
            <Button
              className="gap-2"
              onClick={handleSave}
              loading={loading}
              disabled={!name.trim()}
              data-testid="dna-save"
            >
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
