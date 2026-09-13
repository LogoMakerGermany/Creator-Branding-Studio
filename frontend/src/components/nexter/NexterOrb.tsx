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
const EYE_OUTER = '#6D28FF';
const EYE_MID = '#9B4DFF';
const EYE_CORE = '#D8A7FF';
const EYE_HIGH = '#F4E9FF';
const ELECTRIC_CYAN = '#3EC8FF';
const INNER_CORE = '#03030B';
const INNER_MID = '#070514';
const INNER_ORB_RATIO = 0.305;
const SHELL_SCALE = 1.34;
const EYE_SIZE_RATIO = 0.228;
const EYE_SPREAD_RATIO = 0.192;

const INTENSITY: Record<NexterOrbState, number> = {
  idle: 0.58,
  listening: 0.74,
  thinking: 0.68,
  speaking: 0.8,
  generating: 0.88,
  success: 0.94,
  warning: 0.62,
  error: 0.78,
};

const SPEED: Record<NexterOrbState, number> = {
  idle: 0.38,
  listening: 1.02,
  thinking: 0.82,
  speaking: 1.22,
  generating: 1.12,
  success: 1.35,
  warning: 0.68,
  error: 1.48,
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

function mixHex(a: string, b: string, t: number): string {
  const [r1, g1, b1] = parseRgb(a, [59, 130, 246]);
  const [r2, g2, b2] = parseRgb(b, [248, 250, 252]);
  const m = Math.min(1, Math.max(0, t));
  return `rgb(${Math.round(r1 + (r2 - r1) * m)}, ${Math.round(g1 + (g2 - g1) * m)}, ${Math.round(b1 + (b2 - b1) * m)})`;
}

function arcLife(t: number, seed: number, cycle: number): number {
  const phase = ((t * 0.22 + seed * 0.17) % cycle) / cycle;
  if (phase < 0.12) return phase / 0.12;
  if (phase > 0.78) return Math.max(0, (1 - phase) / 0.22);
  return 1;
}

function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function eyeOpenAmount(t: number, reduceMotion: boolean): number {
  if (reduceMotion) return 1;
  const span = 8.6;
  const window = Math.floor(t / span);
  const offset = 1.4 + hash(window * 19.7 + 4.1) * 6.2;
  const dur = 0.08 + hash(window * 8.3 + 2.2) * 0.05;
  const local = t - window * span;
  if (local < offset || local > offset + dur) return 1;
  const p = (local - offset) / dur;
  if (p < 0.42) return 1 - (p / 0.42) * 0.92;
  return 0.08 + ((p - 0.42) / 0.58) * 0.92;
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
  variant = 'plasma',
}: {
  state?: NexterOrbState | string;
  size?: number;
  audioLevel?: number;
  primaryColor?: string;
  secondaryColor?: string;
  className?: string;
  decorative?: boolean;
  responsive?: boolean;
  variant?: 'plasma' | 'identity';
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
  const identity = variant === 'identity';

  useEffect(() => {
    if (identity) return;
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
      if (s === 'success') return [mixHex(primary, ELECTRIC_CYAN, 0.35), secondary];
      if (s === 'warning') return [primary, mixHex(secondary, '#f59e0b', 0.28)];
      if (s === 'error') return [primary, mixHex(secondary, '#c084fc', 0.2)];
      return [primary, secondary];
    }

    function polar(cx: number, cy: number, angle: number, radius: number): [number, number] {
      return [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius];
    }

    function strokeLightning(
      x0: number,
      y0: number,
      x1: number,
      y1: number,
      seed: number,
      t: number,
      jagged: number
    ) {
      const dx = x1 - x0;
      const dy = y1 - y0;
      const len = Math.hypot(dx, dy) || 1;
      const ux = -dy / len;
      const uy = dx / len;
      const p1 = 0.26 + hash(seed) * 0.2;
      const p2 = 0.55 + hash(seed + 1.4) * 0.22;
      const j1 = (hash(seed + 2.2) - 0.5) * jagged;
      const j2 = (hash(seed + 3.7) - 0.5) * jagged;
      const wiggle = Math.sin(t * 1.7 + seed) * jagged * 0.18;
      gfx.beginPath();
      gfx.moveTo(x0, y0);
      gfx.bezierCurveTo(
        x0 + dx * p1 + ux * (j1 + wiggle),
        y0 + dy * p1 + uy * (j1 + wiggle),
        x0 + dx * p2 + ux * (j2 - wiggle),
        y0 + dy * p2 + uy * (j2 - wiggle),
        x1,
        y1
      );
      gfx.stroke();
      return {
        mx: x0 + dx * p1 + ux * j1,
        my: y0 + dy * p1 + uy * j1,
      };
    }

    function strokeJaggedBolt(
      x0: number,
      y0: number,
      x1: number,
      y1: number,
      seed: number,
      t: number,
      jagged: number,
      segs: number
    ) {
      const dx = x1 - x0;
      const dy = y1 - y0;
      const len = Math.hypot(dx, dy) || 1;
      const ux = -dy / len;
      const uy = dx / len;
      const n = Math.max(3, segs);
      gfx.beginPath();
      gfx.moveTo(x0, y0);
      let mx = x0;
      let my = y0;
      for (let i = 1; i < n; i++) {
        const p = i / n;
        const j = (hash(seed + i * 1.7) - 0.5) * jagged * (0.4 + Math.sin(p * Math.PI));
        const w = Math.sin(t * 2.1 + seed + i) * jagged * 0.1;
        const x = x0 + dx * p + ux * (j + w);
        const y = y0 + dy * p + uy * (j + w);
        gfx.lineTo(x, y);
        if (i === Math.floor(n / 2)) {
          mx = x;
          my = y;
        }
      }
      gfx.lineTo(x1, y1);
      gfx.stroke();
      return { mx, my };
    }

    function shellTint(angle: number, cyan: string, violet: string): string {
      const a = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const u = (Math.cos(a) + 1) / 2;
      const north = Math.max(0, -Math.sin(a));
      const west = Math.max(0, -Math.cos(a));
      let color = mixHex(cyan, violet, u);
      color = mixHex(color, cyan, west * 0.55);
      color = mixHex(color, '#F8FBFF', north * 0.72);
      color = mixHex(color, '#C026D3', u * 0.22);
      return color;
    }

    function drawEnergyRing(
      cx: number,
      cy: number,
      innerR: number,
      outerR: number,
      cyan: string,
      violet: string,
      behind: boolean,
      t: number,
      reduceMotion: boolean,
      gain: number
    ) {
      const midR = (innerR + outerR) * 0.5;
      const band = Math.max(10, outerR - innerR);
      gfx.save();
      gfx.beginPath();
      gfx.arc(cx, cy, outerR * 1.12, 0, Math.PI * 2);
      gfx.arc(cx, cy, innerR * 0.94, 0, Math.PI * 2, true);
      gfx.clip();
      if (behind) {
        gfx.save();
        gfx.shadowColor = rgba(cyan, 0.9 * gain);
        gfx.shadowBlur = Math.max(18, pixelSize * 0.08);
        gfx.fillStyle = rgba(violet, 0.16 * gain);
        gfx.beginPath();
        gfx.arc(cx, cy, outerR, 0, Math.PI * 2);
        gfx.fill();
        gfx.restore();

        gfx.globalCompositeOperation = 'lighter';
        const blobs = reduceMotion ? 24 : 36;
        for (let i = 0; i < blobs; i++) {
          const a = (i / blobs) * Math.PI * 2 + (reduceMotion ? 0 : Math.sin(t * 0.7 + i) * 0.05);
          const west = Math.max(0, -Math.cos(a));
          const east = Math.max(0, Math.cos(a));
          const north = Math.max(0, -Math.sin(a));
          const south = Math.max(0, Math.sin(a));
          const weight = 0.42 + west * 0.7 + east * 0.62 + north * 0.18 + south * 0.28;
          const pulse = reduceMotion ? 1 : 0.84 + Math.sin(t * 1.1 + i * 0.37) * 0.16;
          const [x, y] = polar(cx, cy, a, midR + (hash(i + 4.2) - 0.5) * band * 0.35);
          const tint = shellTint(a, cyan, violet);
          const rad = band * (1.05 + hash(i + 3.1) * 0.7) * (0.85 + west * 0.25 + east * 0.2);
          const g = gfx.createRadialGradient(x, y, 1, x, y, rad);
          g.addColorStop(0, rgba(tint, 0.78 * gain * pulse * weight));
          g.addColorStop(0.48, rgba(tint, 0.26 * gain * pulse * weight));
          g.addColorStop(1, 'rgba(0,0,0,0)');
          gfx.fillStyle = g;
          gfx.beginPath();
          gfx.arc(x, y, rad, 0, Math.PI * 2);
          gfx.fill();
        }

        const hot = gfx.createRadialGradient(cx - innerR * 0.42, cy - innerR * 0.78, 1, cx - innerR * 0.18, cy - innerR * 0.48, innerR * 0.78);
        hot.addColorStop(0, rgba('#F8FBFF', 0.98 * gain));
        hot.addColorStop(0.28, rgba(cyan, 0.7 * gain));
        hot.addColorStop(1, 'rgba(0,0,0,0)');
        gfx.fillStyle = hot;
        gfx.beginPath();
        gfx.ellipse(cx - innerR * 0.32, cy - innerR * 0.7, innerR * 0.5, innerR * 0.28, -0.58, 0, Math.PI * 2);
        gfx.fill();
        gfx.globalCompositeOperation = 'source-over';
      } else {
        gfx.globalCompositeOperation = 'lighter';
        const wobble = reduceMotion ? 0 : Math.sin(t * 0.9) * band * 0.08;
        const spots: Array<{ a: number; color: string; rx: number; ry: number; rot: number }> = [
          { a: -2.35, color: '#F8FBFF', rx: band * 0.95, ry: band * 0.42, rot: -0.6 },
          { a: 2.85, color: cyan, rx: band * 0.8, ry: band * 0.38, rot: 0.35 },
          { a: 0.35, color: violet, rx: band * 0.78, ry: band * 0.36, rot: -0.2 },
          { a: 1.15, color: '#C026D3', rx: band * 0.55, ry: band * 0.28, rot: 0.4 },
        ];
        spots.forEach((spot, i) => {
          const [x, y] = polar(cx, cy, spot.a, midR + wobble * (i % 2 ? 1 : -1));
          const g = gfx.createRadialGradient(x, y, 1, x, y, spot.rx);
          g.addColorStop(0, rgba(spot.color, 0.9 * gain));
          g.addColorStop(0.45, rgba(spot.color, 0.35 * gain));
          g.addColorStop(1, 'rgba(0,0,0,0)');
          gfx.fillStyle = g;
          gfx.beginPath();
          gfx.ellipse(x, y, spot.rx, spot.ry, spot.rot, 0, Math.PI * 2);
          gfx.fill();
        });
        gfx.globalCompositeOperation = 'source-over';
      }
      gfx.restore();
    }

    function drawPlatform(
      cx: number,
      cy: number,
      innerR: number,
      pixelSize: number,
      cyan: string,
      violet: string,
      t: number,
      reduceMotion: boolean,
      gain: number
    ) {
      const py = cy + innerR + pixelSize * 0.088;
      const rx = pixelSize * 0.5;
      const ry = Math.max(8, pixelSize * 0.072);
      const pulse = reduceMotion ? 0.9 : 0.88 + Math.sin(t * 0.55) * 0.12;
      gfx.save();
      gfx.globalCompositeOperation = 'lighter';
      const core = gfx.createRadialGradient(cx, py, 1, cx, py, rx * 0.5);
      core.addColorStop(0, rgba('#F8FBFF', 0.62 * gain * pulse));
      core.addColorStop(0.28, rgba(cyan, 0.42 * gain * pulse));
      core.addColorStop(0.62, rgba(violet, 0.18 * gain * pulse));
      core.addColorStop(1, 'rgba(0,0,0,0)');
      gfx.fillStyle = core;
      gfx.beginPath();
      gfx.ellipse(cx, py, rx * 0.48, ry * 0.92, 0, 0, Math.PI * 2);
      gfx.fill();

      const rings: Array<{ sx: number; sy: number; color: string; alpha: number; width: number }> = [
        { sx: 1, sy: 1, color: violet, alpha: 0.78, width: 3.8 },
        { sx: 0.88, sy: 0.86, color: '#C026D3', alpha: 0.5, width: 2.8 },
        { sx: 0.72, sy: 0.7, color: cyan, alpha: 0.92, width: 3.4 },
        { sx: 0.52, sy: 0.5, color: '#A5F3FC', alpha: 0.86, width: 2.4 },
        { sx: 0.3, sy: 0.28, color: '#F8FBFF', alpha: 0.95, width: 2.2 },
      ];
      rings.forEach((ring) => {
        gfx.shadowColor = rgba(ring.color, 0.85 * gain * pulse);
        gfx.shadowBlur = 14;
        gfx.strokeStyle = rgba(ring.color, ring.alpha * gain * pulse);
        gfx.lineWidth = Math.max(1.4, ring.width * (pixelSize / 200));
        gfx.beginPath();
        gfx.ellipse(cx, py, rx * ring.sx, ry * ring.sy, 0, 0, Math.PI * 2);
        gfx.stroke();
      });
      gfx.restore();

      const column = gfx.createLinearGradient(cx, cy + innerR * 0.92, cx, py);
      column.addColorStop(0, 'rgba(0,0,0,0)');
      column.addColorStop(0.28, rgba(cyan, 0.12 * gain));
      column.addColorStop(0.68, rgba('#F8FBFF', 0.22 * gain * pulse));
      column.addColorStop(1, rgba(violet, 0.28 * gain * pulse));
      gfx.fillStyle = column;
      gfx.beginPath();
      gfx.moveTo(cx - innerR * 0.16, cy + innerR * 0.98);
      gfx.lineTo(cx + innerR * 0.16, cy + innerR * 0.98);
      gfx.lineTo(cx + rx * 0.22, py);
      gfx.lineTo(cx - rx * 0.22, py);
      gfx.closePath();
      gfx.fill();
    }

    function drawEyes(
      cx: number,
      cy: number,
      innerR: number,
      c1: string,
      c2: string,
      s: NexterOrbState,
      audio: number,
      reduceMotion: boolean,
      t: number,
      intensity: number
    ) {
      const open = eyeOpenAmount(t, reduceMotion);
      const listening = s === 'listening';
      const speaking = s === 'speaking';
      const pulse = reduceMotion ? 1 : 1 + Math.sin(t * 0.48) * 0.045;
      const listenBoost = listening ? 1.16 : 1;
      const bright =
        (0.82 + intensity * 0.22 + (listening || speaking ? audio * 0.18 : 0) + (s === 'success' ? 0.08 : 0)) *
        pulse *
        listenBoost *
        (s === 'error' ? 0.86 + Math.abs(Math.sin(t * 7.4)) * 0.1 : 1);
      const innerD = innerR * 2;
      const eyeD = innerD * EYE_SIZE_RATIO;
      const eyeR = eyeD / 2;
      const spread = innerD * EYE_SPREAD_RATIO;
      const baseY = cy - innerR * 0.05;
      const outer = mixHex(c2, EYE_OUTER, 0.62);
      const mid = mixHex(c2, EYE_MID, 0.55);
      const core = mixHex(c1, EYE_CORE, 0.72);
      const warn = s === 'warning' ? mixHex(mid, '#E9D5FF', 0.2) : mid;

      if (s === 'thinking') {
        const veil = gfx.createRadialGradient(cx, baseY, eyeR * 0.2, cx, baseY, innerR * 0.42);
        veil.addColorStop(0, rgba(c2, 0.1 * bright));
        veil.addColorStop(1, 'rgba(0,0,0,0)');
        gfx.fillStyle = veil;
        gfx.beginPath();
        gfx.arc(cx, baseY, innerR * 0.42, 0, Math.PI * 2);
        gfx.fill();
      }

      for (const side of [-1, 1] as const) {
        const ex = cx + side * spread;
        const ey = baseY;
        const ry = eyeR * 1.02 * Math.max(0.1, open);

        const glow = gfx.createRadialGradient(ex, ey, eyeR * 0.16, ex, ey, eyeR * 1.85);
        glow.addColorStop(0, rgba(core, 0.88 * bright * open));
        glow.addColorStop(0.38, rgba(warn, 0.42 * bright * open));
        glow.addColorStop(0.72, rgba(outer, 0.12 * bright * open));
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        gfx.fillStyle = glow;
        gfx.beginPath();
        gfx.ellipse(ex, ey, eyeR * 1.9, ry * 1.95, 0, 0, Math.PI * 2);
        gfx.fill();

        const halo = gfx.createRadialGradient(ex, ey, eyeR * 0.15, ex, ey, eyeR * 1.35);
        halo.addColorStop(0, rgba(warn, 0.7 * bright * open));
        halo.addColorStop(1, 'rgba(0,0,0,0)');
        gfx.fillStyle = halo;
        gfx.beginPath();
        gfx.ellipse(ex, ey, eyeR * 1.32, ry * 1.38, 0, 0, Math.PI * 2);
        gfx.fill();

        const body = gfx.createRadialGradient(ex - eyeR * 0.18, ey - ry * 0.22, 1, ex, ey, eyeR);
        body.addColorStop(0, rgba(EYE_HIGH, 1 * bright * open));
        body.addColorStop(0.22, rgba(core, 1 * bright * open));
        body.addColorStop(0.58, rgba(warn, 0.98 * bright * open));
        body.addColorStop(1, rgba(outer, 0.9 * bright * open));
        gfx.fillStyle = body;
        gfx.beginPath();
        gfx.ellipse(ex, ey, eyeR, ry, 0, 0, Math.PI * 2);
        gfx.fill();

        const spark = gfx.createRadialGradient(ex - eyeR * 0.22, ey - ry * 0.28, 0, ex, ey, eyeR * 0.42);
        spark.addColorStop(0, rgba(EYE_HIGH, 0.95 * bright * open));
        spark.addColorStop(1, 'rgba(255,255,255,0)');
        gfx.fillStyle = spark;
        gfx.beginPath();
        gfx.ellipse(ex, ey, eyeR * 0.38, ry * 0.4, 0, 0, Math.PI * 2);
        gfx.fill();
      }
    }

    function drawExternalBolts(
      cx: number,
      cy: number,
      innerR: number,
      energyR: number,
      cyan: string,
      violet: string,
      t: number,
      speed: number,
      reduceMotion: boolean,
      generating: boolean,
      listening: boolean,
      error: boolean,
      face: { left: number; right: number; top: number; bottom: number }
    ) {
      gfx.lineCap = 'round';
      gfx.lineJoin = 'round';
      const pad = pixelSize * 0.015;
      const heroes: Array<{ a: number; len: number; tint: 'cyan' | 'violet'; forks: number; seed: number }> = [
        { a: 2.55, len: 1.82, tint: 'cyan', forks: 3, seed: 11 },
        { a: 2.95, len: 1.7, tint: 'cyan', forks: 2, seed: 13 },
        { a: 3.32, len: 1.78, tint: 'cyan', forks: 3, seed: 17 },
        { a: 3.72, len: 1.55, tint: 'cyan', forks: 2, seed: 23 },
        { a: 0.22, len: 1.8, tint: 'violet', forks: 3, seed: 29 },
        { a: -0.42, len: 1.68, tint: 'violet', forks: 2, seed: 31 },
        { a: 5.45, len: 1.52, tint: 'violet', forks: 2, seed: 37 },
      ];
      const extra = reduceMotion ? 0 : generating ? 2 : listening ? 1 : 0;
      const list = reduceMotion ? heroes.slice(0, 4) : pixelSize < 170 ? heroes.slice(0, 5) : heroes;
      const extras: typeof heroes = extra
        ? ([
            { a: 2.78, len: 1.74, tint: 'cyan' as const, forks: 2, seed: 41 },
            { a: 0.05, len: 1.62, tint: 'violet' as const, forks: 2, seed: 43 },
          ].slice(0, extra) as typeof heroes)
        : [];
      [...list, ...extras].forEach((hero) => {
        const seed = hero.seed;
        const life = reduceMotion ? 0.78 : 0.62 + arcLife(t * speed, seed, 5.2 + hash(seed) * 2.1) * 0.38;
        const startR = energyR * 1.05;
        const endR = energyR * hero.len;
        const endA = hero.a + (hash(seed + 6) - 0.5) * 0.22;
        const [x0, y0] = polar(cx, cy, hero.a, startR);
        let [x1, y1] = polar(cx, cy, endA, endR);
        x1 = Math.min(pixelSize - pad, Math.max(pad, x1));
        y1 = Math.min(pixelSize - pad, Math.max(pad, y1));
        const platY = cy + innerR + pixelSize * 0.088;
        const nx = (x1 - cx) / (pixelSize * 0.5);
        const ny = (y1 - platY) / (pixelSize * 0.16);
        if (nx * nx + ny * ny < 1.2) return;
        if (Math.hypot(x0 - cx, y0 - cy) < innerR * 1.02) return;
        if (x0 > face.left && x0 < face.right && y0 > face.top && y0 < face.bottom) return;
        const tint = hero.tint === 'cyan' ? cyan : mixHex(violet, EYE_MID, 0.22);
        gfx.save();
        gfx.globalCompositeOperation = 'lighter';
        gfx.lineCap = 'round';
        gfx.strokeStyle = rgba(tint, 0.2 * life);
        gfx.lineWidth = Math.max(10, pixelSize * (error ? 0.055 : 0.048));
        strokeLightning(x0, y0, x1, y1, seed, t, energyR * (error ? 0.62 : 0.48));
        gfx.shadowColor = rgba(tint, 0.95);
        gfx.shadowBlur = Math.max(16, pixelSize * 0.07);
        gfx.strokeStyle = rgba(tint, (0.42 + intensity * 0.2) * life);
        gfx.lineWidth = Math.max(3.4, pixelSize / 48);
        const mid = strokeLightning(x0, y0, x1, y1, seed, t, energyR * 0.36);
        gfx.strokeStyle = rgba('#F8FBFF', 0.72 * life);
        gfx.lineWidth = Math.max(1.2, pixelSize / 120);
        gfx.shadowBlur = 8;
        strokeLightning(x0, y0, x1, y1, seed + 0.35, t, energyR * 0.14);
        gfx.restore();
        const forks = reduceMotion ? 0 : hero.forks;
        if (forks > 0 && life > 0.35) {
          for (let f = 0; f < forks; f++) {
            const fSeed = seed + 11 + f * 2.4;
            const fa = endA + (hash(fSeed) - 0.5) * 0.85;
            let [fx, fy] = polar(cx, cy, fa, Math.min(energyR * 1.85, startR + energyR * (0.28 + hash(fSeed + 1) * 0.38)));
            fx = Math.min(pixelSize - pad, Math.max(pad, fx));
            fy = Math.min(pixelSize - pad, Math.max(pad, fy));
            gfx.save();
            gfx.globalCompositeOperation = 'lighter';
            gfx.shadowColor = rgba(tint, 0.8);
            gfx.shadowBlur = 12;
            gfx.strokeStyle = rgba(tint, 0.42 * life);
            gfx.lineWidth = Math.max(1.4, pixelSize / 95);
            strokeJaggedBolt(mid.mx, mid.my, fx, fy, fSeed, t, energyR * 0.2, 5);
            gfx.restore();
          }
        }
      });
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
      const cyan = mixHex(c1, ELECTRIC_CYAN, 0.72);
      const violet = mixHex(c2, EYE_OUTER, 0.48);
      const target = INTENSITY[s] + audio * (s === 'speaking' || s === 'listening' ? 0.24 : 0.08);
      intensity = reduceMotion ? target : intensity + (target - intensity) * 0.08;
      const speed = SPEED[s];
      const gain = 0.92 + intensity * 0.55 + (s === 'speaking' ? audio * 0.18 : 0);
      const thinking = s === 'thinking';
      const generating = s === 'generating';
      const listening = s === 'listening';
      const cx = pixelSize / 2;
      const innerR = pixelSize * INNER_ORB_RATIO;
      const energyR = innerR * SHELL_SCALE;
      const cy = pixelSize * 0.382;
      const eyeD = innerR * 2 * EYE_SIZE_RATIO;
      const spread = innerR * 2 * EYE_SPREAD_RATIO;
      const baseY = cy - innerR * 0.05;
      const faceSafeZone = {
        left: cx - spread - eyeD * 0.9,
        right: cx + spread + eyeD * 0.9,
        top: baseY - eyeD * 1.05,
        bottom: baseY + eyeD * 0.95,
      };

      gfx.clearRect(0, 0, pixelSize, pixelSize);

      const aura = gfx.createRadialGradient(cx - energyR * 0.35, cy, energyR * 0.18, cx, cy, energyR * 1.72);
      aura.addColorStop(0, rgba(cyan, 0.28 * gain));
      aura.addColorStop(0.42, rgba(violet, 0.2 * gain));
      aura.addColorStop(1, 'rgba(0,0,0,0)');
      gfx.fillStyle = aura;
      gfx.beginPath();
      gfx.arc(cx, cy, energyR * 1.68, 0, Math.PI * 2);
      gfx.fill();

      const leftGlow = gfx.createRadialGradient(cx - energyR * 0.82, cy + energyR * 0.08, 2, cx - energyR * 0.55, cy, energyR * 1.12);
      leftGlow.addColorStop(0, rgba(cyan, 0.42 * gain));
      leftGlow.addColorStop(1, 'rgba(0,0,0,0)');
      gfx.fillStyle = leftGlow;
      gfx.beginPath();
      gfx.arc(cx - energyR * 0.6, cy, energyR * 1.05, 0, Math.PI * 2);
      gfx.fill();

      const rightGlow = gfx.createRadialGradient(cx + energyR * 0.82, cy - energyR * 0.12, 2, cx + energyR * 0.55, cy, energyR * 1.12);
      rightGlow.addColorStop(0, rgba(violet, 0.46 * gain));
      rightGlow.addColorStop(1, 'rgba(0,0,0,0)');
      gfx.fillStyle = rightGlow;
      gfx.beginPath();
      gfx.arc(cx + energyR * 0.6, cy, energyR * 1.05, 0, Math.PI * 2);
      gfx.fill();

      drawExternalBolts(
        cx,
        cy,
        innerR,
        energyR,
        cyan,
        violet,
        t,
        speed,
        reduceMotion,
        generating,
        listening,
        s === 'error',
        faceSafeZone
      );
      drawPlatform(cx, cy, innerR, pixelSize, cyan, violet, t, reduceMotion, gain * (generating ? 1.15 : 1));
      drawEnergyRing(cx, cy, innerR * 1.02, energyR, cyan, violet, true, t, reduceMotion, gain);

      gfx.save();
      gfx.beginPath();
      gfx.arc(cx, cy, innerR, 0, Math.PI * 2);
      gfx.clip();

      const body = gfx.createRadialGradient(cx - innerR * 0.22, cy - innerR * 0.3, innerR * 0.06, cx, cy, innerR);
      body.addColorStop(0, INNER_CORE);
      body.addColorStop(0.5, INNER_MID);
      body.addColorStop(0.84, '#0B0716');
      body.addColorStop(1, mixHex('#141028', violet, 0.18));
      gfx.fillStyle = body;
      gfx.fillRect(cx - innerR, cy - innerR, innerR * 2, innerR * 2);

      const rim = gfx.createRadialGradient(cx, cy, innerR * 0.72, cx, cy, innerR);
      rim.addColorStop(0, 'rgba(0,0,0,0)');
      rim.addColorStop(0.65, rgba(violet, 0.05));
      rim.addColorStop(1, rgba(cyan, 0.16));
      gfx.fillStyle = rim;
      gfx.beginPath();
      gfx.arc(cx, cy, innerR, 0, Math.PI * 2);
      gfx.fill();

      const innerSheen = gfx.createRadialGradient(cx - innerR * 0.28, cy - innerR * 0.34, 2, cx - innerR * 0.1, cy - innerR * 0.18, innerR * 0.48);
      innerSheen.addColorStop(0, rgba(cyan, 0.06));
      innerSheen.addColorStop(0.45, rgba(violet, 0.03));
      innerSheen.addColorStop(1, 'rgba(0,0,0,0)');
      gfx.fillStyle = innerSheen;
      gfx.beginPath();
      gfx.arc(cx - innerR * 0.18, cy - innerR * 0.22, innerR * 0.5, 0, Math.PI * 2);
      gfx.fill();

      drawEyes(cx, cy, innerR, c1, c2, s, audio, reduceMotion, t, intensity);

      const glass = gfx.createRadialGradient(cx - innerR * 0.34, cy - innerR * 0.46, 1, cx - innerR * 0.22, cy - innerR * 0.34, innerR * 0.32);
      glass.addColorStop(0, rgba('#c4b5fd', 0.12));
      glass.addColorStop(0.38, rgba(cyan, 0.05));
      glass.addColorStop(1, 'rgba(0,0,0,0)');
      gfx.fillStyle = glass;
      gfx.beginPath();
      gfx.ellipse(cx - innerR * 0.3, cy - innerR * 0.42, innerR * 0.18, innerR * 0.09, -0.52, 0, Math.PI * 2);
      gfx.fill();
      gfx.restore();

      drawEnergyRing(cx, cy, innerR * 1.02, energyR, cyan, violet, false, t, reduceMotion, gain * (thinking ? 1.08 : 1));

      if (!reduceMotion && (generating || listening || s === 'error')) {
        const accent = 2;
        for (let i = 0; i < accent; i++) {
          const seed = 80 + i * 5.1;
          const life = arcLife(t * speed, seed, 2.8);
          if (life < 0.2) continue;
          const a = Math.PI * (0.15 + hash(seed) * 0.7) * (i === 0 ? 1 : -1);
          if (a > -0.9 && a < 0.35) continue;
          const [x0, y0] = polar(cx, cy, a, energyR * 0.96);
          const [x1, y1] = polar(cx, cy, a + (hash(seed + 1) - 0.5) * 0.4, energyR * 1.12);
          gfx.strokeStyle = rgba(i ? violet : cyan, 0.22 * life);
          gfx.lineWidth = Math.max(0.8, pixelSize / 130);
          strokeLightning(x0, y0, x1, y1, seed, t, energyR * 0.08);
        }
      }
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
    const ro =
      responsive && typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            lastKey = '';
          })
        : null;
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
  }, [responsive, identity]);

  return (
    <div
      ref={wrapRef}
      className={cn(
        'nexter-orb',
        responsive && 'nexter-orb--responsive',
        identity && 'nexter-orb--identity',
        className
      )}
      style={responsive || identity ? undefined : { width: size, height: size }}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : `Nexter ${nexterOrbStatusLabel(resolved)}`}
      aria-live={decorative ? undefined : 'polite'}
      data-state={resolved}
      role={decorative ? undefined : 'img'}
    >
      <div className="nexter-orb__glass">
        {identity ? null : <canvas ref={canvasRef} className="nexter-orb__canvas" aria-hidden="true" />}
        {identity ? (
          <span className="nexter-orb__mark" aria-hidden="true">
            N
          </span>
        ) : null}
      </div>
    </div>
  );
}
