import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, X, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui';
import { usePwaInstall } from '@/hooks/usePwaInstall';

const DISMISS_KEY = 'ucbs_pwa_banner_dismissed';

export function PwaInstallBanner() {
  const { canInstall, isInstalled, isIos, install } = usePwaInstall();
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === '1');

  if (dismissed || isInstalled) return null;
  if (!canInstall && !isIos) return null;

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, '1');
    setDismissed(true);
  }

  return (
    <div className="ucbs-neon-card ucbs-neon-card-cyan mb-4 flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-500/20">
          <Smartphone className="h-5 w-5 text-cyan-300" />
        </div>
        <div>
          <p className="text-sm font-medium text-zinc-100">UCBS als App installieren</p>
          <p className="text-xs text-zinc-500">
            {isIos
              ? 'Safari → Teilen → „Zum Home-Bildschirm“'
              : 'Schneller Zugriff wie eine native App — ohne App Store'}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {canInstall ? (
          <Button size="sm" className="gap-1.5" onClick={() => install()}>
            <Download className="h-3.5 w-3.5" />
            Installieren
          </Button>
        ) : (
          <Link to="/mobile-app">
            <Button size="sm" variant="outline">
              Anleitung
            </Button>
          </Link>
        )}
        <button
          type="button"
          onClick={dismiss}
          className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
          aria-label="Schließen"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
