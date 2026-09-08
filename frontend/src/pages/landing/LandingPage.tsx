import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Menu, X } from 'lucide-react';
import { STREAMSET_PACK_ITEMS } from '@ucbs/shared';
import { Button } from '@/components/ui';
import { GlassCard } from '@/v2/components/GlassCard';
import { NexterMark } from '@/components/nexter/NexterMark';
import { api } from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { AUTH_GATE_PATH, resolveAuthGate } from '@/lib/auth-gates';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '#inhalt', label: 'Start' },
  { href: '#funktionen', label: 'Funktionen' },
  { href: '#nexter', label: 'Nexter' },
  { href: '#studios', label: 'Studios' },
  { href: '#faq', label: 'FAQ' },
] as const;

const STUDIO_CARDS = [
  {
    title: 'Logo Studio',
    text: 'Creator-DNA-Defaults, Stil, Plattform-Presets, Form/Ring soweit unterstützt, Transparenz, 400×400-Workflow, Referenzbild und Änderungsversionen. Keine Provider-Marke.',
  },
  {
    title: 'Banner Studio',
    text: 'Formate für Twitch, YouTube, TikTok, Discord und allgemein. Safe Areas sind Designhilfen, kein pixelgenaues Crop-Versprechen.',
  },
  {
    title: 'Facecam Studio',
    text: 'Webcam-Rahmen und Facecam-Fenster — nicht dasselbe wie ein vollständiges Overlay/HUD.',
  },
  {
    title: 'Overlay Studio',
    text: 'Overlays und Panels: HUD, Alerts, Szenen und Screens. Getrennt vom Facecam-Rahmen.',
  },
  {
    title: 'Sticker, Badge & Emote',
    text: 'Gemeinsamer Workflow für Sticker, Badges und Emotes. Keine automatische Massen-Batch-Generierung.',
  },
  {
    title: 'Streamset',
    text: 'Ein Pack aus den vorhandenen Streamset-Bausteinen — keine erfundenen Social- oder Goal-Bars.',
  },
  {
    title: 'Mockup Studio',
    text: 'Local Composite: lokale Vorschau, 0 Coins, ohne KI-Provider. Lifestyle-Mockup: Provider-Workflow mit Quote.',
  },
  {
    title: 'Animation',
    text: 'Lokale Preview der Bewegung. Finale providerbasierte Generierung nur nach Quote.',
  },
  {
    title: 'Musik Studio',
    text: 'Konfigurierbare Musik-Workflows. Provider-Ausgabe ist quote- und provider-gated.',
  },
  {
    title: 'Voice Studio',
    text: 'Text-to-Speech im Voice Studio. Getrennt von der Nexter-Stimmenpräferenz in den Einstellungen.',
  },
  {
    title: 'Video Studio',
    text: 'Upload, Timeline, Trim, Format-Presets, Shorts, Highlights, Übergänge, Captions und lokale FFmpeg-Verarbeitung. Provider-Schritte nur nach Quote — keine vollautomatische KI-Videobearbeitung.',
  },
  {
    title: 'Shorts / Highlights',
    text: 'Shorts- und Highlight-Workflows im Video-/Shorts-Studio. Ausgabe hängt von Upload und lokalen bzw. provider-gated Schritten ab.',
  },
  {
    title: 'Social Studio',
    text: 'Content erstellen und intern planen. Kein automatisches Posten auf TikTok, Instagram, YouTube oder Twitch.',
  },
  {
    title: 'Content-Kalender',
    text: 'Monat, Woche, Agenda/Liste und Heute. Termine verschieben und Status setzen. Ein Termin ist geplant — nicht automatisch veröffentlicht.',
  },
  {
    title: 'Projects Hub',
    text: 'Creator-Projekte mit Assets, Ergebnissen, Jobs, Versionen und Weiterarbeiten im eigenen Account.',
  },
  {
    title: 'File Cloud',
    text: 'Eigene Dateien: Upload, Vorschau, Download, Projektzuordnung und Versionen. Kein unbegrenzter Speicher.',
  },
  {
    title: 'Änderungswünsche',
    text: 'Bestehende Designs anpassen, ohne das Original zu überschreiben.',
  },
] as const;

const FAQ = [
  {
    q: 'Was ist Nexter?',
    a: 'Nexter ist der persönliche Creator-Assistent in NEXTER Creator Studio. Er kennt gespeicherte Preferences, kann Creator DNA berücksichtigen, hilft in den Studios, fragt nach fehlenden Angaben, bezieht Projekte und Assets im eigenen Account ein und zeigt Kosten, bevor eine kostenpflichtige Aktion startet. Er veröffentlicht nichts selbstständig und führt keine Zahlungen aus.',
  },
  {
    q: 'Was ist Creator DNA?',
    a: 'Creator DNA speichert Markenmerkmale wie Farben, Stil, Motiv, Schrift und Plattformpräferenzen. Studios nutzen sie als konsistente Grundlage. Das heißt nicht, dass jede Generation pixelgenau identisch ausfällt.',
  },
  {
    q: 'Welche Creator-Tools gibt es?',
    a: 'Unter anderem Logo, Banner, Facecam, Overlay, Sticker/Badge/Emote, Streamset, Mockup, Animation, Musik, Voice, Video, Shorts, Social, Content-Kalender, Projects Hub, File Cloud und Änderungswünsche — jeweils im tatsächlich implementierten Umfang.',
  },
  {
    q: 'Wie funktionieren Coins?',
    a: 'Coins bezahlen Generierungs- und Provideraktionen nach dem bestehenden Pricing-System. Kostenlose lokale Aktionen (zum Beispiel Local Composite) bleiben kostenlos.',
  },
  {
    q: 'Wann entstehen Kosten?',
    a: 'Bei kostenpflichtigen Aktionen zeigt Nexter bzw. das Studio vorher Preis oder Quote. Es gibt keine automatische Abbuchung ohne Bestätigung.',
  },
  {
    q: 'Werden Aktionen automatisch ausgeführt?',
    a: 'Nein. Geplante Social- oder Kalender-Termine sind interne Vormerkungen. NEXTER postet nicht automatisch auf fremden Plattformen.',
  },
  {
    q: 'Kann ich Designs ändern?',
    a: 'Ja. Änderungswünsche erzeugen eine neue Version, ohne das Original zu überschreiben.',
  },
  {
    q: 'Kann ich Dateien und Projekte speichern?',
    a: 'Ja, im eigenen Account über Projects Hub und File Cloud. Speicher ist accountgebunden, nicht unbegrenzt.',
  },
  {
    q: 'Ist die App schon öffentlich verfügbar?',
    a: 'Aktuell ist NEXTER Creator Studio eine geschlossene Creator-Beta. Die Registrierung ist in der Regel nur mit Einladung möglich.',
  },
] as const;

function startLabelForMode(mode: string | null): string {
  if (mode === 'public') return 'Registrieren';
  if (mode === 'closed') return 'Anmelden';
  return 'Mit Einladung starten';
}

function continueLabel(gate: ReturnType<typeof resolveAuthGate>): string {
  if (gate === 'verify-email') return 'E-Mail bestätigen';
  if (gate === 'onboarding') return 'Onboarding fortsetzen';
  if (gate === 'nexter-setup') return 'Einrichtung fortsetzen';
  return 'Zum Dashboard';
}

function CtaLink({
  to,
  variant = 'primary',
  children,
}: {
  to: string;
  variant?: 'primary' | 'outline' | 'ghost';
  children: React.ReactNode;
}) {
  const styles = {
    primary: 'bg-brand-600 text-white shadow-lg shadow-brand-600/25 hover:bg-brand-500',
    outline: 'border border-brand-500/50 text-brand-400 hover:bg-brand-500/10',
    ghost: 'text-zinc-300 hover:bg-zinc-800/50',
  } as const;
  return (
    <Link
      to={to}
      className={cn(
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500',
        styles[variant]
      )}
    >
      {children}
    </Link>
  );
}

export function LandingPage() {
  const { user, loading: authLoading } = useAuth();
  const reduceMotion = useReducedMotion();
  const menuId = useId();
  const [menuOpen, setMenuOpen] = useState(false);
  const [regMode, setRegMode] = useState<string | null>(null);
  const [startLabel, setStartLabel] = useState('Mit Einladung starten');

  useEffect(() => {
    api.auth
      .registrationStatus()
      .then((s) => {
        setRegMode(s.registrationMode);
        setStartLabel(startLabelForMode(s.registrationMode));
      })
      .catch(() => {
        setRegMode('invite_only');
        setStartLabel('Mit Einladung starten');
      });
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  const gate = resolveAuthGate(user);
  const authReady = !authLoading;
  const signedIn = authReady && Boolean(user);
  const primaryTo = signedIn ? AUTH_GATE_PATH[gate] : '/login';
  const primaryLabel = signedIn ? continueLabel(gate) : startLabel;
  const showSecondaryLogin = authReady && !signedIn;

  function PrimaryCta({ className }: { className?: string }) {
    if (!authReady) {
      return (
        <Button className={cn('min-h-11 gap-2', className)} loading disabled>
          Sitzung wird geprüft
        </Button>
      );
    }
    return (
      <CtaLink to={primaryTo}>
        {primaryLabel}
        <ArrowRight className="h-4 w-4" aria-hidden />
      </CtaLink>
    );
  }

  const fade = reduceMotion
    ? undefined
    : { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.4 } };

  return (
    <div className="min-h-screen overflow-x-hidden bg-[var(--ucbs-bg)] text-zinc-100">
      <a
        href="#inhalt"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-brand-600 focus:px-3 focus:py-2"
      >
        Zum Inhalt
      </a>

      <header className="sticky top-0 z-50 border-b border-white/5 bg-[var(--ucbs-bg)]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link to="/" className="flex min-h-11 items-center gap-3">
            <NexterMark size={36} />
            <span className="font-display text-sm font-bold uppercase tracking-wider">NEXTER</span>
          </Link>
          <nav className="hidden items-center gap-1 lg:flex" aria-label="Öffentliche Navigation">
            {NAV.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm text-zinc-300 hover:text-white"
              >
                {item.label}
              </a>
            ))}
          </nav>
          <div className="hidden items-center gap-2 lg:flex">
            {showSecondaryLogin && <CtaLink to="/login" variant="ghost">Anmelden</CtaLink>}
            <PrimaryCta />
          </div>
          <Button
            variant="ghost"
            className="min-h-11 lg:hidden"
            aria-expanded={menuOpen}
            aria-controls={menuId}
            aria-label={menuOpen ? 'Menü schließen' : 'Menü öffnen'}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
        {menuOpen && (
          <div id={menuId} className="border-t border-white/5 px-4 py-3 lg:hidden">
            <nav className="flex flex-col gap-1" aria-label="Mobiles Menü">
              {NAV.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm text-zinc-200"
                  onClick={() => setMenuOpen(false)}
                >
                  {item.label}
                </a>
              ))}
              {showSecondaryLogin && (
                <Link to="/login" className="inline-flex min-h-11 items-center px-3 text-sm" onClick={() => setMenuOpen(false)}>
                  Anmelden
                </Link>
              )}
              {authReady ? (
                <Link
                  to={primaryTo}
                  className="inline-flex min-h-11 items-center px-3 text-sm font-medium text-[var(--ucbs-accent-cyan)]"
                  onClick={() => setMenuOpen(false)}
                >
                  {primaryLabel}
                </Link>
              ) : (
                <p className="px-3 py-2 text-sm text-zinc-400" role="status">
                  Sitzung wird geprüft
                </p>
              )}
            </nav>
          </div>
        )}
      </header>

      <main id="inhalt">
        <section className="relative overflow-hidden px-4 pb-16 pt-16 sm:px-6 sm:pt-20">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(34,211,238,0.12),_transparent_50%)]" aria-hidden />
          <motion.div {...fade} className="relative mx-auto max-w-4xl text-center">
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--ucbs-accent-cyan)]">
              Geschlossene Creator-Beta
            </p>
            <h1 className="font-display text-4xl font-bold leading-tight sm:text-5xl lg:text-6xl">
              NEXTER Creator Studio
              <br />
              <span className="bg-gradient-to-r from-[var(--ucbs-accent-cyan)] via-brand-400 to-[var(--ucbs-accent-purple)] bg-clip-text text-transparent">
                Deine Marke. Deine Studios. Ein Assistent.
              </span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-zinc-400">
              Creator-Plattform mit dem persönlichen KI-Assistenten Nexter. Er hilft bei Erstellung und Organisation
              deiner Inhalte — im Browser, mit Creator DNA als gemeinsamer Markenbasis.
            </p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
              {authReady ? (
                <CtaLink to={primaryTo} variant="primary">
                  {primaryLabel} <ArrowRight className="h-4 w-4" aria-hidden />
                </CtaLink>
              ) : (
                <Button size="lg" className="min-h-11 gap-2" loading disabled>
                  Sitzung wird geprüft
                </Button>
              )}
              {showSecondaryLogin && (
                <CtaLink to="/login" variant="outline">
                  Anmelden
                </CtaLink>
              )}
            </div>
            <p className="mt-4 text-xs text-zinc-500">
              {regMode === 'public'
                ? 'Registrierung ist derzeit offen.'
                : 'Zugang in der Regel mit Einladung — kein offener Start ohne gültigen Code.'}
            </p>
          </motion.div>
        </section>

        <section id="funktionen" className="scroll-mt-20 border-y border-white/5 bg-[var(--ucbs-card)]/40 py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="mb-8 text-center font-display text-2xl font-bold text-white">Was NEXTER bietet</h2>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <GlassCard accent="cyan" hover={!reduceMotion} className="h-full !p-5">
              <h3 className="font-display text-lg font-semibold text-white">Creator DNA</h3>
              <p className="mt-2 text-sm text-zinc-400">
                Farben, Stil, Motiv, Schrift und Plattformpräferenzen als gemeinsame Grundlage. Hilft, Designs
                konsistent zu halten — ohne Garantie, dass jede Generation exakt identisch ist.
              </p>
            </GlassCard>
            <GlassCard accent="purple" hover={!reduceMotion} className="h-full !p-5">
              <h3 className="font-display text-lg font-semibold text-white">Nexter</h3>
              <p className="mt-2 text-sm text-zinc-400">
                Persönlicher Creator-Assistent: Preferences, DNA, Studios, Rückfragen und Kostenanzeige vor
                bezahlten Aktionen. Keine autonome Veröffentlichung und keine selbstständigen Zahlungen.
              </p>
            </GlassCard>
            <GlassCard accent="green" hover={!reduceMotion} className="h-full !p-5">
              <h3 className="font-display text-lg font-semibold text-white">Coins &amp; Quotes</h3>
              <p className="mt-2 text-sm text-zinc-400">
                Coins bezahlen Provider-Generierungen. Lokale Aktionen können 0 Coins kosten. Kosten werden vor einer Generierung angezeigt. Käufe sind derzeit nicht verfügbar.
              </p>
            </GlassCard>
            </div>
          </div>
        </section>

        <section id="nexter" className="scroll-mt-20 mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="font-display text-2xl font-bold text-white">Nexter, dein Creator-Assistent</h2>
          <p className="mt-3 max-w-3xl text-zinc-400">
            Nexter kennt deine gespeicherten Preferences, kann Creator DNA berücksichtigen, hilft in den Studios,
            fragt nach, wenn Informationen fehlen, und kann Projekte sowie Assets im eigenen Account einbeziehen.
            Vor kostenpflichtigen Aktionen zeigt er Quote bzw. Kosten. Er steuert keine fremden Plattform-Accounts und
            führt keine Zahlungen aus.
          </p>
        </section>

        <section id="studios" className="scroll-mt-20 border-t border-white/5 py-16">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="mb-2 font-display text-2xl font-bold text-white">Creator Tools</h2>
            <p className="mb-10 text-zinc-500">Nur Funktionen, die der aktuelle Stand der App wirklich unterstützt.</p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {STUDIO_CARDS.map((card) => (
                <GlassCard key={card.title} hover={!reduceMotion} className="h-full !p-5">
                  <h3 className="font-display font-semibold text-white">{card.title}</h3>
                  <p className="mt-2 text-sm text-zinc-400">{card.text}</p>
                </GlassCard>
              ))}
            </div>

            <h3 className="mt-12 font-display text-lg font-semibold text-white">Streamset-Pack</h3>
            <p className="mt-2 text-sm text-zinc-400">Die 12 vorhandenen Bestandteile des zentralen Streamset-Katalogs:</p>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {STREAMSET_PACK_ITEMS.map((item) => (
                <li
                  key={item.key}
                  className="rounded-lg border border-white/10 bg-[var(--ucbs-card)] px-4 py-3 text-sm text-zinc-300"
                >
                  {item.label}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="faq" className="scroll-mt-20 border-t border-white/5 py-16">
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <h2 className="mb-8 font-display text-2xl font-bold text-white">FAQ</h2>
            <dl className="space-y-6">
              {FAQ.map((item) => (
                <div key={item.q}>
                  <dt className="font-medium text-white">{item.q}</dt>
                  <dd className="mt-2 text-sm text-zinc-400">{item.a}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/5 py-8 text-center text-xs text-zinc-600">
        <p>© {new Date().getFullYear()} NEXTER Creator Studio · geschlossene Creator-Beta</p>
        <p className="mt-2">
          <Link to="/legal/impressum" className="text-zinc-400 hover:text-white">
            Impressum
          </Link>
          {' · '}
          <Link to="/legal/datenschutz" className="text-zinc-400 hover:text-white">
            Datenschutz
          </Link>
          {' · '}
          <Link to="/legal/agb" className="text-zinc-400 hover:text-white">
            AGB
          </Link>
          {' · '}
          <Link to="/legal/widerruf" className="text-zinc-400 hover:text-white">
            Widerruf
          </Link>
          {' · '}
          <Link to="/legal/cookies" className="text-zinc-400 hover:text-white">
            Speicher
          </Link>
        </p>
        <p className="mt-2 text-zinc-600">Rechtstexte sind Entwürfe, keine geprüften Finalfassungen.</p>
      </footer>
    </div>
  );
}
