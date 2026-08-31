/**
 * Minimal ZIP writer/reader (store + deflate).
 * Compatible with UCBS project export archives.
 */

import { inflateRawSync } from 'node:zlib';

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  name: string;
  data: Buffer;
}

export function buildZipArchive(entries: ZipEntry[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const data = entry.data;
    const crc = crc32(data);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8); // store
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(data.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, nameBuf, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);

    centralParts.push(central, nameBuf);
    offset += localHeader.length + nameBuf.length + data.length;
  }

  const centralDir = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDir.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDir, end]);
}

function decodeZipName(buf: Buffer): string {
  return buf.toString('utf8').replace(/\\/g, '/');
}

/**
 * Parse a ZIP buffer into entries. Supports store (0) and deflate (8).
 * Skips directories.
 */
export function parseZipArchive(buffer: Buffer): ZipEntry[] {
  if (buffer.length < 22) {
    throw new Error('ZIP-Datei ist ungültig oder leer');
  }

  let endOffset = -1;
  for (let i = buffer.length - 22; i >= 0; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      endOffset = i;
      break;
    }
  }
  if (endOffset < 0) {
    throw new Error('ZIP-Endverzeichnis nicht gefunden');
  }

  const totalEntries = buffer.readUInt16LE(endOffset + 10);
  const centralSize = buffer.readUInt32LE(endOffset + 12);
  const centralOffset = buffer.readUInt32LE(endOffset + 16);

  if (centralOffset + centralSize > buffer.length) {
    throw new Error('ZIP-Zentralverzeichnis ist beschädigt');
  }

  const entries: ZipEntry[] = [];
  let cursor = centralOffset;

  for (let i = 0; i < totalEntries; i++) {
    if (cursor + 46 > buffer.length || buffer.readUInt32LE(cursor) !== 0x02014b50) {
      throw new Error('ZIP-Eintrag im Zentralverzeichnis ungültig');
    }

    const compression = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLen = buffer.readUInt16LE(cursor + 28);
    const extraLen = buffer.readUInt16LE(cursor + 30);
    const commentLen = buffer.readUInt16LE(cursor + 32);
    const localHeaderOffset = buffer.readUInt32LE(cursor + 42);
    const name = decodeZipName(buffer.subarray(cursor + 46, cursor + 46 + nameLen));

    cursor += 46 + nameLen + extraLen + commentLen;

    if (!name || name.endsWith('/')) continue;

    if (localHeaderOffset + 30 > buffer.length || buffer.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
      throw new Error(`ZIP-Lokaler Header fehlt: ${name}`);
    }

    const localNameLen = buffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLen = buffer.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);

    let data: Buffer;
    if (compression === 0) {
      data = Buffer.from(compressed);
    } else if (compression === 8) {
      try {
        data = inflateRawSync(compressed);
      } catch {
        throw new Error(`ZIP-Eintrag konnte nicht entpackt werden: ${name}`);
      }
    } else {
      throw new Error(`Nicht unterstützte ZIP-Kompression (${compression}) in ${name}`);
    }

    if (uncompressedSize > 0 && data.length !== uncompressedSize) {
      throw new Error(`ZIP-Größe stimmt nicht: ${name}`);
    }

    entries.push({ name, data });
  }

  return entries;
}

export function getZipEntry(entries: ZipEntry[], path: string): ZipEntry | undefined {
  const normalized = path.replace(/\\/g, '/');
  return entries.find((e) => e.name === normalized || e.name.endsWith(`/${normalized}`));
}

export function listZipEntries(entries: ZipEntry[], prefix: string): ZipEntry[] {
  const p = prefix.replace(/\\/g, '/').replace(/\/?$/, '/');
  return entries.filter((e) => e.name.startsWith(p) && !e.name.endsWith('/'));
}

/** Safe ZIP entry basename — no path traversal, no absolute paths. */
export function sanitizeZipEntryName(name: string, fallback = 'file'): string {
  const noSlash = String(name || '').replace(/\\/g, '/');
  const parts = noSlash.split('/').filter((p) => p && p !== '.' && p !== '..');
  const base = parts.pop() || fallback;
  const cleaned = base.replace(/[^\w.\-]+/g, '_').replace(/^\.+/g, '') || fallback;
  return cleaned.slice(0, 80);
}

export function zipEntryPath(folder: string, fileName: string): string {
  const f = String(folder || 'files').replace(/[^a-z0-9_-]/gi, '') || 'files';
  return `${f}/${sanitizeZipEntryName(fileName)}`;
}
