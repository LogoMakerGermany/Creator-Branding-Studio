import { Link } from 'react-router-dom';
import { NexterMark } from '@/components/nexter/NexterMark';
import { LegalFooter } from '@/components/legal/LegalFooter';

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--ucbs-bg)] p-6 text-center">
      <NexterMark size={48} />
      <h1 className="font-display text-2xl font-bold text-white">Seite nicht gefunden — NEXTER</h1>
      <p className="max-w-md text-sm text-zinc-400">
        Diese Adresse gehört nicht zur aktuellen NEXTER Creator Studio Oberfläche.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <Link
          to="/"
          className="inline-flex min-h-11 items-center rounded-lg bg-violet-600 px-4 text-sm font-medium text-white"
        >
          Zur Startseite
        </Link>
        <Link
          to="/login"
          className="inline-flex min-h-11 items-center rounded-lg border border-white/15 px-4 text-sm font-medium text-zinc-200"
        >
          Anmelden
        </Link>
      </div>
      <LegalFooter className="mt-6 justify-center" />
    </div>
  );
}
