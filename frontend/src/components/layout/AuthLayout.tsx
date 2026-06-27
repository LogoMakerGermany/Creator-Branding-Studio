import { Outlet, Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';

export function AuthLayout() {
  return (
    <div className="flex min-h-screen">
      <div className="hidden flex-1 flex-col justify-between bg-gradient-to-br from-brand-900 via-surface-950 to-surface-950 p-12 lg:flex">
        <Link to="/" className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600">
            <Sparkles className="h-6 w-6 text-white" />
          </div>
          <span className="font-display text-xl font-bold text-white">UCBS</span>
        </Link>
        <div>
          <h1 className="font-display text-4xl font-bold leading-tight text-white">
            Deine Creator DNA.
            <br />
            <span className="text-brand-400">Ein Branding. Alle Plattformen.</span>
          </h1>
          <p className="mt-4 max-w-md text-lg text-zinc-400">
            All-in-One KI-Plattform für Logos, Banner, Videos, VTuber-Avatare und mehr.
          </p>
        </div>
        <p className="text-sm text-zinc-600">© 2026 Ultimate Creator Branding Studio</p>
      </div>
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="w-full max-w-md">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
