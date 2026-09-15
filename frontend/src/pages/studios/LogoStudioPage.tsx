import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2, Download, AlertCircle, Wand2, Star, Trash2,
} from 'lucide-react';
import { Button, Input } from '@/components/ui';
import { StudioHistory } from '@/components/studio/StudioHistory';
import { LogoLivePreview } from '@/components/studio/LogoLivePreview';
import { LogoPreviewNamePanel, LogoStyleSection, LogoColorSection, LogoLightingSection, LogoMaterialSection, LogoEffectsSection, LogoBackgroundSection, LogoCameraSection, LogoDetailsSection, LogoTypographySection, LogoAiSettingsSection, LogoLivePromptSidebar, LogoTemplatesSection, LogoProModeSection, LogoFavoritesSection } from '@/components/logo';
import { ImprovementChips } from '@/components/ultimate';
import { NeonPreviewBox, StudioErrorBanner, ImageGenerationUnavailableHint } from '@/components/studio';
import { useStudioProjects } from '@/hooks/useStudioProjects';
import { useAuth } from '@/context/AuthContext';
import { useBrandProjectStore } from '@/v2/store/brand-project-store';
import { api, ApiError, type LogoVariantResult } from '@/services/api';
import { useNexterStore } from '@/v2/store/nexter-store';
import { formatCoins } from '@/lib/utils';
import {
  MAGIK_GAME_PRESETS,
  MAGIK_LOGO_ART,
  MAGIK_RING_MODES,
  MAGIK_CHARACTERS,
  DEFAULT_MAGIK_STYLE,
  DEFAULT_LOGO_BACKGROUND,
  DEFAULT_MAGIK_LOGO_ART,
  DEFAULT_LOGO_LIGHTING,
  DEFAULT_LOGO_MATERIAL,
  buildMagikLogoPrompts,
  validateMagikLogoOptions,
  isMagikFormValid,
  collectMagikColors,
  analyzeMagikName,
  applyNameBasedLogoOptions,
  buildRandomLogoOptions,
  applyLogoTemplate,
  readLogoStudioMode,
  writeLogoStudioMode,
  isLogoStudioProMode,
  COIN_COSTS,
  CoinSpendCategory,
  LOGO_LOOK_PRESETS,
  LOGO_PLATFORM_PRESETS,
  LOGO_400PX_PRESET,
  applyLogoPlatformPreset,
  applyLogoStylePreset,
  buildLogoDesignSummary,
  defaultLogoConfig,
  logoConfigFromDna,
  logoConfigFromGenerationOptions,
  type LogoGenerationOptions,
  type LogoStudioMode,
  type SavedLogoFavorite,
  type LogoPlatform,
  type LogoShape,
} from '@ucbs/shared';
import { StudioShell } from '@/v2/components/StudioShell';
import { StudioWorkbench } from '@/v2/components/StudioWorkbench';
import { DnaRequiredBanner, StudioSuccessBanner } from '@/v2/components/StudioAlerts';
import { StudioOptionPill } from '@/v2/components/StudioOptionPill';
import { GlassCard } from '@/v2/components/GlassCard';
import { Link } from 'react-router-dom';

const COIN_COST = COIN_COSTS[CoinSpendCategory.LOGO_GENERATION];

const EMPTY_FORM: LogoGenerationOptions = {
  logoName: '',
  logoSubtitle: '',
  clanName: '',
  slogan: '',
  game: '',
  platform: '',
  magikMode: 'name',
  magikCharacter: '',
  customCharacter: '',
  magikStyle: DEFAULT_MAGIK_STYLE,
  magikLogoArt: DEFAULT_MAGIK_LOGO_ART,
  ringLogoMode: 'auto',
  magikBackground: 'transparent',
  logoBackground: DEFAULT_LOGO_BACKGROUND,
  transparentBackground: true,
  primaryColor: '#22d3ee',
  secondaryColor: '#a855f7',
  accentColor: '#34d399',
  glowColor: '#22d3ee',
  backgroundColor: '#0b0f14',
  logoGradientEnabled: false,
  logoGradientFrom: '#22d3ee',
  logoGradientTo: '#a855f7',
  logoGradientAngle: 135,
  selectedColors: ['#22d3ee', '#a855f7', '#34d399', '#22d3ee', '#0b0f14'],
  logoLighting: { ...DEFAULT_LOGO_LIGHTING },
  logoMaterial: DEFAULT_LOGO_MATERIAL,
  logoMaterialIntensity: 100,
  logoEffects: [],
};

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="mb-1.5 block text-xs font-medium text-zinc-400">
      {children}
      {required && <span className="text-[var(--ucbs-accent-cyan)]"> *</span>}
    </label>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-red-400">{message}</p>;
}

export function LogoStudioPage() {
  const { user, activeDna, refreshUser } = useAuth();
  const projectId = useBrandProjectStore((s) => s.activeProjectId);
  const { projects, refresh, loading: jobsLoading } = useStudioProjects('logo');
  const queueNexterPrompt = useNexterStore((s) => s.queueNexterPrompt);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [variants, setVariants] = useState<LogoVariantResult[]>([]);
  const [activeVariant, setActiveVariant] = useState<'a' | 'b'>('a');
  const [touched, setTouched] = useState(false);
  const [form, setForm] = useState<LogoGenerationOptions>(EMPTY_FORM);
  const [editPrompt, setEditPrompt] = useState(false);
  const [promptDraft, setPromptDraft] = useState('');
  const [studioMode, setStudioMode] = useState<LogoStudioMode>(() => readLogoStudioMode());
  const [activeFavoriteId, setActiveFavoriteId] = useState<string | null>(null);
  const [logoWidth, setLogoWidth] = useState<number>(LOGO_400PX_PRESET.width);
  const [logoHeight, setLogoHeight] = useState<number>(LOGO_400PX_PRESET.height);
  const [outputFormat, setOutputFormat] = useState<'png' | 'webp' | 'jpg'>('png');
  const [shape, setShape] = useState<LogoShape>('ring');
  const [platform, setPlatform] = useState<LogoPlatform>('twitch');
  const [dnaConfirmOpen, setDnaConfirmOpen] = useState(false);

  const isProMode = isLogoStudioProMode(studioMode);

  function setStudioModePersist(mode: LogoStudioMode) {
    setStudioMode(mode);
    writeLogoStudioMode(mode);
  }

  function loadFavorite(favorite: SavedLogoFavorite) {
    setForm({ ...EMPTY_FORM, ...favorite.options });
    setActiveFavoriteId(favorite.id);
    setEditPrompt(false);
    setTouched(false);
  }

  useEffect(() => {
    if (!activeDna) return;
    const colors = [
      activeDna.primaryColors[0] ?? '#22d3ee',
      activeDna.secondaryColors[0] ?? '#a855f7',
      activeDna.accentColors[0] ?? '#34d399',
    ];
    const glow = activeDna.accentColors[0] ?? colors[0];
    const bg = activeDna.secondaryColors[0] ?? '#0b0f14';
    setForm((prev) => ({
      ...prev,
      logoName: prev.logoName || activeDna.name || '',
      clanName: prev.clanName || activeDna.clanName || '',
      magikCharacter: prev.magikCharacter || activeDna.mascot || prev.magikCharacter,
      game: prev.game || activeDna.favoriteGenres?.[0] || '',
      style: prev.style || activeDna.styleDirection || prev.style,
      primaryColor: colors[0],
      secondaryColor: colors[1],
      accentColor: colors[2],
      glowColor: glow,
      backgroundColor: bg,
      logoGradientFrom: colors[0],
      logoGradientTo: colors[1],
      selectedColors: [...colors, glow, bg],
    }));
  }, [activeDna]);

  const validationErrors = useMemo(() => validateMagikLogoOptions(form), [form]);
  const formValid = isMagikFormValid(form);

  const nameAnalysis = useMemo(() => {
    if (form.magikMode !== 'name' || !form.logoName?.trim()) return null;
    return analyzeMagikName(form.logoName);
  }, [form.logoName, form.magikMode]);

  const logoConfig = useMemo(() => {
    const fromForm = logoConfigFromGenerationOptions(form, {
      width: logoWidth,
      height: logoHeight,
      outputFormat,
      shape,
      platform,
      name: form.logoName,
    });
    return defaultLogoConfig({
      ...fromForm,
      ...(activeDna ? logoConfigFromDna(activeDna) : {}),
      ...fromForm,
      width: logoWidth,
      height: logoHeight,
      outputFormat,
      shape,
      platform,
      name: form.logoName || (activeDna ? logoConfigFromDna(activeDna).name : '') || '',
    });
  }, [form, logoWidth, logoHeight, outputFormat, shape, platform, activeDna]);

  const designSummary = buildLogoDesignSummary(logoConfig);
  const coins = user?.coinBalance ?? 0;
  const remainder = coins - COIN_COST;

  const magikPrompts = useMemo(() => {
    if (!formValid) return null;
    const dnaCtx = activeDna ?? {
      name: form.logoName || 'Creator',
      primaryColors: collectMagikColors(form),
      secondaryColors: [],
      accentColors: [],
      styleDirection: form.magikStyle,
    };
    try {
      return buildMagikLogoPrompts(dnaCtx, buildPayload());
    } catch {
      return null;
    }
  }, [form, activeDna, formValid]);

  useEffect(() => {
    if (!editPrompt && magikPrompts) {
      setPromptDraft(magikPrompts.variantA);
    }
  }, [magikPrompts, editPrompt]);

  const activeResult = variants.find((v) => v.variant === activeVariant) ?? variants[0];

  function setField<K extends keyof LogoGenerationOptions>(key: K, value: LogoGenerationOptions[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function buildPayload(override?: string): LogoGenerationOptions {
    const merged = {
      ...form,
      selectedColors: collectMagikColors(form),
      transparentBackground: form.magikBackground === 'transparent',
      customPromptOverride: override,
    };
    return merged;
  }

  function magikProfile() {
    return {
      magikMode: form.magikMode,
      magikStyle: form.magikStyle,
      game: form.game,
      magikCharacter: form.magikCharacter,
      magikLogoArt: form.magikLogoArt,
      magikBackground: form.magikBackground,
    };
  }

  function trackFeedback(
    eventType: 'download' | 'delete' | 'favorite' | 'regenerate',
    variant?: 'a' | 'b',
    prompt?: string
  ) {
    if (!prompt) return;
    api.magik.feedback({ eventType, variant, prompt, profile: magikProfile() }).catch(() => {});
  }

  function nexterPrompt(kind: 'create' | 'variant' | 'change' = 'create', extra = '') {
    if (kind === 'variant') {
      return `Neue Variante meines Logos: ${designSummary} ${extra}`.trim();
    }
    if (kind === 'change') {
      return extra || `Ändere mein letztes Logo: ${designSummary}`;
    }
    return `Mach mir ein Logo. ${designSummary} ${extra}`.trim();
  }

  async function tryDirectGenerate() {
    setTouched(true);
    setError(null);
    try {
      await api.studio.generate('logo', {
        ...form,
        selectedColors: collectMagikColors(form),
        transparentBackground: form.magikBackground === 'transparent' || outputFormat !== 'jpg',
        projectId: projectId ?? undefined,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Generierung fehlgeschlagen');
    }
  }

  async function runGenerate(nextForm?: LogoGenerationOptions) {
    const payloadForm = nextForm ?? form;
    setTouched(true);
    if (!payloadForm.logoName?.trim()) {
      setError('Bitte zuerst einen Namen eingeben');
      return;
    }
    const errors = validateMagikLogoOptions(payloadForm);
    if (Object.keys(errors).length > 0) {
      setError('Bitte Pflichtfelder ausfüllen — Nexter benötigt deine Eingaben.');
      return;
    }
    setLoading(true);
    try {
      queueNexterPrompt(nexterPrompt('create'));
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateFromName() {
    if (!form.logoName?.trim()) {
      setTouched(true);
      setError('Bitte zuerst einen Namen eingeben');
      return;
    }
    const prepared = applyNameBasedLogoOptions(form);
    setForm(prepared);
    setEditPrompt(false);
    await runGenerate(prepared);
  }

  async function handleGenerateRandom() {
    const prepared = buildRandomLogoOptions(form);
    setForm(prepared);
    setEditPrompt(false);
    await runGenerate(prepared);
  }

  async function downloadOwnedLogo(jobId: string) {
    setError(null);
    try {
      const dl = await api.studio.downloadLogo(jobId);
      window.open(dl.downloadUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Download fehlgeschlagen');
    }
  }

  async function queueStreamsetFromLogo(jobId: string) {
    setError(null);
    try {
      await api.streamset.preview({
        sourceLogoJobId: jobId,
        projectId: projectId ?? undefined,
      });
      queueNexterPrompt('Komplettset daraus erstellen');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Streamset-Entwurf fehlgeschlagen');
    }
  }

  async function confirmApplyDna(jobId: string) {
    setError(null);
    try {
      await api.studio.applyLogoDna(jobId, true);
      await refresh();
      setDnaConfirmOpen(false);
      await refreshUser();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'DNA-Übernahme fehlgeschlagen');
    }
  }

  return (
    <StudioShell
      title="Logo Studio"
      description="Gaming- und Stream-Logos — DNA als Defaults, Quote und Bestätigung über Nexter"
      coinCost={COIN_COST}
      badge={
        <span className="rounded-full border border-[var(--ucbs-accent-purple)]/40 bg-[var(--ucbs-accent-purple)]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--ucbs-accent-purple)]">
          400×400 / Quote
        </span>
      }
      nexterHint={
        projects.some((p) => p.status === 'completed')
          ? 'Soll ich dir daraus ein Komplettset erstellen?'
          : 'Logo Studio'
      }
    >
      <div className="space-y-4">
        {!activeDna && (
          <DnaRequiredBanner message="Ohne Creator DNA reichen Name, Farben und Stil in diesem Formular — kein zweites Onboarding." />
        )}
        {error && <StudioErrorBanner message={error} />}
        {projects.some((p) => p.status === 'completed') && (
          <StudioSuccessBanner>
            <span className="flex flex-wrap items-center gap-3">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5" />
                Logo gespeichert — Preview, Download und Streamset über Nexter.
              </span>
              <Link
                to="/streamset-studio"
                data-testid="logo-to-streamset"
                className="min-h-11 rounded-full border border-[var(--ucbs-accent-cyan)]/40 bg-[var(--ucbs-accent-cyan)]/10 px-3 py-2 text-xs font-medium text-[var(--ucbs-accent-cyan)] hover:bg-[var(--ucbs-accent-cyan)]/20"
              >
                Soll ich dir daraus ein Komplettset erstellen?
              </Link>
            </span>
          </StudioSuccessBanner>
        )}
      </div>

      <StudioWorkbench
        settingsTitle="Logo-Konfiguration"
        previewTitle="Live-Vorschau & Varianten"
        settings={
          <div className="max-h-[75vh] space-y-5 overflow-y-auto pr-1">
            <LogoProModeSection mode={studioMode} onModeChange={setStudioModePersist} />

            <section data-testid="logo-presets">
              <FieldLabel>Logo-Presets</FieldLabel>
              <div className="flex flex-wrap gap-1">
                {LOGO_LOOK_PRESETS.map((preset) => (
                  <StudioOptionPill
                    key={preset.id}
                    active={logoConfig.magikStyle === preset.magikStyle || logoConfig.shape === preset.shape}
                    onClick={() => {
                      const next = applyLogoStylePreset(logoConfig, preset.id);
                      setShape(next.shape);
                      setField('magikStyle', next.magikStyle);
                      if (next.magikLogoArt) setField('magikLogoArt', next.magikLogoArt);
                      if (next.magikMode) setField('magikMode', next.magikMode);
                    }}
                    className="min-h-11 text-[10px]"
                  >
                    {preset.label}
                  </StudioOptionPill>
                ))}
              </div>
            </section>

            <section data-testid="logo-platform-presets">
              <FieldLabel>Plattform</FieldLabel>
              <div className="flex flex-wrap gap-1">
                {(Object.keys(LOGO_PLATFORM_PRESETS) as LogoPlatform[]).map((id) => (
                  <StudioOptionPill
                    key={id}
                    active={platform === id}
                    onClick={() => {
                      const next = applyLogoPlatformPreset(logoConfig, id);
                      setPlatform(id);
                      setLogoWidth(next.width);
                      setLogoHeight(next.height);
                    }}
                    className="min-h-11 text-[10px]"
                  >
                    {LOGO_PLATFORM_PRESETS[id].label}
                  </StudioOptionPill>
                ))}
                <StudioOptionPill
                  active={logoWidth === 400 && logoHeight === 400}
                  onClick={() => {
                    setLogoWidth(400);
                    setLogoHeight(400);
                  }}
                  className="min-h-11 text-[10px]"
                >
                  400×400
                </StudioOptionPill>
              </div>
              <p className="mt-1 text-[11px] text-zinc-500">{LOGO_PLATFORM_PRESETS[platform].safeArea}</p>
            </section>

            <section>
              <FieldLabel>Form</FieldLabel>
              <div className="flex flex-wrap gap-1">
                {([
                  ['free', 'Frei'],
                  ['ring', 'Kreis/Ring'],
                  ['badge', 'Badge/Emblem'],
                ] as const).map(([id, label]) => (
                  <StudioOptionPill
                    key={id}
                    active={shape === id}
                    onClick={() => {
                      setShape(id);
                      setField('ringLogoMode', id === 'free' ? 'no' : 'yes');
                    }}
                    className="min-h-11 text-[10px]"
                  >
                    {label}
                  </StudioOptionPill>
                ))}
              </div>
            </section>

            <section>
              <FieldLabel>Format & Transparenz</FieldLabel>
              <div className="flex flex-wrap gap-1">
                {(['png', 'webp', 'jpg'] as const).map((fmt) => (
                  <StudioOptionPill
                    key={fmt}
                    active={outputFormat === fmt}
                    onClick={() => {
                      setOutputFormat(fmt);
                      if (fmt === 'jpg') {
                        setField('magikBackground', 'dark');
                        setField('transparentBackground', false);
                      }
                    }}
                    className="min-h-11 text-[10px]"
                  >
                    {fmt.toUpperCase()}
                  </StudioOptionPill>
                ))}
                <StudioOptionPill
                  active={form.magikBackground === 'transparent' && outputFormat !== 'jpg'}
                  onClick={() => {
                    if (outputFormat === 'jpg') {
                      setError('JPG unterstützt keine Transparenz. Bitte PNG oder WEBP wählen.');
                      return;
                    }
                    setField('magikBackground', 'transparent');
                    setField('transparentBackground', true);
                  }}
                  className="min-h-11 text-[10px]"
                >
                  Transparent
                </StudioOptionPill>
              </div>
            </section>

            <LogoStyleSection
              form={form}
              onStyleChange={(style) => setField('magikStyle', style)}
            />

            <LogoColorSection
              form={form}
              onFormChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
              colorError={touched ? validationErrors.colors : undefined}
            />

            <LogoTemplatesSection
              form={form}
              onApplyTemplate={(templateId) => {
                setForm((prev) => applyLogoTemplate(templateId, prev));
                setEditPrompt(false);
              }}
            />

            <LogoBackgroundSection
              form={form}
              onFormChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
            />

            {isProMode && (
              <>
            <LogoLightingSection
              form={form}
              onFormChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
            />

            <LogoMaterialSection
              form={form}
              onFormChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
            />

            <LogoEffectsSection
              form={form}
              onFormChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
            />

            <LogoCameraSection
              form={form}
              onFormChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
            />

            <LogoDetailsSection
              form={form}
              onFormChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
            />

            <LogoTypographySection
              form={form}
              onFormChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
            />

            <LogoAiSettingsSection
              form={form}
              onFormChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
            />
              </>
            )}

            <LogoFavoritesSection
              form={form}
              activeFavoriteId={activeFavoriteId}
              onLoadFavorite={loadFavorite}
              onClearActiveFavorite={() => setActiveFavoriteId(null)}
            />

            <GlassCard accent="purple" hover={false} className="!p-3">
              <p className="flex items-center gap-2 text-xs text-[var(--ucbs-accent-purple)]">
                <Wand2 className="h-4 w-4" />
                Ultimate Qualitäts-DNA ist immer aktiv (AAA, cinematic, 3D, esports)
              </p>
            </GlassCard>

            {isProMode && (
              <>
            <section>
              <FieldLabel>MAGIK Modus</FieldLabel>
              <div className="flex gap-2">
                <StudioOptionPill
                  active={form.magikMode === 'name'}
                  onClick={() => setField('magikMode', 'name')}
                >
                  Passend zum Namen (MAGIK AI)
                </StudioOptionPill>
                <StudioOptionPill
                  active={form.magikMode === 'character'}
                  onClick={() => setField('magikMode', 'character')}
                >
                  Figur wählen
                </StudioOptionPill>
              </div>
            </section>

            {form.magikMode === 'character' && (
              <section>
                <FieldLabel required>Figur</FieldLabel>
                <div className="flex flex-wrap gap-1">
                  {MAGIK_CHARACTERS.map((c) => (
                    <StudioOptionPill
                      key={c}
                      active={form.magikCharacter === c}
                      onClick={() => setField('magikCharacter', c)}
                      className="text-[10px]"
                    >
                      {c}
                    </StudioOptionPill>
                  ))}
                </div>
                <FieldError message={touched ? validationErrors.character : undefined} />
                {form.magikCharacter === 'Eigene Figur' && (
                  <Input
                    className="mt-2"
                    placeholder="Eigene Figur beschreiben…"
                    value={form.customCharacter ?? ''}
                    onChange={(e) => setField('customCharacter', e.target.value)}
                  />
                )}
              </section>
            )}

            <section>
              <FieldLabel>Spiel</FieldLabel>
              <div className="flex flex-wrap gap-1">
                {MAGIK_GAME_PRESETS.map((g) => (
                  <StudioOptionPill
                    key={g}
                    active={form.game === g}
                    onClick={() => setField('game', form.game === g ? '' : g)}
                    className="text-[10px]"
                  >
                    {g}
                  </StudioOptionPill>
                ))}
              </div>
              <Input
                className="mt-2"
                placeholder="Eigenes Spiel…"
                value={form.game ?? ''}
                onChange={(e) => setField('game', e.target.value)}
              />
            </section>

            <section>
              <FieldLabel>Logo-Art</FieldLabel>
              <div className="flex flex-wrap gap-1">
                {MAGIK_LOGO_ART.map((a) => (
                  <StudioOptionPill
                    key={a.id}
                    active={form.magikLogoArt === a.id}
                    onClick={() => setField('magikLogoArt', a.id)}
                    className="text-[10px]"
                  >
                    {a.label}
                  </StudioOptionPill>
                ))}
              </div>
            </section>

            <section>
              <FieldLabel>Ringlogo</FieldLabel>
              <div className="flex gap-1">
                {MAGIK_RING_MODES.map((r) => (
                  <StudioOptionPill
                    key={r.id}
                    active={form.ringLogoMode === r.id}
                    onClick={() => setField('ringLogoMode', r.id)}
                  >
                    {r.label}
                  </StudioOptionPill>
                ))}
              </div>
            </section>

            <ImprovementChips
              disabled={loading}
              onApply={(patch, suffix) => {
                setForm((f) => ({ ...f, ...patch }));
                if (suffix) {
                  setEditPrompt(true);
                  setPromptDraft((prev) => (prev ? `${prev}, ${suffix}` : suffix));
                }
              }}
            />
              </>
            )}

            {!formValid && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                Nexter generiert erst nach vollständiger Eingabe — kein Auto-Logo ohne Daten.
              </div>
            )}
          </div>
        }
        preview={
          <div className={`grid gap-4 ${isProMode ? 'xl:grid-cols-[1fr_minmax(260px,300px)]' : ''}`}>
            <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400" data-testid="logo-preview-label">
              Konfigurationsvorschau — noch kein generiertes Logo
            </p>
            <div className="rounded-lg border border-white/10 p-3 text-sm text-zinc-200" data-testid="logo-design-summary">
              {designSummary}
            </div>
            <div className="rounded-lg border border-white/10 p-3 text-[11px] text-zinc-400" data-testid="logo-quote-summary">
              <p>
                {COIN_COST} Coins · Bestand {coins} → nach Bestätigung {remainder < 0 ? 'unzureichend' : remainder}
              </p>
              {remainder < 0 && (
                <p className="mt-1 text-amber-300" data-testid="logo-insufficient-coins">
                  Zu wenig Coins — Job startet nicht.
                </p>
              )}
            </div>
            <LogoPreviewNamePanel
              form={form}
              onFormChange={(patch) => setForm((prev) => ({ ...prev, ...patch }))}
              nameAnalysis={
                nameAnalysis
                  ? {
                      summary: nameAnalysis.summary,
                      suggestedStyle: nameAnalysis.suggestedStyle,
                      styleReason: nameAnalysis.styleReason,
                    }
                  : null
              }
              nameError={touched ? validationErrors.logoName : undefined}
              loading={loading}
              disabled={!form.logoName?.trim() || (user?.coinBalance ?? 0) < COIN_COST}
              onGenerateFromName={handleGenerateFromName}
              onGenerateRandom={handleGenerateRandom}
            />

            {variants.length > 0 ? (
              <>
                <div className="flex gap-2">
                  {variants.map((v) => (
                    <button
                      key={v.variant}
                      type="button"
                      onClick={() => setActiveVariant(v.variant)}
                      className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium ${
                        activeVariant === v.variant
                          ? 'border-[var(--ucbs-accent-cyan)] bg-[var(--ucbs-accent-cyan)]/10 text-[var(--ucbs-accent-cyan)]'
                          : 'border-white/10 text-zinc-500'
                      }`}
                    >
                      Variante {v.variant.toUpperCase()}
                      {v.variant === 'a' ? ' · Name' : ' · Design'}
                    </button>
                  ))}
                </div>
                <NeonPreviewBox aspect="square">
                  {activeResult?.imageUrl ? (
                    <img src={activeResult.imageUrl} alt={`Logo ${activeVariant}`} className="h-full w-full object-contain" />
                  ) : (
                    <p className="text-sm text-zinc-500">Generierung läuft…</p>
                  )}
                </NeonPreviewBox>
                {activeResult && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1"
                      onClick={() => {
                        trackFeedback('favorite', activeResult.variant, activeResult.prompt);
                      }}
                    >
                      <Star className="h-3.5 w-3.5" /> Favorit
                    </Button>
                    {activeResult.exports?.png && (
                      <a
                        href={activeResult.exports.png}
                        download={`logo-${activeResult.variant}.png`}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => trackFeedback('download', activeResult.variant, activeResult.prompt)}
                      >
                        <Button size="sm" variant="outline" className="gap-1">
                          <Download className="h-3.5 w-3.5" /> PNG
                        </Button>
                      </a>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-1 text-red-400"
                      onClick={() => {
                        trackFeedback('delete', activeResult.variant, activeResult.prompt);
                        setVariants((prev) => prev.filter((x) => x.variant !== activeResult.variant));
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Verwerfen
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <NeonPreviewBox aspect="square">
                <LogoLivePreview form={form} loading={loading} nameAnalysis={nameAnalysis?.summary} />
              </NeonPreviewBox>
            )}
            </div>

            {isProMode && (
            <LogoLivePromptSidebar
              variantA={magikPrompts?.variantA ?? ''}
              variantB={magikPrompts?.variantB ?? ''}
              formValid={formValid}
              logoName={form.logoName}
              editPrompt={editPrompt}
              promptDraft={promptDraft}
              onEditPromptChange={setEditPrompt}
              onPromptDraftChange={setPromptDraft}
              onApplyPrompt={(prompt) =>
                setForm((prev) => ({
                  ...prev,
                  customPromptOverride: prompt.trim() || undefined,
                }))
              }
            />
            )}
          </div>
        }
        actions={
          <div className="flex w-full flex-col gap-2">
            <button
              type="button"
              data-testid="logo-nexter-chip"
              onClick={() => queueNexterPrompt(nexterPrompt('create'))}
              className="min-h-11 w-full rounded-full border border-violet-500/40 bg-violet-500/10 px-3 py-2 text-sm text-violet-200"
            >
              Für {formatCoins(COIN_COST)} Coins erstellen — Nexter
            </button>
            <ImageGenerationUnavailableHint />
            <Button variant="ghost" size="sm" className="min-h-11 w-full" onClick={() => void tryDirectGenerate()}>
              Direkt erzeugen (wird abgelehnt)
            </Button>
          </div>
        }
        history={
          <GlassCard accent="cyan" className="!p-5" data-testid="logo-jobs">
            <h2 className="mb-3 text-sm font-semibold text-zinc-300">Ergebnisse</h2>
            {jobsLoading && (
              <p className="text-sm text-zinc-500" data-testid="logo-jobs-loading">
                Ergebnisse laden …
              </p>
            )}
            {!jobsLoading && projects.length === 0 && (
              <p className="text-sm text-zinc-500" data-testid="logo-jobs-empty">
                Noch kein Logo-Projekt.
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {projects.slice(0, 8).map((p) => (
                <div key={p.id} className="rounded-lg border border-zinc-800 p-3" data-testid="logo-result-card">
                  {p.imageUrl ? (
                    <img src={p.imageUrl} alt={`Logo Version ${p.version ?? 1}, ${p.width ?? logoWidth} mal ${p.height ?? logoHeight} Pixel`} className="mb-2 h-24 w-full object-contain" />
                  ) : p.status === 'failed' ? (
                    <p className="text-xs text-red-400">Fehlgeschlagen{p.error ? `: ${p.error}` : ''}</p>
                  ) : p.status === 'processing' || p.status === 'queued' ? (
                    <p className="text-xs text-zinc-400">{p.status === 'queued' ? 'In der Warteschlange' : 'Wird erzeugt …'}</p>
                  ) : p.fileMissing ? (
                    <p className="text-xs text-amber-300" data-testid="logo-result-missing">Result fehlt</p>
                  ) : null}
                  <p className="text-xs text-zinc-500">
                    {p.status}
                    {p.width && p.height ? ` · ${p.width}×${p.height}` : ''}
                    {p.mimeType ? ` · ${p.mimeType}` : ''}
                    {typeof p.version === 'number' ? ` · v${p.version}` : ''}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {p.status === 'completed' && !p.fileMissing && (
                      <Button size="sm" variant="outline" className="min-h-11 gap-1" onClick={() => void downloadOwnedLogo(p.id)}>
                        <Download className="h-3.5 w-3.5" /> Download
                      </Button>
                    )}
                    {p.status === 'completed' && (
                      <Button size="sm" variant="outline" className="min-h-11" onClick={() => queueNexterPrompt(nexterPrompt('variant'))}>
                        Neue Variante
                      </Button>
                    )}
                    {p.status === 'completed' && (
                      <Button size="sm" variant="outline" className="min-h-11" onClick={() => queueNexterPrompt('Mach das Logo aggressiver.')}>
                        Ändern
                      </Button>
                    )}
                    {p.status === 'completed' && (
                      <Button size="sm" variant="outline" className="min-h-11" data-testid="logo-to-streamset-action" onClick={() => void queueStreamsetFromLogo(p.id)}>
                        Für Streamset verwenden
                      </Button>
                    )}
                    {p.status === 'completed' && (
                      <Button size="sm" variant="ghost" className="min-h-11" onClick={() => setDnaConfirmOpen(true)}>
                        Als Creator DNA
                      </Button>
                    )}
                    {p.status === 'failed' && (
                      <Button size="sm" variant="outline" className="min-h-11" onClick={() => void api.studio.retryLogo(p.id).catch((err) => setError(err instanceof ApiError ? err.message : 'Retry braucht ein neues Angebot'))}>
                        Erneut versuchen
                      </Button>
                    )}
                  </div>
                  {dnaConfirmOpen && p.status === 'completed' && (
                    <div className="mt-2 rounded border border-amber-500/30 p-2 text-xs text-amber-100" data-testid="logo-dna-confirm">
                      <p>Dieses Logo als Basis der Creator DNA verwenden? DNA wird nicht still überschrieben.</p>
                      <Button size="sm" className="mt-2 min-h-11" onClick={() => void confirmApplyDna(p.id)}>
                        Ja, DNA aktualisieren
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <StudioHistory
              projects={projects}
              onSelect={(p) => {
                if (p.imageUrl) {
                  setVariants([
                    {
                      variant: 'a',
                      jobId: p.id,
                      status: p.status,
                      imageUrl: p.imageUrl,
                      exports: p.exports,
                      provider: p.provider,
                      prompt: '',
                    },
                  ]);
                }
              }}
            />
          </GlassCard>
        }
      />
    </StudioShell>
  );
}
