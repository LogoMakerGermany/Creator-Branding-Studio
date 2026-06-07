import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  STREAM_SET_PLATFORM_LABELS,
  suggestColorsForWizard,
  type StreamSetPlatform,
  type CreatorNiche,
  type VisualStyle,
  type BrandingPreview,
} from '@cbs/shared';
import api from '../lib/api';
import { WizardShell } from '../components/beginnerWizard/WizardShell';
import {
  WIZARD_PLATFORMS,
  WIZARD_NICHES,
  WIZARD_STYLES,
  COLOR_MODES,
  INCLUDED_FILES,
  type ColorMode,
} from '../components/beginnerWizard/wizardConfig';

function buildPayload(
  platform: StreamSetPlatform,
  creatorName: string,
  clanName: string,
  slogan: string,
  niche: CreatorNiche,
  visualStyle: VisualStyle,
  colorMode: ColorMode,
  suggested: { primary: string[]; accent: string[] },
  customPrimary: string,
  customAccent: string,
) {
  const useDefaultColors = colorMode === 'ai';
  const useDnaColors = colorMode === 'dna';

  return {
    platform,
    creatorName: creatorName.trim(),
    clanName: clanName.trim() || undefined,
    slogan: slogan.trim() || undefined,
    niche,
    visualStyle,
    useDefaultColors: useDefaultColors || useDnaColors,
    primaryColors: colorMode === 'custom'
      ? [customPrimary, suggested.primary[1] || '#00F5FF']
      : useDnaColors || useDefaultColors
        ? suggested.primary
        : undefined,
    accentColors: colorMode === 'custom'
      ? [customAccent]
      : useDnaColors || useDefaultColors
        ? suggested.accent
        : undefined,
  };
}

export function ProjectWizardPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [platform, setPlatform] = useState<StreamSetPlatform>('tiktok');
  const [creatorName, setCreatorName] = useState('');
  const [clanName, setClanName] = useState('');
  const [slogan, setSlogan] = useState('');
  const [niche, setNiche] = useState<CreatorNiche>('Gaming');
  const [visualStyle, setVisualStyle] = useState<VisualStyle>('Esports');
  const [colorMode, setColorMode] = useState<ColorMode>('ai');
  const [customPrimary, setCustomPrimary] = useState('#FF2D95');
  const [customAccent, setCustomAccent] = useState('#00F5FF');
  const [summary, setSummary] = useState<BrandingPreview | null>(null);

  const suggested = useMemo(
    () => suggestColorsForWizard(niche, visualStyle),
    [niche, visualStyle],
  );

  const payload = useMemo(
    () => buildPayload(platform, creatorName, clanName, slogan, niche, visualStyle, colorMode, suggested, customPrimary, customAccent),
    [platform, creatorName, clanName, slogan, niche, visualStyle, colorMode, suggested, customPrimary, customAccent],
  );

  const displayName = creatorName.trim() || 'Dein Name';
  const previewLines = [
    displayName,
    clanName.trim() ? `${displayName} · ${clanName.trim()}` : `${displayName} Gaming`,
    clanName.trim() ? `${clanName.trim()} Clan` : slogan.trim() || `${displayName} Branding`,
  ];

  const activeColors = colorMode === 'custom'
    ? [customPrimary, customAccent]
    : suggested.primary.slice(0, 2).concat(suggested.accent[0]).filter(Boolean);

  useEffect(() => {
    if (step !== 5 || !creatorName.trim()) return;
    api.post('/projects/branding/analyze', payload)
      .then(({ data }) => setSummary(data))
      .catch(() => setSummary(null));
  }, [step, payload, creatorName]);

  function goNext() {
    setError('');
    if (step === 1 && !creatorName.trim()) {
      setError('Bitte gib deinen Namen ein.');
      return;
    }
    setStep(s => s + 1);
  }

  async function handleCreate() {
    if (!creatorName.trim()) {
      setError('Bitte gib deinen Namen ein.');
      setStep(1);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { data } = await api.post('/projects/wizard', {
        ...payload,
        startGeneration: true,
      });
      navigate(`/projects/${data.project.id}/branding`, {
        state: { packId: data.packId, platform, beginner: true },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Das hat leider nicht geklappt. Bitte versuche es erneut.');
    } finally {
      setLoading(false);
    }
  }

  const selectedStyle = WIZARD_STYLES.find(s => s.id === visualStyle)!;

  if (step === 0) {
    return (
      <WizardShell
        step={0}
        title="Für welche Plattform möchtest du dein Branding erstellen?"
        subtitle="Wähle die App, in der du aktiv bist."
        onNext={goNext}
      >
        <div className="grid grid-cols-2 gap-4">
          {WIZARD_PLATFORMS.map(p => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPlatform(p.id)}
              className={`flex min-h-[120px] flex-col items-center justify-center gap-3 rounded-2xl border-2 p-4 text-lg font-semibold transition-all ${
                platform === p.id
                  ? 'scale-[1.02] border-neon-cyan bg-neon-cyan/10 text-white glow-cyan'
                  : 'border-white/10 bg-white/5 text-white/80 hover:border-white/25'
              }`}
            >
              <span className="text-4xl">{p.emoji}</span>
              {p.label}
            </button>
          ))}
        </div>
      </WizardShell>
    );
  }

  if (step === 1) {
    return (
      <WizardShell
        step={1}
        title="Wie soll dein Branding heißen?"
        subtitle="Dein Name erscheint auf Logo, Banner und allen Dateien."
        onBack={() => setStep(0)}
        onNext={goNext}
        error={error}
      >
        <div className="space-y-4">
          <div>
            <label className="text-sm text-white/60">Dein Name *</label>
            <input
              value={creatorName}
              onChange={e => setCreatorName(e.target.value)}
              placeholder="z.B. TunnelSmiley"
              className="mt-2 w-full rounded-2xl border border-white/10 bg-surface-3 px-5 py-4 text-lg outline-none focus:border-neon-pink"
            />
          </div>
          <div>
            <label className="text-sm text-white/60">Team / Clan (optional)</label>
            <input
              value={clanName}
              onChange={e => setClanName(e.target.value)}
              placeholder="z.B. TXSA"
              className="mt-2 w-full rounded-2xl border border-white/10 bg-surface-3 px-5 py-4 text-lg outline-none focus:border-neon-pink"
            />
          </div>
          <div>
            <label className="text-sm text-white/60">Slogan (optional)</label>
            <input
              value={slogan}
              onChange={e => setSlogan(e.target.value)}
              placeholder="z.B. Always Winning"
              className="mt-2 w-full rounded-2xl border border-white/10 bg-surface-3 px-5 py-4 text-lg outline-none focus:border-neon-pink"
            />
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-neon-purple/30 bg-neon-purple/5 p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-neon-purple">So könnte es aussehen</p>
          <div className="mt-3 space-y-2">
            {previewLines.map(line => (
              <p key={line} className="text-lg font-semibold text-white">{line}</p>
            ))}
          </div>
        </div>
      </WizardShell>
    );
  }

  if (step === 2) {
    return (
      <WizardShell
        step={2}
        title="Welche Art von Creator bist du?"
        subtitle="Damit wir den passenden Look für dich finden."
        onBack={() => setStep(1)}
        onNext={goNext}
      >
        <div className="grid grid-cols-2 gap-3">
          {WIZARD_NICHES.map(n => (
            <button
              key={n.id}
              type="button"
              onClick={() => setNiche(n.id)}
              className={`flex min-h-[100px] flex-col items-center justify-center gap-2 rounded-2xl border-2 p-3 text-base font-semibold transition-all ${
                niche === n.id
                  ? 'border-neon-pink bg-neon-pink/10 text-white'
                  : 'border-white/10 bg-white/5 text-white/80 hover:border-white/25'
              }`}
            >
              <span className="text-3xl">{n.emoji}</span>
              {n.label}
            </button>
          ))}
        </div>
      </WizardShell>
    );
  }

  if (step === 3) {
    return (
      <WizardShell
        step={3}
        title="Welcher Stil gefällt dir am besten?"
        subtitle="Tippe auf einen Stil – die Vorschau zeigt dir sofort, wie er wirkt."
        onBack={() => setStep(2)}
        onNext={goNext}
      >
        <div
          className="mb-6 flex min-h-[160px] flex-col items-center justify-center rounded-2xl border border-white/15 p-6 text-center transition-all"
          style={{ background: selectedStyle.preview }}
        >
          <span className="text-5xl">{selectedStyle.emoji}</span>
          <p className="mt-3 text-xl font-bold text-white drop-shadow-lg">{selectedStyle.label}</p>
          <p className="mt-1 text-sm text-white/90 drop-shadow">{selectedStyle.description}</p>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {WIZARD_STYLES.map(s => (
            <button
              key={s.id}
              type="button"
              onClick={() => setVisualStyle(s.id)}
              className={`flex items-center gap-2 rounded-xl border-2 px-3 py-3 text-left text-sm font-medium transition-all ${
                visualStyle === s.id
                  ? 'border-neon-cyan bg-neon-cyan/10 text-white'
                  : 'border-white/10 bg-white/5 text-white/70 hover:border-white/20'
              }`}
            >
              <span className="text-xl">{s.emoji}</span>
              <span className="leading-tight">{s.label}</span>
            </button>
          ))}
        </div>
      </WizardShell>
    );
  }

  if (step === 4) {
    const activeMode = COLOR_MODES.find(m => m.id === colorMode)!;
    return (
      <WizardShell
        step={4}
        title="Welche Farben möchtest du verwenden?"
        subtitle="Keine Sorge – du kannst das später jederzeit ändern."
        onBack={() => setStep(3)}
        onNext={goNext}
      >
        <div className="space-y-3">
          {COLOR_MODES.map(mode => (
            <button
              key={mode.id}
              type="button"
              onClick={() => setColorMode(mode.id)}
              className={`w-full rounded-2xl border-2 p-4 text-left transition-all ${
                colorMode === mode.id
                  ? 'border-neon-pink bg-neon-pink/10'
                  : 'border-white/10 bg-white/5 hover:border-white/20'
              }`}
            >
              <p className="text-lg font-semibold text-white">
                {mode.emoji} {mode.label}
              </p>
              <p className="mt-1 text-sm text-white/50">{mode.hint}</p>
            </button>
          ))}
        </div>

        {colorMode === 'custom' && (
          <div className="mt-6 flex flex-wrap items-center gap-6 rounded-2xl border border-white/10 bg-white/5 p-5">
            <label className="flex flex-col gap-2 text-sm text-white/60">
              Hauptfarbe
              <input type="color" value={customPrimary} onChange={e => setCustomPrimary(e.target.value)} className="h-14 w-14 cursor-pointer rounded-xl border-0 bg-transparent" />
            </label>
            <label className="flex flex-col gap-2 text-sm text-white/60">
              Akzentfarbe
              <input type="color" value={customAccent} onChange={e => setCustomAccent(e.target.value)} className="h-14 w-14 cursor-pointer rounded-xl border-0 bg-transparent" />
            </label>
          </div>
        )}

        {(colorMode === 'ai' || colorMode === 'dna') && (
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5">
            <p className="text-sm text-white/50">{activeMode.hint}</p>
            <div className="mt-3 flex gap-3">
              {activeColors.map(c => (
                <div key={c} className="h-12 w-12 rounded-xl border border-white/20 shadow-inner" style={{ background: c }} />
              ))}
            </div>
          </div>
        )}
      </WizardShell>
    );
  }

  return (
    <WizardShell
      step={5}
      title="Dein Branding ist bereit"
      subtitle="Das bekommst du – alles fertig zum Download."
      onBack={() => setStep(4)}
      onNext={handleCreate}
      nextLabel="🚀 Branding jetzt erstellen"
      loading={loading}
      error={error}
    >
      <div className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5 text-base">
        <Row label="Plattform" value={STREAM_SET_PLATFORM_LABELS[platform]} />
        <Row label="Name" value={creatorName.trim()} />
        {clanName.trim() && <Row label="Team" value={clanName.trim()} />}
        <Row label="Art" value={niche} />
        <Row label="Stil" value={visualStyle} />
        <Row label="Farben" value={COLOR_MODES.find(m => m.id === colorMode)?.label ?? 'Automatisch'} />
      </div>

      <div className="mt-6">
        <p className="mb-3 font-semibold text-white">Enthaltene Dateien</p>
        <ul className="grid grid-cols-2 gap-2">
          {INCLUDED_FILES.map(file => (
            <li key={file} className="flex items-center gap-2 rounded-xl bg-neon-cyan/5 px-3 py-2 text-sm text-white/80">
              <span className="text-neon-cyan">✅</span> {file}
            </li>
          ))}
        </ul>
      </div>

      {summary && (
        <div className="mt-6 rounded-2xl border border-neon-pink/30 bg-neon-pink/5 p-5 text-center">
          <p className="text-sm text-white/60">Das kostet</p>
          <p className="mt-1 font-display text-3xl font-bold text-neon-pink">{summary.totalCoins} Coins</p>
          <p className="mt-1 text-xs text-white/40">ca. {summary.estimatedMinutes} Minuten Wartezeit</p>
        </div>
      )}
    </WizardShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-white/5 pb-3 last:border-0 last:pb-0">
      <span className="text-white/50">{label}</span>
      <span className="font-medium text-white">{value}</span>
    </div>
  );
}
