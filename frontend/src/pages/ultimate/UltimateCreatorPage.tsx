import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Sparkles, Loader2, ChevronRight, AlertCircle } from 'lucide-react';
import {
  ULTIMATE_WIZARD_STYLES,
  ULTIMATE_PLATFORMS,
  ULTIMATE_PACK_V1,
  COIN_COSTS,
  CoinSpendCategory,
  type UltimateCreatorWizardInput,
  type UltimatePlatformId,
} from '@ucbs/shared';
import { api, ApiError } from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { useProjectStore } from '@/v2/store/project-store';
import { LivePreviewStage } from '@/components/ultimate';
import { Button, Input } from '@/components/ui';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { GlassCard } from '@/v2/components/GlassCard';
import { DnaRequiredBanner } from '@/v2/components/StudioAlerts';
import { formatCoins } from '@/lib/utils';

const STEPS = ['Name & Plattform', 'Stil', 'Vorschau & Start'] as const;
const PACK_COST = COIN_COSTS[CoinSpendCategory.ULTIMATE_CREATOR_PACK];

function defaultColors(activeDna: { primaryColors?: string[]; secondaryColors?: string[]; accentColors?: string[] } | null) {
  if (!activeDna) return ['#22d3ee', '#a855f7', '#34d399'];
  return [
    activeDna.primaryColors?.[0] ?? '#22d3ee',
    activeDna.secondaryColors?.[0] ?? '#a855f7',
    activeDna.accentColors?.[0] ?? '#34d399',
  ];
}

export function UltimateCreatorPage() {
  const navigate = useNavigate();
  const { user, activeDna, refreshUser } = useAuth();
  const upsertProject = useProjectStore((s) => s.upsertProject);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewPlatform, setPreviewPlatform] = useState<UltimatePlatformId>('twitch');
  const [form, setForm] = useState<UltimateCreatorWizardInput>(() => ({
    name: '',
    style: ULTIMATE_WIZARD_STYLES[0],
    colors: ['#22d3ee', '#a855f7', '#34d399'],
    platforms: ['twitch'],
    game: '',
    clanName: '',
  }));

  useEffect(() => {
    if (activeDna) {
      setForm((f) => ({ ...f, colors: defaultColors(activeDna) }));
    }
  }, [activeDna]);

  useEffect(() => {
    if (form.platforms.length && !form.platforms.includes(previewPlatform)) {
      setPreviewPlatform(form.platforms[0]);
    }
  }, [form.platforms, previewPlatform]);

  function togglePlatform(id: UltimatePlatformId) {
    setForm((f) => {
      const has = f.platforms.includes(id);
      const platforms = has
        ? f.platforms.length > 1
          ? f.platforms.filter((p) => p !== id)
          : f.platforms
        : [...f.platforms, id];
      return { ...f, platforms };
    });
  }

  async function handleCreate() {
    if (!activeDna) {
      setError('Erstelle zuerst eine Creator DNA');
      return;
    }
    if (!form.name.trim()) {
      setError('Bitte Creator-Namen eingeben');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.ultimateCreator.create(form);
      upsertProject(res.project);
      await refreshUser();
      navigate(`/export-center?project=${res.project.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Erstellung fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }

  const canNext = step === 0 ? form.name.trim().length >= 2 : step === 1 ? !!form.style : true;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl font-bold text-white">
            <Sparkles className="h-7 w-7 text-[var(--ucbs-accent-purple)]" />
            Ultimate Creator
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            60-Sekunden-Wizard — ein Pack, ein Stil, alle Kern-Assets ({formatCoins(PACK_COST)} Coins)
          </p>
        </div>
        <p className="text-xs text-zinc-500">Guthaben: {formatCoins(user?.coinBalance ?? 0)} Coins</p>
      </div>

      {!activeDna && <DnaRequiredBanner />}

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="flex gap-2">
        {STEPS.map((label, i) => (
          <div
            key={label}
            className={`flex-1 rounded-lg border px-3 py-2 text-center text-xs ${
              i === step
                ? 'border-[var(--ucbs-accent-cyan)] bg-[var(--ucbs-accent-cyan)]/10 text-[var(--ucbs-accent-cyan)]'
                : i < step
                  ? 'border-white/10 text-zinc-400'
                  : 'border-white/5 text-zinc-600'
            }`}
          >
            {i + 1}. {label}
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-white/10 bg-zinc-950/60">
          <CardHeader>
            <CardTitle className="text-base">{STEPS[step]}</CardTitle>
          </CardHeader>

          {step === 0 && (
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-zinc-400">Creator-Name *</label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="z. B. NeonWolf"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-zinc-400">Clan / Team (optional)</label>
                <Input
                  value={form.clanName ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, clanName: e.target.value }))}
                  placeholder="Team-Name"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-zinc-400">Game (optional)</label>
                <Input
                  value={form.game ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, game: e.target.value }))}
                  placeholder="z. B. Valorant"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-zinc-400">Plattformen</label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {ULTIMATE_PLATFORMS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => togglePlatform(p.id)}
                      className={`rounded-lg border px-3 py-1.5 text-xs ${
                        form.platforms.includes(p.id)
                          ? 'border-[var(--ucbs-accent-purple)] bg-[var(--ucbs-accent-purple)]/15 text-[var(--ucbs-accent-purple)]'
                          : 'border-white/10 text-zinc-500'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="grid gap-2 sm:grid-cols-2">
              {ULTIMATE_WIZARD_STYLES.map((style) => (
                <button
                  key={style}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, style }))}
                  className={`rounded-xl border p-3 text-left transition ${
                    form.style === style
                      ? 'border-[var(--ucbs-accent-cyan)] bg-[var(--ucbs-accent-cyan)]/10'
                      : 'border-white/10 hover:border-white/20'
                  }`}
                >
                  <p className="text-sm font-medium text-white">{style}</p>
                </button>
              ))}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-zinc-400">
                <strong className="text-white">{form.name}</strong> · {form.style}
              </p>
              <div className="flex gap-2">
                {form.colors.map((c, i) => (
                  <div key={i} className="h-8 w-8 rounded-lg border border-white/10" style={{ backgroundColor: c }} />
                ))}
              </div>
              <ul className="space-y-1 text-xs text-zinc-500">
                {ULTIMATE_PACK_V1.map((a) => (
                  <li key={a.key} className="flex items-center gap-2">
                    <ChevronRight className="h-3 w-3 text-[var(--ucbs-accent-green)]" />
                    {a.label}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-amber-200/80">
                Einmalige Abbuchung: {formatCoins(PACK_COST)} Coins (Logo A+B inklusive)
              </p>
            </div>
          )}

          <div className="mt-6 flex gap-2">
            {step > 0 && (
              <Button type="button" variant="outline" onClick={() => setStep((s) => s - 1)}>
                Zurück
              </Button>
            )}
            {step < STEPS.length - 1 ? (
              <Button type="button" disabled={!canNext} onClick={() => setStep((s) => s + 1)} className="ml-auto">
                Weiter
              </Button>
            ) : (
              <Button
                type="button"
                disabled={loading || !canNext || !activeDna}
                onClick={handleCreate}
                className="ml-auto gap-2"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Pack starten
              </Button>
            )}
          </div>
        </Card>

        <GlassCard accent="purple">
          <h2 className="mb-4 font-display text-base font-semibold text-white">Live-Vorschau</h2>
          <LivePreviewStage
            platforms={form.platforms}
            activePlatform={previewPlatform}
            onPlatformChange={setPreviewPlatform}
          />
          <p className="mt-4 text-[10px] text-zinc-600">
            Nach dem Start erscheinen echte Assets im{' '}
            <Link to="/export-center" className="text-[var(--ucbs-accent-cyan)] hover:underline">
              Export Center
            </Link>
            .
          </p>
        </GlassCard>
      </div>
    </div>
  );
}
