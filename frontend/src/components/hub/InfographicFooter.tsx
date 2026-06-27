import { Award, Clock, MousePointer, Rocket } from 'lucide-react';

const advantages = [
  { icon: Award, label: 'Professionalität', desc: 'Studio-Qualität für deine Marke' },
  { icon: Clock, label: 'Zeit & Geld sparen', desc: 'Alles in einer Plattform' },
  { icon: MousePointer, label: 'Intuitiv', desc: 'Einfach im Browser nutzen' },
  { icon: Rocket, label: 'Zukunftssicher', desc: 'KI-gestützt & erweiterbar' },
];

export function InfographicFooter() {
  return (
    <section className="border-t border-brand-500/20 bg-surface-950/80 py-16">
      <div className="mx-auto max-w-6xl px-6">
        <h2 className="text-center font-display text-xl font-bold uppercase tracking-wider text-zinc-100">
          Deine Vorteile auf einen Blick
        </h2>
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {advantages.map(({ icon: Icon, label, desc }) => (
            <div key={label} className="ucbs-neon-card flex flex-col items-center p-6 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-500/20 text-brand-300 ring-1 ring-brand-500/40">
                <Icon className="h-6 w-6" />
              </div>
              <h3 className="mt-4 font-display font-semibold text-zinc-100">{label}</h3>
              <p className="mt-1 text-sm text-zinc-500">{desc}</p>
            </div>
          ))}
        </div>
        <p className="ucbs-title-glow mt-12 text-center font-display text-lg font-bold uppercase tracking-[0.2em] text-brand-200">
          Deine Marke. Deine Identität. Dein Erfolg.
        </p>
      </div>
    </section>
  );
}
