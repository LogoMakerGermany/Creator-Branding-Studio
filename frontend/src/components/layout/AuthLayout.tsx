import { Outlet, Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';

export function AuthLayout() {
  return (
    <div className="flex min-h-screen bg-[var(--ucbs-bg)]">
      <div className="relative hidden flex-1 flex-col justify-between overflow-hidden p-12 lg:flex">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_rgba(34,211,238,0.15),_transparent_55%)]" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,_rgba(168,85,247,0.12),_transparent_50%)]" />
        <Link to="/" className="relative flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--ucbs-accent-cyan)] to-[var(--ucbs-accent-purple)]">
            <Sparkles className="h-6 w-6 text-white" />
          </div>
          <span className="font-display text-xl font-bold text-white">UCBS</span>
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
        </div>
        <p className="relative text-sm text-zinc-600">© 2026 Ultimate Creator Branding Studio</p>
      </div>
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="w-full max-w-md">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
