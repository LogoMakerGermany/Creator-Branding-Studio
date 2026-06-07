import type { BrandDNA } from '@cbs/shared';

export function DNABadge({ dna }: { dna: BrandDNA }) {
  const colors = [...dna.primaryColors, ...dna.accentColors].slice(0, 4);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {colors.map(c => (
        <div key={c} className="h-6 w-6 rounded-full border border-white/20" style={{ backgroundColor: c, boxShadow: `0 0 8px ${c}` }} title={c} />
      ))}
      <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs text-white/60">{dna.brandingStyle.slice(0, 30)}…</span>
      {dna.styleLocked && <span className="rounded-full bg-neon-purple/20 px-2 py-0.5 text-xs text-neon-purple">Stil fixiert</span>}
    </div>
  );
}

export function StyleLockToggle({ locked, onChange }: { locked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
      <input type="checkbox" checked={locked} onChange={e => onChange(e.target.checked)} className="accent-neon-purple h-4 w-4" />
      <div>
        <p className="text-sm font-medium">Stil fixieren</p>
        <p className="text-xs text-white/40">Alle zukünftigen Assets behalten exakt denselben Stil</p>
      </div>
    </label>
  );
}

export function PlatformPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const platforms = ['twitch', 'kick', 'youtube', 'tiktok', 'instagram', 'discord', 'facebook', 'x', 'website'];
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="w-full rounded-xl border border-white/10 bg-surface-3 px-4 py-2.5 text-sm text-white outline-none focus:border-neon-cyan">
      <option value="">Plattform wählen…</option>
      {platforms.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
    </select>
  );
}
