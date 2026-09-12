import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import {
  clampNexterAudioLevel,
  nexterOrbStatusLabel,
  resolveNexterOrbState,
  type NexterOrbState,
} from '@ucbs/shared';

const DEFAULT_PRIMARY = '#3b82f6';
const DEFAULT_SECONDARY = '#a855f7';

const INTENSITY: Record<NexterOrbState, number> = {
  idle: 0.32,
  listening: 0.68,
  thinking: 0.58,
  speaking: 0.74,
  generating: 0.8,
  success: 0.86,
  warning: 0.52,
  error: 0.7,
};

const SPEED: Record<NexterOrbState, number> = {
  idle: 0.42,
  listening: 1.05,
  thinking: 0.88,
  speaking: 1.28,
  generating: 1.18,
  success: 1.45,
  warning: 0.72,
  error: 1.55,
};

function readCssColor(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function parseRgb(input: string, fallback: [number, number, number]): [number, number, number] {
  const raw = input.trim();
  const rgb = raw.match(/rgba?\(\s*(\d+)\s*[, ]\s*(\d+)\s*[, ]\s*(\d+)/i);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  const hex = raw.replace('#', '');
  if (hex.length === 3 && /^[0-9a-f]+$/i.test(hex)) {
    return [parseInt(hex[0] + hex[0], 16), parseInt(hex[1] + hex[1], 16), parseInt(hex[2] + hex[2], 16)];
  }
  if (hex.length >= 6 && /^[0-9a-f]+$/i.test(hex.slice(0, 6))) {
    return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
  }
  return fallback;
}

function rgba(hex: string, alpha: number): string {
  const [r, g, b] = parseRgb(hex, [59, 130, 246]);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function NexterOrb({
  state = 'idle',
  size = 72,
  audioLevel = 0,
  primaryColor,
  secondaryColor,
  className,
  decorative = false,
  responsive = false,
}: {
  state?: NexterOrbState | string;
  size?: number;
  audioLevel?: number;
  primaryColor?: string;
  secondaryColor?: string;
  className?: string;
  decorative?: boolean;
  responsive?: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  const audioRef = useRef(audioLevel);
  const sizeRef = useRef(size);
  const colorsRef = useRef({ primary: primaryColor, secondary: secondaryColor });
  stateRef.current = state;
  audioRef.current = audioLevel;
  sizeRef.current = size;
  colorsRef.current = { primary: primaryColor, secondary: secondaryColor };

  const resolved = resolveNexterOrbState(state);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const canvasEl = canvas;
    const gfx = ctx;
    const mq =
      typeof window !== 'undefined' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

    let frame = 0;
    let raf = 0;
    let pixelSize = sizeRef.current;
    let intensity = INTENSITY.idle;
    let lastKey = '';
    let alive = true;

    function measure(): number {
      if (responsive && wrap) {
        const box = wrap.getBoundingClientRect();
        return Math.max(48, Math.round(Math.min(box.width, box.height) || sizeRef.current));
      }
      return sizeRef.current;
    }

    function palette(s: NexterOrbState): [string, string] {
      const primary =
        colorsRef.current.primary ||
        readCssColor('--nexter-orb-primary', readCssColor('--ucbs-accent-cyan', DEFAULT_PRIMARY));
      const secondary =
        colorsRef.current.secondary ||
        readCssColor('--nexter-orb-secondary', readCssColor('--ucbs-accent-purple', DEFAULT_SECONDARY));
      if (s === 'success') return [readCssColor('--ucbs-accent-green', '#34d399'), primary];
      if (s === 'warning') return [secondary, '#fbbf24'];
      if (s === 'error') return [secondary, '#fb7185'];
      return [primary, secondary];
    }

    function draw(s: NexterOrbState, audio: number, reduceMotion: boolean, t: number) {
      pixelSize = measure();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const nextW = Math.round(pixelSize * dpr);
      const nextH = Math.round(pixelSize * dpr);
      if (canvasEl.width !== nextW || canvasEl.height !== nextH) {
        canvasEl.width = nextW;
        canvasEl.height = nextH;
        canvasEl.style.width = `${pixelSize}px`;
        canvasEl.style.height = `${pixelSize}px`;
        gfx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }

      const [c1, c2] = palette(s);
      const target = INTENSITY[s] + audio * (s === 'speaking' || s === 'listening' ? 0.22 : 0.08);
      intensity = reduceMotion ? target : intensity + (target - intensity) * 0.085;
      const speed = SPEED[s];
      const pulse =
        reduceMotion
          ? 1 + intensity * 0.04
          : 1 + Math.sin(t * (s === 'idle' ? 0.9 : 1.6 + speed * 0.35)) * (0.018 + intensity * 0.035);
      const jitter = s === 'error' ? Math.sin(t * 7.2) * 0.028 : s === 'warning' ? Math.sin(t * 3.1) * 0.012 : 0;
      const cx = pixelSize / 2;
      const cy = pixelSize / 2;
      const r = pixelSize * 0.42;

      gfx.clearRect(0, 0, pixelSize, pixelSize);

      const aura = gfx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r * 1.18);
      aura.addColorStop(0, rgba(c1, 0.18 + intensity * 0.22));
      aura.addColorStop(0.55, rgba(c2, 0.1 + intensity * 0.08));
      aura.addColorStop(1, 'rgba(0,0,0,0)');
      gfx.fillStyle = aura;
      gfx.beginPath();
      gfx.arc(cx, cy, r * 1.16 * pulse, 0, Math.PI * 2);
      gfx.fill();

      gfx.save();
      gfx.beginPath();
      gfx.arc(cx, cy, r * pulse, 0, Math.PI * 2);
      gfx.clip();

      const voidFill = gfx.createRadialGradient(cx, cy + r * 0.12, r * 0.05, cx, cy, r);
      voidFill.addColorStop(0, 'rgba(10, 14, 28, 0.35)');
      voidFill.addColorStop(0.55, 'rgba(4, 7, 16, 0.82)');
      voidFill.addColorStop(1, 'rgba(2, 4, 10, 0.96)');
      gfx.fillStyle = voidFill;
      gfx.fillRect(cx - r, cy - r, r * 2, r * 2);

      const coreGlow = gfx.createRadialGradient(cx, cy, r * 0.04, cx, cy, r * (0.42 + intensity * 0.18));
      coreGlow.addColorStop(0, rgba(c1, 0.55 + intensity * 0.35));
      coreGlow.addColorStop(0.45, rgba(c2, 0.22 + intensity * 0.18));
      coreGlow.addColorStop(1, 'rgba(0,0,0,0)');
      gfx.fillStyle = coreGlow;
      gfx.beginPath();
      gfx.arc(cx, cy, r * 0.62 * pulse, 0, Math.PI * 2);
      gfx.fill();

      const inward = s === 'thinking' || s === 'generating' ? 0.18 : 0.08;
      const boltCount = reduceMotion ? 4 : s === 'listening' || s === 'speaking' || s === 'generating' ? 9 : s === 'error' ? 8 : 6;
      gfx.lineCap = 'round';
      gfx.lineJoin = 'round';
      for (let i = 0; i < boltCount; i++) {
        const seed = i * 1.37;
        const a = t * speed * 0.55 + (i * Math.PI * 2) / boltCount + Math.sin(t * 0.7 + seed) * 0.18;
        const inner = r * (0.16 + inward + (s === 'thinking' ? 0.08 : 0)) * pulse;
        const outer = r * (0.92 + Math.sin(t * 1.8 + seed) * 0.04 + audio * 0.06 + jitter) * pulse;
        const jagged = reduceMotion ? 1.2 : 3.8 + intensity * 5.5;
        gfx.strokeStyle = rgba(i % 2 ? c2 : c1, 0.28 + intensity * 0.42);
        gfx.lineWidth = Math.max(0.8, pixelSize / (s === 'idle' ? 92 : 70));
        gfx.beginPath();
        const x0 = cx + Math.cos(a) * outer;
        const y0 = cy + Math.sin(a) * outer;
        const x1 = cx + Math.cos(a) * inner;
        const y1 = cy + Math.sin(a) * inner;
        gfx.moveTo(x0, y0);
        const segs = reduceMotion ? 2 : 5;
        for (let k = 1; k <= segs; k++) {
          const p = k / segs;
          const wobble = Math.sin(t * 2.4 + seed + p * 9) * jagged * (1 - p);
          const perp = a + Math.PI / 2;
          gfx.lineTo(x0 + (x1 - x0) * p + Math.cos(perp) * wobble, y0 + (y1 - y0) * p + Math.sin(perp) * wobble);
        }
        gfx.stroke();

        if (!reduceMotion && i % 2 === 0) {
          const mid = 0.45;
          const mx = x0 + (x1 - x0) * mid;
          const my = y0 + (y1 - y0) * mid;
          const ba = a + 0.55 * Math.sin(t + seed);
          gfx.strokeStyle = rgba(c1, 0.18 + intensity * 0.22);
          gfx.lineWidth = Math.max(0.6, pixelSize / 110);
          gfx.beginPath();
          gfx.moveTo(mx, my);
          gfx.lineTo(cx + Math.cos(ba) * inner * 1.15, cy + Math.sin(ba) * inner * 1.15);
          gfx.stroke();
        }
      }

      const sparks = reduceMotion ? 3 : 9;
      for (let i = 0; i < sparks; i++) {
        const life = (t * (0.08 + intensity * 0.06) + i * 0.13) % 1;
        const dist = r * (0.9 - life * (0.62 + inward));
        const a = i * 0.95 + t * 0.12 * speed;
        const px = cx + Math.cos(a) * dist;
        const py = cy + Math.sin(a * 1.05) * dist;
        gfx.fillStyle = rgba(i % 2 ? c2 : c1, (1 - life) * (0.25 + intensity * 0.45));
        gfx.beginPath();
        gfx.arc(px, py, Math.max(0.7, pixelSize * 0.008 * (1 - life)), 0, Math.PI * 2);
        gfx.fill();
      }

      const coreR = r * (0.16 + intensity * 0.04 + audio * 0.03) * pulse;
      const core = gfx.createRadialGradient(cx - coreR * 0.28, cy - coreR * 0.32, 1, cx, cy, coreR);
      core.addColorStop(0, 'rgba(248,250,252,0.42)');
      core.addColorStop(0.32, rgba(c1, 0.9));
      core.addColorStop(1, rgba(c2, 0.55));
      gfx.fillStyle = core;
      gfx.beginPath();
      gfx.arc(cx, cy, coreR, 0, Math.PI * 2);
      gfx.fill();
      gfx.restore();

      const rim = gfx.createRadialGradient(cx - r * 0.35, cy - r * 0.42, r * 0.1, cx, cy, r * pulse);
      rim.addColorStop(0.82, 'rgba(255,255,255,0)');
      rim.addColorStop(0.93, 'rgba(255,255,255,0.28)');
      rim.addColorStop(1, 'rgba(255,255,255,0.04)');
      gfx.strokeStyle = rim;
      gfx.lineWidth = Math.max(1.2, pixelSize * 0.018);
      gfx.beginPath();
      gfx.arc(cx, cy, r * pulse - gfx.lineWidth / 2, 0, Math.PI * 2);
      gfx.stroke();
    }

    function tick() {
      if (!alive) return;
      const hidden = typeof document !== 'undefined' && document.hidden;
      if (hidden) {
        raf = 0;
        return;
      }
      const reduceMotion = Boolean(mq?.matches);
      const s = resolveNexterOrbState(stateRef.current);
      const audio = clampNexterAudioLevel(audioRef.current);
      const colors = `${colorsRef.current.primary || ''}|${colorsRef.current.secondary || ''}`;
      if (!reduceMotion) frame += 1;
      const t = reduceMotion ? 0.35 : frame / 52;
      const key = `${s}|${audio.toFixed(3)}|${measure()}|${reduceMotion ? 0 : frame}|${colors}`;
      if (key !== lastKey) {
        lastKey = key;
        draw(s, audio, reduceMotion, t);
      }
      raf = requestAnimationFrame(tick);
    }

    function onVis() {
      if (!alive) return;
      if (!document.hidden && raf === 0) raf = requestAnimationFrame(tick);
    }

    function onMotion() {
      lastKey = '';
    }

    tick();
    const ro = responsive && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => {
      lastKey = '';
    }) : null;
    if (ro && wrap) ro.observe(wrap);
    document.addEventListener('visibilitychange', onVis);
    mq?.addEventListener('change', onMotion);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      raf = 0;
      ro?.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      mq?.removeEventListener('change', onMotion);
    };
  }, [responsive]);

  return (
    <div
      ref={wrapRef}
      className={cn('nexter-orb', responsive && 'nexter-orb--responsive', className)}
      style={responsive ? undefined : { width: size, height: size }}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : `Nexter ${nexterOrbStatusLabel(resolved)}`}
      aria-live={decorative ? undefined : 'polite'}
      data-state={resolved}
      role={decorative ? undefined : 'img'}
    >
      <div className="nexter-orb__glass">
        <canvas ref={canvasRef} className="nexter-orb__canvas" aria-hidden="true" />
        <span className="nexter-orb__mark" aria-hidden="true">
          N
        </span>
        <span className="nexter-orb__specular" aria-hidden="true" />
      </div>
    </div>
  );
}
