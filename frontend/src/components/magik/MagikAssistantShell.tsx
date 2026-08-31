import { useNavigate, useLocation } from 'react-router-dom';
import { NexterOrb } from '@/components/nexter/NexterOrb';
import { useNexterStore } from '@/v2/store/nexter-store';

/** Mobile shortcut to Nexter — desktop uses the studio/sidebar panel. */
export function MagikAssistantShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const orbState = useNexterStore((s) => s.orbState);
  const audioLevel = useNexterStore((s) => s.audioLevel);
  if (location.pathname.startsWith('/onboarding') || location.pathname.startsWith('/legal')) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={() => navigate('/nexter')}
      className="fixed bottom-20 right-4 z-40 rounded-full border border-violet-500/40 bg-black/70 p-1 shadow-2xl backdrop-blur-md lg:hidden"
      aria-label="Nexter öffnen"
      data-testid="nexter-fab"
    >
      <NexterOrb state={orbState} size={56} audioLevel={audioLevel} decorative />
    </button>
  );
}
