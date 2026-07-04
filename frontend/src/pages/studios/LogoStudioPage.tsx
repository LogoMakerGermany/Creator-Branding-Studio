import { useEffect, useMemo, useState } from 'react';
import {
  Sparkles, CheckCircle2, Download, RefreshCw, AlertCircle, Wand2, Star, Trash2, Pencil, Eye,
} from 'lucide-react';
import { Button, Input } from '@/components/ui';
import { StudioHistory } from '@/components/studio/StudioHistory';
import { LogoLivePreview } from '@/components/studio/LogoLivePreview';
import { LogoNameSection, LogoStyleSection } from '@/components/logo';
import { ImprovementChips } from '@/components/ultimate';
import { NeonPreviewBox, StudioErrorBanner } from '@/components/studio';
import { useStudioProjects } from '@/hooks/useStudioProjects';
import { useAuth } from '@/context/AuthContext';
import { api, ApiError, type LogoVariantResult } from '@/services/api';
import { formatCoins } from '@/lib/utils';
import {
  MAGIK_GAME_PRESETS,
  MAGIK_LOGO_ART,
  MAGIK_RING_MODES,
  MAGIK_BACKGROUND_PRESETS,
  MAGIK_CHARACTERS,
  MAGIK_COLOR_PALETTES,
  DEFAULT_MAGIK_STYLE,
  DEFAULT_MAGIK_LOGO_ART,
  buildMagikLogoPrompts,
  validateMagikLogoOptions,
  isMagikFormValid,
  collectMagikColors,
  analyzeMagikName,
  applyNameBasedLogoOptions,
  buildRandomLogoOptions,
  type LogoGenerationOptions,
} from '@ucbs/shared';
import { StudioShell } from '@/v2/components/StudioShell';
import { StudioWorkbench } from '@/v2/components/StudioWorkbench';
import { DnaRequiredBanner, StudioSuccessBanner } from '@/v2/components/StudioAlerts';
import { StudioOptionPill } from '@/v2/components/StudioOptionPill';
import { GlassCard } from '@/v2/components/GlassCard';

const COIN_COST = 15;

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
  transparentBackground: true,
  primaryColor: '#22d3ee',
  secondaryColor: '#a855f7',
  accentColor: '#34d399',
  selectedColors: ['#22d3ee', '#a855f7', '#34d399'],
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
  const { projects, refresh } = useStudioProjects('logo');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [variants, setVariants] = useState<LogoVariantResult[]>([]);
  const [activeVariant, setActiveVariant] = useState<'a' | 'b'>('a');
  const [touched, setTouched] = useState(false);
  const [form, setForm] = useState<LogoGenerationOptions>(EMPTY_FORM);
  const [editPrompt, setEditPrompt] = useState(false);
  const [promptDraft, setPromptDraft] = useState('');

  useEffect(() => {
    if (!activeDna) return;
    const colors = [
      activeDna.primaryColors[0] ?? '#22d3ee',
      activeDna.secondaryColors[0] ?? '#a855f7',
      activeDna.accentColors[0] ?? '#34d399',
    ];
    setForm((prev) => ({
      ...prev,
      primaryColor: colors[0],
      secondaryColor: colors[1],
      accentColor: colors[2],
      selectedColors: colors,
    }));
  }, [activeDna]);

  const validationErrors = useMemo(() => validateMagikLogoOptions(form), [form]);
  const formValid = isMagikFormValid(form);

  const nameAnalysis = useMemo(() => {
    if (form.magikMode !== 'name' || !form.logoName?.trim()) return null;
    return analyzeMagikName(form.logoName);
  }, [form.logoName, form.magikMode]);

  const magikPrompts = useMemo(() => {
    if (!activeDna || !formValid) return null;
    try {
      return buildMagikLogoPrompts(activeDna, buildPayload());
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
    return {
      ...form,
      selectedColors: collectMagikColors(form),
      transparentBackground: form.magikBackground === 'transparent',
      customPromptOverride: override,
    };
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

  function togglePalette(colors: string[]) {
    const key = colors.join(',');
    const current = form.selectedColors ?? [];
    if (current.join(',') === key) return;
    setForm((prev) => ({
      ...prev,
      selectedColors: colors,
      primaryColor: colors[0],
      secondaryColor: colors[1],
      accentColor: colors[2],
    }));
  }

  async function runGenerate(nextForm?: LogoGenerationOptions) {
    const payloadForm = nextForm ?? form;
    setTouched(true);
    if (!activeDna) {
      setError('Erstelle zuerst eine Creator DNA');
      return;
    }
    const errors = validateMagikLogoOptions(payloadForm);
    if (Object.keys(errors).length > 0) {
      setError('Bitte Pflichtfelder ausfüllen — MAGIK benötigt deine Eingaben.');
      return;
    }

    trackFeedback('regenerate', activeVariant, promptDraft);

    setLoading(true);
    setError(null);
    try {
      const payload = {
        ...payloadForm,
        selectedColors: collectMagikColors(payloadForm),
        transparentBackground: payloadForm.magikBackground === 'transparent',
        customPromptOverride: editPrompt ? promptDraft : undefined,
      };
      const res = await api.studio.generate('logo', payload);
      if (res.variants?.length) {
        setVariants(res.variants);
        setActiveVariant('a');
      } else if (res.imageUrl) {
        setVariants([
          {
            variant: 'a',
            jobId: res.jobId,
            status: res.status,
            imageUrl: res.imageUrl,
            exports: res.exports,
            provider: res.provider,
            prompt: res.prompts?.a ?? promptDraft,
          },
        ]);
      }
      await refreshUser();
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Generierung fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerate() {
    await runGenerate();
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

  return (
    <StudioShell
      title="Logo Studio · MAGIK"
      description="MAGIK PROMPT SYSTEM — Ultimate Qualitäts-DNA automatisch in jedem Prompt"
      coinCost={COIN_COST}
      badge={
        <span className="rounded-full border border-[var(--ucbs-accent-purple)]/40 bg-[var(--ucbs-accent-purple)]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--ucbs-accent-purple)]">
          2 Varianten / Klick
        </span>
      }
    >
      <div className="space-y-4">
        {!activeDna && <DnaRequiredBanner />}
        {error && <StudioErrorBanner message={error} />}
        {variants.length > 0 && !loading && (
          <StudioSuccessBanner>
            <span className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5" />
              MAGIK hat Variante A (Name) und B (Design) erstellt — wähle deine Favoritin
            </span>
          </StudioSuccessBanner>
        )}
      </div>

      <StudioWorkbench
        settingsTitle="MAGIK Konfiguration"
        previewTitle="Live-Vorschau & Varianten"
        settings={
          <div className="max-h-[75vh] space-y-5 overflow-y-auto pr-1">
            <LogoNameSection
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
              disabled={!activeDna || (user?.coinBalance ?? 0) < COIN_COST}
              coinCost={COIN_COST}
              onGenerateFromName={handleGenerateFromName}
              onGenerateRandom={handleGenerateRandom}
            />

            <LogoStyleSection
              form={form}
              onStyleChange={(style) => setField('magikStyle', style)}
            />

            <GlassCard accent="purple" hover={false} className="!p-3">
              <p className="flex items-center gap-2 text-xs text-[var(--ucbs-accent-purple)]">
                <Wand2 className="h-4 w-4" />
                Ultimate Qualitäts-DNA ist immer aktiv (AAA, cinematic, 3D, esports)
              </p>
            </GlassCard>

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

            <section>
              <FieldLabel required>Farben</FieldLabel>
              <div className="mb-2 flex flex-wrap gap-1">
                {MAGIK_COLOR_PALETTES.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => togglePalette([...p.colors])}
                    className="flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-[10px] text-zinc-400 hover:border-white/20"
                  >
                    {p.colors.map((c) => (
                      <span key={c} className="h-3 w-3 rounded-full" style={{ backgroundColor: c }} />
                    ))}
                    {p.id}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {(['primaryColor', 'secondaryColor', 'accentColor'] as const).map((key, i) => (
                  <input
                    key={key}
                    type="color"
                    value={form[key] ?? '#000'}
                    onChange={(e) => {
                      const next = [...(form.selectedColors ?? ['#22d3ee', '#a855f7', '#34d399'])];
                      next[i] = e.target.value;
                      setForm((prev) => ({ ...prev, [key]: e.target.value, selectedColors: next }));
                    }}
                    className="h-10 w-full cursor-pointer rounded-lg border border-white/10"
                  />
                ))}
              </div>
              <FieldError message={touched ? validationErrors.colors : undefined} />
            </section>

            <section>
              <FieldLabel>Hintergrund</FieldLabel>
              <div className="flex flex-wrap gap-1">
                {MAGIK_BACKGROUND_PRESETS.map((bg) => (
                  <StudioOptionPill
                    key={bg.id}
                    active={form.magikBackground === bg.id}
                    onClick={() => setField('magikBackground', bg.id)}
                    className="text-[10px]"
                  >
                    {bg.label}
                  </StudioOptionPill>
                ))}
              </div>
            </section>

            <section>
              <div className="mb-2 flex items-center justify-between">
                <FieldLabel>MAGIK Prompt (live)</FieldLabel>
                <button
                  type="button"
                  onClick={() => setEditPrompt(!editPrompt)}
                  className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300"
                >
                  {editPrompt ? <Eye className="h-3 w-3" /> : <Pencil className="h-3 w-3" />}
                  {editPrompt ? 'Auto' : 'Bearbeiten'}
                </button>
              </div>
              <textarea
                readOnly={!editPrompt}
                value={editPrompt ? promptDraft : magikPrompts?.variantA ?? ''}
                onChange={(e) => setPromptDraft(e.target.value)}
                className="h-28 w-full resize-none rounded-lg border border-white/10 bg-[var(--ucbs-bg)] p-2 text-[10px] leading-relaxed text-zinc-400"
                placeholder="Prompt wird automatisch erzeugt…"
              />
              {magikPrompts && !editPrompt && (
                <p className="mt-1 text-[10px] text-zinc-600">
                  Variante B wird beim Generieren separat optimiert (Design-Fokus).
                </p>
              )}
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

            {!formValid && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                MAGIK generiert erst nach vollständiger Eingabe — kein Auto-Logo ohne Daten.
              </div>
            )}
          </div>
        }
        preview={
          <div className="space-y-4">
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
        }
        actions={
          <Button
            className="gap-2"
            onClick={handleGenerate}
            loading={loading}
            disabled={!activeDna || !formValid || (user?.coinBalance ?? 0) < COIN_COST}
          >
            {variants.length ? <RefreshCw className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
            {variants.length ? 'Neu generieren (A+B)' : 'Logo generieren (A+B)'} ({formatCoins(COIN_COST)} Coins)
          </Button>
        }
        history={
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
        }
      />
    </StudioShell>
  );
}
