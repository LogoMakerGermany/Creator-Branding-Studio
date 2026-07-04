export const LOGO_SAVED_PROMPTS_KEY = 'ucbs-logo-saved-prompts';
export const LOGO_PROMPT_MAX_LENGTH = 4000;
export const LOGO_SAVED_PROMPTS_MAX = 24;

export interface SavedLogoPrompt {
  id: string;
  name: string;
  prompt: string;
  logoName?: string;
  createdAt: string;
}

function readAll(): SavedLogoPrompt[] {
  try {
    const raw = localStorage.getItem(LOGO_SAVED_PROMPTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedLogoPrompt[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(items: SavedLogoPrompt[]) {
  localStorage.setItem(LOGO_SAVED_PROMPTS_KEY, JSON.stringify(items.slice(0, LOGO_SAVED_PROMPTS_MAX)));
}

export function listSavedLogoPrompts(): SavedLogoPrompt[] {
  return readAll().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function saveLogoPrompt(entry: Omit<SavedLogoPrompt, 'id' | 'createdAt'> & { id?: string }): SavedLogoPrompt {
  const items = readAll();
  const saved: SavedLogoPrompt = {
    id: entry.id ?? crypto.randomUUID(),
    name: entry.name.trim().slice(0, 80),
    prompt: entry.prompt.trim().slice(0, LOGO_PROMPT_MAX_LENGTH),
    logoName: entry.logoName?.trim().slice(0, 80),
    createdAt: new Date().toISOString(),
  };
  writeAll([saved, ...items.filter((i) => i.id !== saved.id)]);
  return saved;
}

export function deleteSavedLogoPrompt(id: string) {
  writeAll(readAll().filter((i) => i.id !== id));
}
