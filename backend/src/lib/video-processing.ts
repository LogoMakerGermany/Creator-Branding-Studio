import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegPath from 'ffmpeg-static';
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
      else reject(new Error(stderr.slice(-500) || `ffmpeg exit ${code}`));
    });
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
  options?: { vertical?: boolean }
): Promise<Buffer> {
  const duration = Math.max(1, end - start);
  return withTempDir(async (dir) => {
    const input = join(dir, 'input.mp4');
    const output = join(dir, 'clip.mp4');
    await writeFile(input, await fetchVideoBuffer(sourceUrl));

    const vf = options?.vertical
      ? 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920'
      : undefined;

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
