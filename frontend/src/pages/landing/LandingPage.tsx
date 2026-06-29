import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Sparkles,
  ArrowRight,
  Gamepad2,
  Radio,
  Users,
  Palette,
  Film,
  Bot,
  Dna,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui';
import { BRANDING_MODULES } from '@/v2/config/navigation';
import { GlassCard } from '@/v2/components/GlassCard';

const audiences = [
  { icon: Gamepad2, label: 'Gamer & Creator' },
  { icon: Radio, label: 'Streamer' },
  { icon: Users, label: 'Teams & Clans' },
  { icon: Zap, label: 'Esports & Brands' },
];

const highlights = [
  {
    icon: Dna,
    title: 'Creator DNA Engine',
    text: 'Logo, Profilbild und Banner hochladen — die KI analysiert Farben, Formen und Stil als Basis für alle Studios.',
  },
  {
    icon: Palette,
    title: 'Branding Studio',
    text: 'Logos, Banner, Facecams, Overlays, Emotes und komplette Branding-Pakete — alles aus einer DNA.',
  },
  {
    icon: Film,
    title: 'Video Studio',
    text: 'Upload, KI-Highlights, Untertitel und Shorts — optimiert für Twitch, YouTube und TikTok.',
  },
  {
    icon: Bot,
    title: 'AI Creator',
    text: 'KI-Assistent, Bild- und Video-Generierung, Voice-Overs und Änderungswünsche in einem Hub.',
  },
];

export function LandingPage() {
  return (
    <div className="min-h-screen bg-[var(--ucbs-bg)] text-zinc-100">
      <header className="sticky top-0 z-50 border-b border-white/5 bg-[var(--ucbs-bg)]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--ucbs-accent-cyan)] to-[var(--ucbs-accent-purple)] shadow-lg shadow-cyan-500/20">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <span className="font-display text-sm font-bold uppercase tracking-wider">UCBS</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link to="/login">
              <Button variant="ghost">Anmelden</Button>
            </Link>
            <Link to="/login">
              <Button>Kostenlos starten</Button>
            </Link>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden px-6 pb-20 pt-20">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(34,211,238,0.12),_transparent_50%)]" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_rgba(168,85,247,0.1),_transparent_45%)]" />
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="relative mx-auto max-w-4xl text-center"
        >
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--ucbs-accent-cyan)]">
            Premium Creator Branding · V2
          </p>
          <h1 className="font-display text-4xl font-bold leading-tight sm:text-5xl lg:text-6xl">
            Ultimate Creator
            <br />
            <span className="bg-gradient-to-r from-[var(--ucbs-accent-cyan)] via-brand-400 to-[var(--ucbs-accent-purple)] bg-clip-text text-transparent">
              Branding Studio
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-zinc-400">
            Die KI-Web-App für Streamer, Gamer und Teams — von der DNA-Analyse bis zum fertigen
            Branding-Paket. Im Browser, ohne Download.
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
        </motion.div>
      </section>

      <section className="border-y border-white/5 bg-[var(--ucbs-card)]/40 py-16">
        <div className="mx-auto grid max-w-6xl gap-6 px-6 sm:grid-cols-2 lg:grid-cols-4">
          {highlights.map((item, i) => (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
            >
              <GlassCard accent={(['cyan', 'purple', 'green', 'cyan'] as const)[i % 4]} className="h-full !p-5">
                <item.icon className="mb-3 h-8 w-8 text-[var(--ucbs-accent-cyan)]" />
                <h3 className="font-display font-semibold text-white">{item.title}</h3>
                <p className="mt-2 text-sm text-zinc-400">{item.text}</p>
              </GlassCard>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="mb-2 text-center font-display text-2xl font-bold text-white">Branding Studio</h2>
        <p className="mb-10 text-center text-zinc-500">Alle Generatoren — eine Markenidentität</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {BRANDING_MODULES.map((mod) => (
            <Link key={mod.id} to={mod.path}>
              <GlassCard accent={mod.accent} className="h-full !p-5 transition-transform hover:scale-[1.02]">
                <h3 className="font-display font-semibold text-white">{mod.title}</h3>
                <p className="mt-1 text-sm text-zinc-400">{mod.description}</p>
              </GlassCard>
            </Link>
          ))}
        </div>
      </section>

      <section className="border-t border-white/5 py-12">
        <div className="mx-auto flex max-w-3xl flex-wrap justify-center gap-4 px-6">
          {audiences.map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="flex items-center gap-2 rounded-full border border-[var(--ucbs-accent-cyan)]/20 bg-[var(--ucbs-card)] px-5 py-2 text-sm text-zinc-300"
            >
              <Icon className="h-4 w-4 text-[var(--ucbs-accent-cyan)]" />
              {label}
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-white/5 py-8 text-center text-xs text-zinc-600">
        © {new Date().getFullYear()} Ultimate Creator Branding Studio
      </footer>
    </div>
  );
}
