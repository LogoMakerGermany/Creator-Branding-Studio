import type { LogoGenerationOptions, LogoCameraSettings } from '../studio';

export type LogoCameraKey = keyof LogoCameraSettings;

export const LOGO_CAMERA_CONTROLS: {
  key: LogoCameraKey;
  label: string;
  hint: string;
  promptTerm: string;
}[] = [
  { key: 'zoom', label: 'Zoom', hint: 'Nahaufnahme & Hero-Crop', promptTerm: 'camera zoom / framing tightness' },
  { key: 'rotation', label: 'Rotation', hint: 'Drehung & Dutch Angle', promptTerm: 'logo rotation / dynamic tilt' },
  { key: 'perspective', label: 'Perspektive', hint: 'Weitwinkel vs. Tele', promptTerm: 'lens perspective / field of view' },
  { key: 'angle', label: 'Winkel', hint: 'Low Angle, Eye-Level, Bird\'s Eye', promptTerm: 'camera angle elevation' },
  { key: 'depthOfField', label: 'Tiefenschärfe', hint: 'Bokeh & Fokus-Tiefe', promptTerm: 'depth of field / background blur' },
];

export const DEFAULT_LOGO_CAMERA: LogoCameraSettings = {
  zoom: 50,
  rotation: 50,
  perspective: 55,
  angle: 50,
  depthOfField: 45,
};

function intensityLabel(value: number): string {
  if (value <= 20) return 'subtle';
  if (value <= 45) return 'moderate';
  if (value <= 70) return 'strong';
  if (value <= 85) return 'intense';
  return 'maximum';
}

function zoomPhrase(value: number): string {
  if (value <= 25) return 'wide establishing shot with breathing room';
  if (value <= 45) return 'balanced medium framing';
  if (value <= 70) return 'tight hero crop on logo centerpiece';
  if (value <= 85) return 'aggressive close-up macro framing';
  return 'extreme tight macro hero shot';
}

function rotationPhrase(value: number): string {
  const deg = Math.round((value / 100) * 45 - 22.5);
  if (Math.abs(deg) <= 5) return 'upright stable composition';
  if (deg > 0) return `${intensityLabel(value)} clockwise rotation (~${deg}°)`;
  return `${intensityLabel(value)} counter-clockwise Dutch tilt (~${Math.abs(deg)}°)`;
}

function perspectivePhrase(value: number): string {
  if (value <= 25) return 'wide-angle lens distortion for epic scale';
  if (value <= 45) return 'natural standard lens perspective';
  if (value <= 70) return 'slightly compressed telephoto look';
  return 'strong telephoto compression, cinematic flattening';
}

function anglePhrase(value: number): string {
  if (value <= 25) return 'dramatic low-angle hero shot looking up';
  if (value <= 45) return 'slightly low-angle power framing';
  if (value <= 70) return 'eye-level balanced camera height';
  if (value <= 85) return 'elevated high-angle overview';
  return 'extreme bird\'s-eye top-down angle';
}

function depthOfFieldPhrase(value: number): string {
  if (value <= 20) return 'deep focus, everything sharp';
  if (value <= 45) return 'light background softening';
  if (value <= 70) return 'cinematic shallow depth of field';
  if (value <= 85) return 'strong bokeh separation from background';
  return 'extreme shallow DOF, creamy bokeh blur';
}

export function resolveLogoCamera(opts: LogoGenerationOptions): LogoCameraSettings {
  return { ...DEFAULT_LOGO_CAMERA, ...opts.logoCamera };
}

/** Kamera-Phrase für MAGIK Prompts */
export function buildLogoCameraPromptPhrase(opts: LogoGenerationOptions): string {
  const camera = resolveLogoCamera(opts);
  const parts = [
    zoomPhrase(camera.zoom),
    rotationPhrase(camera.rotation),
    perspectivePhrase(camera.perspective),
    anglePhrase(camera.angle),
    depthOfFieldPhrase(camera.depthOfField),
  ];
  return `CAMERA SETUP: ${parts.join(', ')}`;
}

/** 0–1 Faktoren für UI-Vorschau */
export function logoCameraPreviewFactors(opts: LogoGenerationOptions) {
  const c = resolveLogoCamera(opts);
  return {
    zoom: c.zoom / 100,
    rotation: ((c.rotation / 100) * 45 - 22.5),
    perspective: c.perspective / 100,
    angle: c.angle / 100,
    depthOfField: c.depthOfField / 100,
  };
}

export function randomLogoCamera(): LogoCameraSettings {
  const rand = () => Math.floor(Math.random() * 81) + 20;
  return {
    zoom: rand(),
    rotation: rand(),
    perspective: rand(),
    angle: rand(),
    depthOfField: rand(),
  };
}
