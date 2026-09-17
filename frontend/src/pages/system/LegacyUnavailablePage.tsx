import { Link } from 'react-router-dom';
import { NexterMark } from '@/components/nexter/NexterMark';

export function LegacyUnavailablePage({ title = 'Modul nicht verfügbar' }: { title?: string }) {
  return (
    <div className="mx-auto flex min-h-[50vh] max-w-lg flex-col items-center gap-4 py-16 text-center">
      <NexterMark size={40} />
      <h1 className="font-display text-2xl font-bold text-white">{title}</h1>
      <p className="text-sm text-zinc-400">
        Dieses Modul ist in der aktuellen NEXTER-Version nicht verfügbar. Es gibt keinen direkten Ersatz.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <Link
          to="/dashboard"
          className="inline-flex min-h-11 items-center rounded-lg bg-violet-600 px-4 text-sm font-medium text-white"
        >
          Zum Dashboard
        </Link>
        <Link
          to="/nexter"
          className="inline-flex min-h-11 items-center rounded-lg border border-white/15 px-4 text-sm font-medium text-zinc-200"
        >
          NEXTER öffnen
        </Link>
        <Link
          to="/support"
          className="inline-flex min-h-11 items-center rounded-lg border border-white/15 px-4 text-sm font-medium text-zinc-200"
        >
          Support
        </Link>
      </div>
    </div>
  );
}
