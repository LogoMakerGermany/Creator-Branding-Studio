import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import type { NexterOrbState } from '@ucbs/shared';

const STATE_LABEL: Record<NexterOrbState, string> = {
  idle: 'Bereit',
  listening: 'Hört zu',
  thinking: 'Denkt nach',
  generating: 'Generiert',
  success: 'Fertig',
  warning: 'Achtung',
};

export function NexterOrb({
  state = 'idle',
  size = 72,
  audioLevel = 0,
  className,
  decorative = false,
}: {
  state?: NexterOrbState;
  size?: number;
  audioLevel?: number;
  className?: string;
  decorative?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  const audioRef = useRef(audioLevel);
  stateRef.current = state;
  audioRef.current = audioLevel;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    let frame = 0;
    let raf = 0;
    const cx = size / 2;
    const cy = size / 2;
    const r = size * 0.32;

    const colors: Record<NexterOrbState, [string, string, string]> = {
      idle: ['#a855f7', '#22d3ee', '#7c3aed'],
      listening: ['#38bdf8', '#c084fc', '#22d3ee'],
      thinking: ['#818cf8', '#e879f9', '#a855f7'],
      generating: ['#c026d3', '#22d3ee', '#f0abfc'],
      success: ['#34d399', '#a78bfa', '#22d3ee'],
      warning: ['#f59e0b', '#ef4444', '#fb7185'],
    };

    function draw() {
      if (!ctx) return;
      const s = stateRef.current;
      const [c1, c2, c3] = colors[s];
      const t = frame / 40;
      const audio = Math.min(1, Math.max(0, audioRef.current));
      const activity = s === 'thinking' || s === 'generating' || s === 'listening';
      const pulse =
        (activity ? 1 + Math.sin(t * 3) * 0.08 : 1 + Math.sin(t) * 0.03) + audio * 0.18;

      ctx.clearRect(0, 0, size, size);

      const glow = ctx.createRadialGradient(cx, cy, r * 0.15, cx, cy, r * 2.2);
      glow.addColorStop(0, `${c1}aa`);
      glow.addColorStop(0.4, `${c2}44`);
      glow.addColorStop(1, 'transparent');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 2.15 * pulse, 0, Math.PI * 2);
      ctx.fill();

      for (let i = 0; i < 3; i++) {
        const a = t * (0.7 + i * 0.35) + i * 2.1;
        const bx = cx + Math.cos(a) * r * 0.35;
        const by = cy + Math.sin(a * 1.3) * r * 0.28;
        const blob = ctx.createRadialGradient(bx, by, 0, bx, by, r * 0.55);
        blob.addColorStop(0, `${i === 1 ? c2 : c3}cc`);
        blob.addColorStop(1, 'transparent');
        ctx.fillStyle = blob;
        ctx.beginPath();
        ctx.arc(bx, by, r * 0.55 * pulse, 0, Math.PI * 2);
        ctx.fill();
      }

      const core = ctx.createRadialGradient(cx - r * 0.2, cy - r * 0.25, 2, cx, cy, r * pulse);
      core.addColorStop(0, '#f5f3ff');
      core.addColorStop(0.32, c1);
      core.addColorStop(1, c2);
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(cx, cy, r * pulse, 0, Math.PI * 2);
      ctx.fill();

      const bolts = s === 'listening' || s === 'generating' || s === 'warning' ? 6 : 3;
      ctx.strokeStyle = `${c1}cc`;
      ctx.lineWidth = Math.max(1, size / 60);
      ctx.lineJoin = 'round';
      for (let i = 0; i < bolts; i++) {
        const a = t * (s === 'generating' ? 4 : 1.6) + (i * Math.PI * 2) / bolts;
        const inner = r * 0.7 * pulse;
        const outer = r * (1.45 + Math.sin(t * 5 + i) * 0.18 + audio * 0.2) * pulse;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
        const mid = a + 0.22 * Math.sin(t * 8 + i);
        ctx.lineTo(cx + Math.cos(mid) * ((inner + outer) / 2), cy + Math.sin(mid) * ((inner + outer) / 2));
        ctx.lineTo(cx + Math.cos(a + 0.08) * outer, cy + Math.sin(a + 0.08) * outer);
        ctx.stroke();
      }

      frame += 1;
      raf = requestAnimationFrame(draw);
    }

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [size]);

  return (
    <div
      className={cn('relative flex items-center justify-center', className)}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : `Nexter ${STATE_LABEL[state]}`}
    >
      <canvas ref={canvasRef} style={{ width: size, height: size }} className="block" aria-hidden="true" />
    </div>
  );
}
