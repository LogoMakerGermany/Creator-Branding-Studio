import { useMemo, useRef, useState } from 'react';
import {
  NEXTER_ACCENT_PRESETS,
  NEXTER_LANGUAGE_LABELS,
  NEXTER_LANGUAGES,
  NEXTER_UI_THEMES,
  NEXTER_PLATFORM_IDS,
  NEXTER_PLATFORM_LABELS,
  NEXTER_CREATION_INTEREST_IDS,
  NEXTER_CREATION_INTEREST_LABELS,
  NEXTER_STYLE_PREFERENCE_IDS,
  NEXTER_STYLE_PREFERENCE_LABELS,
  NEXTER_CREATOR_GOAL_IDS,
  NEXTER_CREATOR_GOAL_LABELS,
  DEFAULT_NEXTER_LANGUAGE,
  DEFAULT_NEXTER_UI_THEME,
  DEFAULT_NEXTER_ACCENT_PRESET,
  DEFAULT_NEXTER_VOICE_CATALOG_ID,
  type NexterPreferences,
  type NexterUiTheme,
  type NexterVoiceCatalogEntry,
} from '@ucbs/shared';
import { Input } from '@/components/ui';
import { api } from '@/services/api';

export type PersonalizationDraft = Pick<
  NexterPreferences,
  | 'language'
  | 'addressAs'
  | 'voiceCatalogId'
  | 'voiceOutputEnabled'
  | 'uiTheme'
  | 'accentPreset'
  | 'customPrimary'
  | 'customAccent'
  | 'platforms'
  | 'creationInterests'
  | 'stylePreferences'
  | 'creatorGoals'
>;

export function emptyPersonalizationDraft(name = ''): PersonalizationDraft {
  return {
    language: DEFAULT_NEXTER_LANGUAGE,
    addressAs: name,
    voiceCatalogId: DEFAULT_NEXTER_VOICE_CATALOG_ID,
    voiceOutputEnabled: true,
    uiTheme: DEFAULT_NEXTER_UI_THEME,
    accentPreset: DEFAULT_NEXTER_ACCENT_PRESET,
    customPrimary: null,
    customAccent: null,
    platforms: [],
    creationInterests: [],
    stylePreferences: [],
    creatorGoals: [],
  };
}

type GenderFilter = 'all' | 'male' | 'female' | 'neutral';

const THEME_LABELS: Record<NexterUiTheme, string> = {
  dark: 'Dunkel',
  light: 'Hell',
  system: 'Wie das Gerät',
};

const GENDER_LABEL: Record<string, string> = {
  female: 'weiblich',
  male: 'männlich',
  neutral: 'neutral',
};

function toggleId<T extends string>(list: T[], id: T): T[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

function ChipSet<T extends string>({
  legend,
  ids,
  labels,
  selected,
  onToggle,
}: {
  legend: string;
  ids: readonly T[];
  labels: Record<T, string>;
  selected: T[];
  onToggle: (id: T) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-zinc-300">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {ids.map((id) => {
          const on = selected.includes(id);
          return (
            <label
              key={id}
              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                on ? 'border-white/40 bg-white/10 text-white' : 'border-white/10 text-zinc-200'
              }`}
            >
              <input type="checkbox" checked={on} onChange={() => onToggle(id)} />
              {labels[id]}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function VoicePicker({
  voices,
  selectedId,
  onSelect,
}: {
  voices: NexterVoiceCatalogEntry[];
  selectedId: string | null;
  onSelect: (catalogId: string) => void;
}) {
  const [gender, setGender] = useState<GenderFilter>('all');
  const [lang, setLang] = useState<'all' | 'de' | 'en'>('all');
  const [query, setQuery] = useState('');
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const languages = useMemo(() => {
    const set = new Set<string>();
    for (const v of voices) {
      for (const code of v.languages ?? (v.language ? [v.language] : [])) set.add(code);
    }
    return [...set].sort();
  }, [voices]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return voices.filter((v) => {
      if (gender !== 'all' && (v.gender ?? 'neutral') !== gender) return false;
      if (lang !== 'all') {
        const codes = v.languages ?? (v.language ? [v.language] : []);
        if (!codes.includes(lang)) return false;
      }
      if (q && !v.label.toLowerCase().includes(q) && !(v.style ?? '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [voices, gender, lang, query]);

  async function playPreview(catalogId: string) {
    try {
      audioRef.current?.pause();
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      const blob = await api.nexter.voicePreview(catalogId);
      const url = URL.createObjectURL(blob);
      objectUrlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;
      setPlayingId(catalogId);
      audio.onended = () => setPlayingId(null);
      await audio.play();
    } catch {
      setPlayingId(null);
    }
  }

  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-zinc-300">Welche Stimme soll ich verwenden?</legend>
      {voices.length === 0 ? (
        <p className="text-sm text-zinc-400">Nexter Standardstimme (kann später in den Einstellungen geändert werden).</p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {(['all', 'male', 'female', 'neutral'] as const).map((g) => (
              <button
                key={g}
                type="button"
                aria-pressed={gender === g}
                onClick={() => setGender(g)}
                className={`min-h-11 rounded-lg border px-3 py-1.5 text-xs ${
                  gender === g ? 'border-white/40 bg-white/10 text-white' : 'border-white/10 text-zinc-300'
                }`}
              >
                {g === 'all' ? 'Alle' : g === 'male' ? 'Männlich' : g === 'female' ? 'Weiblich' : 'Neutral'}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setLang('all')}
              className={`rounded-lg border px-3 py-1.5 text-xs ${
                lang === 'all' ? 'border-white/40 bg-white/10 text-white' : 'border-white/10 text-zinc-300'
              }`}
            >
              Alle Sprachen
            </button>
            {(['de', 'en'] as const)
              .filter((code) => languages.includes(code) || code === 'de')
              .map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setLang(code)}
                  className={`rounded-lg border px-3 py-1.5 text-xs ${
                    lang === code ? 'border-white/40 bg-white/10 text-white' : 'border-white/10 text-zinc-300'
                  }`}
                >
                  {code === 'de' ? 'Deutsch verfügbar' : 'Englisch'}
                </button>
              ))}
          </div>
          <Input
            id="nexter-voice-search"
            label="Suchen"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name oder Stil"
          />
          <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {filtered.map((v) => {
              const checked = (selectedId ?? voices[0]?.catalogId) === v.catalogId;
              return (
                <div
                  key={v.catalogId}
                  className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
                    checked ? 'border-white/40 bg-white/10' : 'border-white/10'
                  }`}
                >
                  <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2 text-zinc-200">
                    <input
                      type="radio"
                      name="nexter-voice"
                      className="mt-1"
                      checked={checked}
                      onChange={() => onSelect(v.catalogId)}
                    />
                    <span className="min-w-0">
                      <span className="block font-medium">{v.label}</span>
                      <span className="mt-0.5 block text-xs text-zinc-400">
                        {v.gender ? GENDER_LABEL[v.gender] ?? v.gender : 'Geschlecht unbekannt'}
                        {v.languages?.length ? ` · ${v.languages.join(', ')}` : v.language ? ` · ${v.language}` : ''}
                        {v.accent ? ` · ${v.accent}` : ''}
                        {v.style ? ` · ${v.style}` : ''}
                      </span>
                      {v.germanAvailable ? (
                        <span className="mt-1 inline-block rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-emerald-200">
                          Deutsch verfügbar
                        </span>
                      ) : null}
                    </span>
                  </label>
                  {v.hasPreview ? (
                    <button
                      type="button"
                      className="shrink-0 rounded-md border border-white/15 px-2 py-1 text-xs text-zinc-200"
                      aria-label="Stimmvorschau"
                      onClick={() => void playPreview(v.catalogId)}
                    >
                      {playingId === v.catalogId ? '…' : 'Stimmvorschau'}
                    </button>
                  ) : null}
                </div>
              );
            })}
            {filtered.length === 0 ? <p className="text-sm text-zinc-500">Keine Stimme passt zu den Filtern.</p> : null}
          </div>
          <p className="text-xs text-zinc-500">
            „Deutsch verfügbar“ bedeutet nur, dass der Anbieter Deutsch als Sprache listet — keine Qualitätsaussage.
          </p>
        </div>
      )}
    </fieldset>
  );
}

export function NexterPersonalizationFields({
  draft,
  onChange,
  voices,
  fields,
}: {
  draft: PersonalizationDraft;
  onChange: (next: PersonalizationDraft) => void;
  voices: NexterVoiceCatalogEntry[];
  fields: Array<
    | 'language'
    | 'address'
    | 'voice'
    | 'design'
    | 'platforms'
    | 'interests'
    | 'styles'
    | 'goals'
  >;
}) {
  return (
    <div className="space-y-5">
      {fields.includes('language') && (
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-zinc-300">Welche Sprache möchtest du verwenden?</legend>
          <div className="flex flex-wrap gap-2">
            {NEXTER_LANGUAGES.map((code) => (
              <label
                key={code}
                className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-zinc-200"
              >
                <input
                  type="radio"
                  name="nexter-language"
                  checked={draft.language === code}
                  onChange={() => onChange({ ...draft, language: code })}
                />
                {NEXTER_LANGUAGE_LABELS[code]}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {fields.includes('address') && (
        <Input
          id="nexter-address-as"
          label="Wie soll ich dich nennen?"
          value={draft.addressAs}
          onChange={(e) => onChange({ ...draft, addressAs: e.target.value })}
          placeholder="z. B. Lars"
        />
      )}

      {fields.includes('voice') && (
        <div className="space-y-3">
          <VoicePicker
            voices={voices}
            selectedId={draft.voiceCatalogId}
            onSelect={(catalogId) => onChange({ ...draft, voiceCatalogId: catalogId })}
          />
          <label htmlFor="nexter-voice-output" className="flex min-h-11 items-center gap-2 text-sm text-zinc-200">
            <input
              id="nexter-voice-output"
              type="checkbox"
              checked={draft.voiceOutputEnabled !== false}
              onChange={(e) => onChange({ ...draft, voiceOutputEnabled: e.target.checked })}
            />
            Nexter-Sprachausgabe aktiv (Textchat bleibt immer verfügbar)
          </label>
        </div>
      )}

      {fields.includes('design') && (
        <div className="space-y-4">
          <p className="text-sm font-medium text-zinc-300">Wie soll dein Creator Studio aussehen?</p>
          <fieldset>
            <legend className="mb-2 text-xs text-zinc-400">Helligkeit</legend>
            <div className="flex flex-wrap gap-2">
              {NEXTER_UI_THEMES.map((theme) => (
                <label
                  key={theme}
                  className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-zinc-200"
                >
                  <input
                    type="radio"
                    name="nexter-theme"
                    checked={draft.uiTheme === theme}
                    onChange={() => onChange({ ...draft, uiTheme: theme })}
                  />
                  {THEME_LABELS[theme]}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-xs text-zinc-400">Farben der App</legend>
            <div className="mb-3 flex flex-wrap gap-2">
              <label className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-zinc-200">
                <input
                  type="radio"
                  name="nexter-color-mode"
                  checked={!draft.customPrimary && !draft.customAccent}
                  onChange={() => onChange({ ...draft, customPrimary: null, customAccent: null })}
                />
                Standarddesign behalten
              </label>
              <label className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-zinc-200">
                <input
                  type="radio"
                  name="nexter-color-mode"
                  checked={Boolean(draft.customPrimary || draft.customAccent)}
                  onChange={() => {
                    const preset =
                      NEXTER_ACCENT_PRESETS[draft.accentPreset] ??
                      NEXTER_ACCENT_PRESETS['nexter-standard'];
                    onChange({
                      ...draft,
                      customPrimary: draft.customPrimary ?? preset.cyan,
                      customAccent: draft.customAccent ?? preset.purple,
                    });
                  }}
                />
                Eigene Farben auswählen
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {Object.values(NEXTER_ACCENT_PRESETS).map((preset) => {
                const on = draft.accentPreset === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => onChange({ ...draft, accentPreset: preset.id })}
                    className={`rounded-xl border p-3 text-left text-sm ${
                      on ? 'border-white/40 bg-white/10' : 'border-white/10 bg-white/5'
                    }`}
                  >
                    <span className="mb-2 flex gap-1" aria-hidden>
                      <span className="h-4 w-4 rounded-full" style={{ background: preset.cyan }} />
                      <span className="h-4 w-4 rounded-full" style={{ background: preset.purple }} />
                      <span className="h-4 w-4 rounded-full" style={{ background: preset.green }} />
                    </span>
                    {preset.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-zinc-500">
              Das ändert nur das Aussehen der App, nicht deine Creator-DNA-Farben für Logos.
            </p>
          </fieldset>
          {(draft.customPrimary || draft.customAccent) && (
          <fieldset>
            <legend className="mb-2 text-xs text-zinc-400">Eigene Farben</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="nexter-custom-primary" className="mb-1 block text-xs text-zinc-400">
                  Hauptfarbe
                </label>
                <input
                  id="nexter-custom-primary"
                  type="color"
                  value={draft.customPrimary ?? '#22d3ee'}
                  onChange={(e) => onChange({ ...draft, customPrimary: e.target.value })}
                  className="h-10 w-full rounded border border-white/10 bg-transparent"
                />
              </div>
              <div>
                <label htmlFor="nexter-custom-accent" className="mb-1 block text-xs text-zinc-400">
                  Akzentfarbe
                </label>
                <input
                  id="nexter-custom-accent"
                  type="color"
                  value={draft.customAccent ?? '#a855f7'}
                  onChange={(e) => onChange({ ...draft, customAccent: e.target.value })}
                  className="h-10 w-full rounded border border-white/10 bg-transparent"
                />
              </div>
            </div>
          </fieldset>
          )}
          <div
            className="rounded-xl border border-white/10 bg-white/5 p-4"
            style={{ borderColor: 'var(--ucbs-accent-cyan, #22d3ee)' }}
          >
            <p className="text-sm font-medium text-white">So könnte dein Nexter aussehen.</p>
            <div className="mt-3 flex gap-2" aria-hidden>
              <span className="h-8 flex-1 rounded-lg" style={{ background: 'var(--ucbs-accent-cyan, #22d3ee)' }} />
              <span className="h-8 flex-1 rounded-lg" style={{ background: 'var(--ucbs-accent-purple, #a855f7)' }} />
              <span className="h-8 flex-1 rounded-lg" style={{ background: 'var(--ucbs-accent-green, #34d399)' }} />
            </div>
            <p className="mt-2 text-xs text-zinc-400">Vorschau — wird erst gespeichert, wenn du bestätigst.</p>
          </div>
        </div>
      )}

      {fields.includes('platforms') && (
        <ChipSet
          legend="Wo bist du hauptsächlich unterwegs?"
          ids={NEXTER_PLATFORM_IDS}
          labels={NEXTER_PLATFORM_LABELS}
          selected={draft.platforms ?? []}
          onToggle={(id) => onChange({ ...draft, platforms: toggleId(draft.platforms, id) })}
        />
      )}
      {fields.includes('interests') && (
        <ChipSet
          legend="Was möchtest du erstellen?"
          ids={NEXTER_CREATION_INTEREST_IDS}
          labels={NEXTER_CREATION_INTEREST_LABELS}
          selected={draft.creationInterests ?? []}
          onToggle={(id) =>
            onChange({ ...draft, creationInterests: toggleId(draft.creationInterests, id) })
          }
        />
      )}
      {fields.includes('styles') && (
        <ChipSet
          legend="Welcher Stil spricht dich an?"
          ids={NEXTER_STYLE_PREFERENCE_IDS}
          labels={NEXTER_STYLE_PREFERENCE_LABELS}
          selected={draft.stylePreferences ?? []}
          onToggle={(id) =>
            onChange({ ...draft, stylePreferences: toggleId(draft.stylePreferences, id) })
          }
        />
      )}
      {fields.includes('goals') && (
        <ChipSet
          legend="Was möchtest du mit deinem Content erreichen?"
          ids={NEXTER_CREATOR_GOAL_IDS}
          labels={NEXTER_CREATOR_GOAL_LABELS}
          selected={draft.creatorGoals ?? []}
          onToggle={(id) => onChange({ ...draft, creatorGoals: toggleId(draft.creatorGoals, id) })}
        />
      )}
    </div>
  );
}
