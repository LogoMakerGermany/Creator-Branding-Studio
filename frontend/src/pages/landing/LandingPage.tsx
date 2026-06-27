import { Link } from 'react-router-dom';
import { Sparkles, ArrowRight, Gamepad2, Radio, Users, Music } from 'lucide-react';
import { CREATOR_MODULES, INFOGRAPHIC_MODULE_NUMBERS } from '@ucbs/shared';
import { Button } from '@/components/ui';
import {
  DnaHelix,
  InfographicHeaderBar,
  InfographicFooter,
  ModuleHubCard,
} from '@/components/hub';

const audiences = [
  { icon: Gamepad2, label: 'Gamer & Creator' },
  { icon: Radio, label: 'Streamer' },
  { icon: Users, label: 'Teams & Clans' },
  { icon: Music, label: 'Musiker' },
];

const showcaseModules = CREATOR_MODULES.filter(
  (m) => m.id !== 'dashboard' && m.id !== 'coins' && INFOGRAPHIC_MODULE_NUMBERS[m.id] != null
).sort((a, b) => (INFOGRAPHIC_MODULE_NUMBERS[a.id] ?? 99) - (INFOGRAPHIC_MODULE_NUMBERS[b.id] ?? 99));

export function LandingPage() {
  return (
    <div className="min-h-screen bg-surface-950">
      <header className="border-b border-brand-500/20">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-brand-600 to-cyan-500 shadow-lg shadow-brand-500/30">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <span className="font-display text-sm font-bold uppercase tracking-wider text-zinc-100">
              UCBS
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/login">
              <Button variant="ghost">Anmelden</Button>
            </Link>
            <Link to="/login">
              <Button>Kostenlos starten</Button>
            </Link>
          </div>
        </div>
        <InfographicHeaderBar />
      </header>

      <section className="mx-auto max-w-6xl px-6 py-16 text-center">
        <h1 className="font-display text-4xl font-bold uppercase leading-tight tracking-tight text-white sm:text-5xl lg:text-6xl ucbs-title-glow">
          Ultimate Creator
          <br />
          <span className="bg-gradient-to-r from-cyan-400 via-brand-400 to-fuchsia-400 bg-clip-text text-transparent">
            Branding Studio
          </span>
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-sm uppercase tracking-[0.15em] text-brand-300">
          Deine Marke. Deine Identität. Dein Erfolg.
        </p>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-zinc-400">
          Die KI-Web-App für Creator, Streamer, Teams und Gamer — von der DNA-Analyse bis zum
          fertigen Branding-Paket. Im Browser, ohne Download.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Link to="/dashboard">
            <Button size="lg" className="gap-2">
              Dashboard öffnen <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <Link to="/login">
            <Button variant="outline" size="lg">
              Kostenlos starten
            </Button>
          </Link>
        </div>
      </section>

      <section className="border-y border-brand-500/20 bg-surface-950/50 py-12">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-8 px-6">
          <DnaHelix className="h-40 w-24 shrink-0" />
          <div className="text-left">
            <h2 className="font-display text-2xl font-bold uppercase text-zinc-100">
              Creator DNA Engine
            </h2>
            <p className="mt-2 text-zinc-400">
              Lade Logo, Profilbild und Banner hoch — die KI analysiert Farben, Formen, Schriften und
              erstellt deine einzigartige Markenidentität als Basis für alle Studios.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="mb-8 text-center font-display text-xl font-bold uppercase tracking-wider text-zinc-200">
          Alle Module
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {showcaseModules.map((mod, i) => (
            <ModuleHubCard
              key={mod.id}
              module={mod}
              accent={(['purple', 'cyan', 'magenta'] as const)[i % 3]}
            />
          ))}
        </div>
      </section>

      <section className="border-t border-brand-500/20 py-12">
        <div className="mx-auto flex max-w-3xl flex-wrap justify-center gap-6 px-6">
          {audiences.map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="flex items-center gap-2 rounded-full border border-brand-500/30 bg-brand-500/5 px-5 py-2 text-sm text-zinc-300"
            >
              <Icon className="h-4 w-4 text-cyan-400" />
              {label}
            </div>
          ))}
        </div>
      </section>

      <InfographicFooter />

      <footer className="border-t border-zinc-800 py-6 text-center text-xs text-zinc-600">
        © {new Date().getFullYear()} Ultimate Creator Branding Studio
      </footer>
    </div>
  );
}
