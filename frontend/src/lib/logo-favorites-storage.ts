import {
  LOGO_FAVORITES_MAX,
  sanitizeLogoFavoriteOptions,
  type LogoGenerationOptions,
  type SavedLogoFavorite,
} from '@ucbs/shared';

export const LOGO_FAVORITES_STORAGE_KEY = 'ucbs-logo-favorites';

function readAll(): SavedLogoFavorite[] {
  try {
    const raw = localStorage.getItem(LOGO_FAVORITES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedLogoFavorite[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(items: SavedLogoFavorite[]) {
  localStorage.setItem(LOGO_FAVORITES_STORAGE_KEY, JSON.stringify(items.slice(0, LOGO_FAVORITES_MAX)));
}

export function listLogoFavorites(): SavedLogoFavorite[] {
  return readAll().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function saveLogoFavorite(
  entry: { name: string; options: LogoGenerationOptions; id?: string }
): SavedLogoFavorite {
  const items = readAll();
  const now = new Date().toISOString();
  const existing = entry.id ? items.find((i) => i.id === entry.id) : undefined;
  const saved: SavedLogoFavorite = {
    id: entry.id ?? crypto.randomUUID(),
    name: entry.name.trim().slice(0, 80),
    options: sanitizeLogoFavoriteOptions(entry.options),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  writeAll([saved, ...items.filter((i) => i.id !== saved.id)]);
  return saved;
}

export function deleteLogoFavorite(id: string) {
  writeAll(readAll().filter((i) => i.id !== id));
}

export function renameLogoFavorite(id: string, name: string): SavedLogoFavorite | null {
  const items = readAll();
  const idx = items.findIndex((i) => i.id === id);
  if (idx < 0) return null;
  const updated: SavedLogoFavorite = {
    ...items[idx]!,
    name: name.trim().slice(0, 80),
    updatedAt: new Date().toISOString(),
  };
  items[idx] = updated;
  writeAll(items);
  return updated;
}

export function updateLogoFavoriteOptions(id: string, options: LogoGenerationOptions): SavedLogoFavorite | null {
  const items = readAll();
  const idx = items.findIndex((i) => i.id === id);
  if (idx < 0) return null;
  const updated: SavedLogoFavorite = {
    ...items[idx]!,
    options: sanitizeLogoFavoriteOptions(options),
    updatedAt: new Date().toISOString(),
  };
  items[idx] = updated;
  writeAll(items);
  return updated;
}
