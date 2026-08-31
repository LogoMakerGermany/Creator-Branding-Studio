import { Outlet, Link } from 'react-router-dom';
import { Dna, Palette, Film } from 'lucide-react';
import { NexterMark } from '@/components/nexter/NexterMark';

const highlights = [
  { icon: Dna, text: 'Creator DNA als Basis für alles' },
  { icon: Palette, text: 'Logos, Banner, Overlays & Emotes' },
  { icon: Film, text: 'Video-Highlights & Shorts per KI' },
];

export function AuthLayout() {
  const year = new Date().getFullYear();

  return (
    <div className="flex min-h-screen bg-[var(--ucbs-bg)]">
      <div className="relative hidden flex-1 flex-col justify-between overflow-hidden p-12 lg:flex">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_rgba(34,211,238,0.15),_transparent_55%)]" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,_rgba(168,85,247,0.12),_transparent_50%)]" />
        <Link to="/" className="relative flex items-center gap-3">
          <NexterMark size={40} />
          <div>
            <span className="block font-display text-xl font-bold text-white">NEXTER</span>
            <span className="block text-[10px] uppercase tracking-[0.16em] text-violet-300">Creator Studio</span>
          </div>
        </Link>
        <div className="relative">
          <h1 className="font-display text-4xl font-bold leading-tight text-white">
            Deine Creator DNA.
            <br />
            <span className="bg-gradient-to-r from-[var(--ucbs-accent-cyan)] to-[var(--ucbs-accent-purple)] bg-clip-text text-transparent">
              Ein Branding. Alle Plattformen.
            </span>
          </h1>
          <p className="mt-4 max-w-md text-lg text-zinc-400">
            All-in-One KI-Plattform für Logos, Banner, Videos, VTuber-Avatare und mehr — für Streamer und Teams.
          </p>
          <ul className="mt-8 space-y-3">
            {highlights.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-sm text-zinc-400">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5">
                  <Icon className="h-4 w-4 text-[var(--ucbs-accent-cyan)]" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-zinc-600">© {year} NEXTER Creator Studio</p>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center p-6 sm:p-8">
        <div className="mb-8 text-center lg:hidden">
          <Link to="/" className="inline-flex items-center gap-2">
            <NexterMark size={36} />
            <span className="font-display text-lg font-bold text-white">NEXTER</span>
          </Link>
          <p className="mt-3 text-sm text-zinc-500">Deine Creator DNA — ein Branding für alle Plattformen</p>
        </div>
        <div className="w-full max-w-md">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
