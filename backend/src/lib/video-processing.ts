import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegPath from 'ffmpeg-static';
import type { VideoCrop, VideoEditPlan, VideoMetadata, VideoPause, VideoScene, AudioActivityBucket } from '@ucbs/shared';
import { ffmpegCropScaleFilter, keptRanges } from '@ucbs/shared';
import { ServiceError } from './errors.js';

export interface SubtitleSegment {
  start: number;
  end: number;
  text: string;
}

function requireFfmpeg(): string {
  if (!ffmpegPath) {
    throw new ServiceError(
      503,
      'FFMPEG_UNAVAILABLE',
      'Video-Verarbeitung benötigt FFmpeg (ffmpeg-static nicht verfügbar)'
    );
  }
  return ffmpegPath;
}

function runFfmpeg(args: string[]): Promise<void> {
  const bin = requireFfmpeg();
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.slice(-800) || `ffmpeg exit ${code}`));
    });
    proc.on('error', reject);
  });
}

/** ffmpeg -i prints metadata to stderr and typically exits 1. */
function ffmpegStderr(args: string[]): Promise<string> {
  const bin = requireFfmpeg();
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    proc.on('close', () => resolve(stderr));
    proc.on('error', reject);
  });
}

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'ucbs-video-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function fetchVideoBuffer(sourceUrl: string): Promise<Buffer> {
  if (sourceUrl.startsWith('data:')) {
    const base64 = sourceUrl.split(',')[1] ?? '';
    return Buffer.from(base64, 'base64');
  }
  const res = await fetch(sourceUrl);
  if (!res.ok) {
    throw new ServiceError(502, 'VIDEO_FETCH_FAILED', 'Quellvideo konnte nicht geladen werden');
  }
  return Buffer.from(await res.arrayBuffer());
}

export async function extractAudioFromVideo(sourceUrl: string): Promise<Buffer> {
  return withTempDir(async (dir) => {
    const input = join(dir, 'input.mp4');
    const output = join(dir, 'audio.mp3');
    const videoBuffer = await fetchVideoBuffer(sourceUrl);
    await writeFile(input, videoBuffer);
    await runFfmpeg([
      '-y',
      '-i',
      input,
      '-vn',
      '-acodec',
      'libmp3lame',
      '-q:a',
      '4',
      output,
    ]);
    return readFile(output);
  });
}

export async function clipVideoSegment(
  sourceUrl: string,
  start: number,
  end: number,
  options?: { vertical?: boolean; scaleFilter?: string }
): Promise<Buffer> {
  const duration = Math.max(1, end - start);
  return withTempDir(async (dir) => {
    const input = join(dir, 'input.mp4');
    const output = join(dir, 'clip.mp4');
    await writeFile(input, await fetchVideoBuffer(sourceUrl));

    const vf =
      options?.scaleFilter ??
      (options?.vertical
        ? 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920'
        : undefined);

    const args = [
      '-y',
      '-ss',
      String(Math.max(0, start)),
      '-i',
      input,
      '-t',
      String(duration),
      '-c:v',
      'libx264',
      '-preset',
      'fast',
      '-crf',
      '23',
      '-c:a',
      'aac',
    ];
    if (vf) args.push('-vf', vf);
    args.push(output);

    await runFfmpeg(args);
    return readFile(output);
  });
}

export async function burnSubtitlesIntoVideo(
  sourceUrl: string,
  subtitles: SubtitleSegment[]
): Promise<Buffer> {
  return withTempDir(async (dir) => {
    const input = join(dir, 'input.mp4');
    const srtPath = join(dir, 'subs.srt');
    const output = join(dir, 'rendered.mp4');
    await writeFile(input, await fetchVideoBuffer(sourceUrl));
    await writeFile(srtPath, buildSrtContent(subtitles), 'utf8');

    const srtEscaped = srtPath.replace(/\\/g, '/').replace(/:/g, '\\:');
    await runFfmpeg([
      '-y',
      '-i',
      input,
      '-vf',
      `subtitles='${srtEscaped}'`,
      '-c:v',
      'libx264',
      '-preset',
      'fast',
      '-crf',
      '23',
      '-c:a',
      'copy',
      output,
    ]);
    return readFile(output);
  });
}

export async function convertMp4ToGif(mp4Buffer: Buffer): Promise<Buffer> {
  return withTempDir(async (dir) => {
    const input = join(dir, 'input.mp4');
    const palette = join(dir, 'palette.png');
    const output = join(dir, 'output.gif');
    await writeFile(input, mp4Buffer);
    await runFfmpeg([
      '-y',
      '-i',
      input,
      '-vf',
      'fps=12,scale=640:-1:flags=lanczos,palettegen',
      palette,
    ]);
    await runFfmpeg([
      '-y',
      '-i',
      input,
      '-i',
      palette,
      '-lavfi',
      'fps=12,scale=640:-1:flags=lanczos[x];[x][1:v]paletteuse',
      output,
    ]);
    return readFile(output);
  });
}

export async function convertMp4ToWebm(mp4Buffer: Buffer): Promise<Buffer> {
  return withTempDir(async (dir) => {
    const input = join(dir, 'input.mp4');
    const output = join(dir, 'output.webm');
    await writeFile(input, mp4Buffer);
    await runFfmpeg([
      '-y',
      '-i',
      input,
      '-c:v',
      'libvpx-vp9',
      '-crf',
      '30',
      '-b:v',
      '0',
      '-c:a',
      'libopus',
      output,
    ]);
    return readFile(output);
  });
}

export function buildSrtContent(subtitles: SubtitleSegment[]): string {
  return subtitles
    .map((s, i) => {
      return `${i + 1}\n${formatSrtTime(s.start)} --> ${formatSrtTime(s.end)}\n${s.text.trim()}\n`;
    })
    .join('\n');
}

function formatSrtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)},${String(ms).padStart(3, '0')}`;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function parseFfmpegMetadata(stderr: string, sizeBytes: number): VideoMetadata {
  const durMatch = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  const durationSec = durMatch
    ? Number(durMatch[1]) * 3600 + Number(durMatch[2]) * 60 + Number(durMatch[3])
    : 0;
  const videoLine = stderr.split('\n').find((l) => /Stream #.*Video:/.test(l)) ?? '';
  const dim = videoLine.match(/(\d{2,5})x(\d{2,5})/);
  const fps = videoLine.match(/(\d+(?:\.\d+)?)\s*fps/);
  const vcodec = videoLine.match(/Video:\s*([a-zA-Z0-9_]+)/);
  const audioLine = stderr.split('\n').find((l) => /Stream #.*Audio:/.test(l));
  const acodec = audioLine?.match(/Audio:\s*([a-zA-Z0-9_]+)/);
  const width = dim ? Number(dim[1]) : 0;
  const height = dim ? Number(dim[2]) : 0;
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
  const g = width && height ? gcd(width, height) : 1;
  const aspectRatio = width && height ? `${width / g}:${height / g}` : 'unknown';
  return {
    durationSec,
    width,
    height,
    aspectRatio,
    fps: fps ? Number(fps[1]) : undefined,
    hasAudio: Boolean(audioLine),
    sizeBytes,
    videoCodec: vcodec?.[1],
    audioCodec: acodec?.[1],
  };
}

export async function probeVideoMetadata(sourceUrl: string): Promise<VideoMetadata> {
  return withTempDir(async (dir) => {
    const input = join(dir, 'input.mp4');
    const buf = await fetchVideoBuffer(sourceUrl);
    await writeFile(input, buf);
    const stderr = await ffmpegStderr(['-hide_banner', '-i', input]);
    return parseFfmpegMetadata(stderr, buf.length);
  });
}

export function parseSceneTimestamps(stderr: string, duration: number): VideoScene[] {
  const times: number[] = [0];
  const re = /pts_time:(\d+(?:\.\d+)?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(stderr))) {
    const t = Number(m[1]);
    if (t > 0.15 && t < duration) times.push(t);
  }
  times.push(duration);
  const unique = [...new Set(times.map((t) => Math.round(t * 100) / 100))].sort((a, b) => a - b);
  const scenes: VideoScene[] = [];
  for (let i = 0; i < unique.length - 1; i++) {
    const start = unique[i]!;
    const end = unique[i + 1]!;
    if (end - start < 0.2) continue;
    scenes.push({ start, end, duration: end - start });
  }
  return scenes.length ? scenes : [{ start: 0, end: duration, duration }];
}

export function parseSilenceRanges(stderr: string, duration: number): VideoPause[] {
  const starts: number[] = [];
  const pauses: VideoPause[] = [];
  for (const line of stderr.split('\n')) {
    const s = line.match(/silence_start:\s*(\d+(?:\.\d+)?)/);
    if (s) starts.push(Number(s[1]));
    const e = line.match(/silence_end:\s*(\d+(?:\.\d+)?)/);
    if (e && starts.length) {
      const start = starts.pop()!;
      const end = Math.min(duration, Number(e[1]));
      if (end - start >= 0.4) pauses.push({ start, end, duration: end - start });
    }
  }
  return pauses;
}

export async function detectScenesAndPauses(
  sourceUrl: string,
  durationSec: number
): Promise<{ scenes: VideoScene[]; pauses: VideoPause[]; activity: AudioActivityBucket[] }> {
  return withTempDir(async (dir) => {
    const input = join(dir, 'input.mp4');
    await writeFile(input, await fetchVideoBuffer(sourceUrl));
    const sceneLog = await ffmpegStderr([
      '-hide_banner',
      '-i',
      input,
      '-vf',
      "select='gt(scene,0.35)',showinfo",
      '-an',
      '-f',
      'null',
      '-',
    ]);
    const silenceLog = await ffmpegStderr([
      '-hide_banner',
      '-i',
      input,
      '-af',
      'silencedetect=noise=-30dB:d=0.45',
      '-f',
      'null',
      '-',
    ]);
    const scenes = parseSceneTimestamps(sceneLog, durationSec);
    const pauses = parseSilenceRanges(silenceLog, durationSec);
    const activity: AudioActivityBucket[] = [];
    const speechWindows = invertPauses(pauses, durationSec);
    for (const w of speechWindows) {
      activity.push({ start: w.start, end: w.end, rms: 0.4 });
    }
    for (const p of pauses) {
      activity.push({ start: p.start, end: p.end, rms: 0.02 });
    }
    activity.sort((a, b) => a.start - b.start);
    return { scenes, pauses, activity };
  });
}

function invertPauses(pauses: VideoPause[], duration: number): VideoPause[] {
  const kept: VideoPause[] = [];
  let cursor = 0;
  for (const p of [...pauses].sort((a, b) => a.start - b.start)) {
    if (p.start > cursor + 0.15) {
      kept.push({ start: cursor, end: p.start, duration: p.start - cursor });
    }
    cursor = Math.max(cursor, p.end);
  }
  if (duration - cursor > 0.15) kept.push({ start: cursor, end: duration, duration: duration - cursor });
  return kept;
}

export async function exportEditedVideo(
  sourceUrl: string,
  plan: VideoEditPlan,
  options?: { subtitles?: SubtitleSegment[]; vertical?: boolean; width?: number; height?: number }
): Promise<Buffer> {
  const start = Math.max(0, plan.trimStart);
  const end = Math.max(start + 0.2, plan.trimEnd);
  const duration = end - start;
  const width = options?.width ?? (plan.aspectRatio === '9:16' ? 1080 : options?.vertical ? 1080 : 1280);
  const height = options?.height ?? (plan.aspectRatio === '9:16' ? 1920 : options?.vertical ? 1920 : 720);
  const ranges = keptRanges({ start, end }, plan.removeSegments ?? []);

  return withTempDir(async (dir) => {
    const input = join(dir, 'input.mp4');
    const output = join(dir, 'out.mp4');
    await writeFile(input, await fetchVideoBuffer(sourceUrl));

    const filters: string[] = [];
    if (plan.aspectRatio === '9:16' || plan.aspectRatio === '16:9' || plan.crop.mode === 'manual') {
      filters.push(ffmpegCropScaleFilter(width, height, plan.crop));
    }

    if (ranges.length === 1) {
      const r = ranges[0]!;
      const args = [
        '-y',
        '-ss',
        String(r.start),
        '-i',
        input,
        '-t',
        String(Math.max(0.2, r.end - r.start)),
        '-c:v',
        'libx264',
        '-preset',
        'fast',
        '-crf',
        '23',
        '-c:a',
        'aac',
      ];
      if (filters.length) args.push('-vf', filters.join(','));
      if (plan.volume !== 1) args.push('-af', `volume=${Math.max(0, Math.min(2, plan.volume))}`);
      args.push(output);
      await runFfmpeg(args);
    } else {
      const listPath = join(dir, 'concat.txt');
      const partFiles: string[] = [];
      for (let i = 0; i < ranges.length; i++) {
        const r = ranges[i]!;
        const part = join(dir, `part${i}.mp4`);
        const args = [
          '-y',
          '-ss',
          String(r.start),
          '-i',
          input,
          '-t',
          String(Math.max(0.2, r.end - r.start)),
          '-c:v',
          'libx264',
          '-preset',
          'fast',
          '-crf',
          '23',
          '-c:a',
          'aac',
        ];
        if (filters.length) args.push('-vf', filters.join(','));
        if (plan.volume !== 1) args.push('-af', `volume=${Math.max(0, Math.min(2, plan.volume))}`);
        args.push(part);
        await runFfmpeg(args);
        partFiles.push(part);
      }
      await writeFile(
        listPath,
        partFiles.map((p) => `file '${p.replace(/\\/g, '/')}'`).join('\n')
      );
      await runFfmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', output]);
    }

    if (options?.subtitles?.length && plan.subtitleTrack) {
      const srtPath = join(dir, 'subs.srt');
      await writeFile(srtPath, buildSrtContent(options.subtitles), 'utf8');
      const burned = join(dir, 'burned.mp4');
      const srtEscaped = srtPath.replace(/\\/g, '/').replace(/:/g, '\\:');
      await runFfmpeg([
        '-y',
        '-i',
        output,
        '-vf',
        `subtitles='${srtEscaped}'`,
        '-c:v',
        'libx264',
        '-preset',
        'fast',
        '-crf',
        '23',
        '-c:a',
        'copy',
        burned,
      ]);
      return readFile(burned);
    }
    return readFile(output);
  });
}

export async function createTinyTestVideo(): Promise<Buffer> {
  return withTempDir(async (dir) => {
    const output = join(dir, 'tiny.mp4');
    await runFfmpeg([
      '-y',
      '-f',
      'lavfi',
      '-i',
      'color=c=0x1E40AF:s=320x240:d=2.2',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=880:duration=2.2',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-shortest',
      output,
    ]);
    return readFile(output);
  });
}

export function inferMusicMetadata(prompt: string): { genre: string; bpm: number } {
  const lower = prompt.toLowerCase();
  const genres = [
    ['edm', 'Electronic'],
    ['hip hop', 'Hip-Hop'],
    ['hip-hop', 'Hip-Hop'],
    ['rock', 'Rock'],
    ['lofi', 'Lo-Fi'],
    ['lo-fi', 'Lo-Fi'],
    ['ambient', 'Ambient'],
    ['orchestral', 'Orchestral'],
    ['jazz', 'Jazz'],
    ['metal', 'Metal'],
    ['pop', 'Pop'],
    ['trap', 'Trap'],
    ['synth', 'Synthwave'],
  ] as const;
  const genre = genres.find(([key]) => lower.includes(key))?.[1] ?? 'Electronic';
  const bpm = lower.includes('slow') ? 90 : lower.includes('fast') || lower.includes('energetic') ? 128 : 110;
  return { genre, bpm };
}
