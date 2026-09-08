import { Link } from 'react-router-dom';

const LINKS = [
  { to: '/legal/impressum', label: 'Impressum' },
  { to: '/legal/datenschutz', label: 'Datenschutz' },
  { to: '/legal/agb', label: 'Nutzungsbedingungen' },
] as const;

export function LegalFooter({ className = '' }: { className?: string }) {
  return (
    <nav className={`flex flex-wrap gap-x-4 gap-y-2 text-sm ${className}`} aria-label="Rechtliche Seiten">
      {LINKS.map((item) => (
        <Link key={item.to} to={item.to} className="text-zinc-400 underline decoration-zinc-600 underline-offset-2 hover:text-white">
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
