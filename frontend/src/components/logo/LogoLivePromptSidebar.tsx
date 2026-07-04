import { useEffect, useMemo, useState } from 'react';
import { Copy, Eye, Pencil, Save, Trash2, FileText, Check } from 'lucide-react';
import { GlassCard } from '@/v2/components/GlassCard';
import { StudioOptionPill } from '@/v2/components/StudioOptionPill';
import {
  deleteSavedLogoPrompt,
  listSavedLogoPrompts,
  LOGO_PROMPT_MAX_LENGTH,
  saveLogoPrompt,
  type SavedLogoPrompt,
} from '@/lib/logo-prompt-storage';

type PromptVariantTab = 'a' | 'b';

type LogoLivePromptSidebarProps = {
  variantA: string;
  variantB: string;
  formValid: boolean;
  logoName?: string;
  editPrompt: boolean;
  promptDraft: string;
  onEditPromptChange: (edit: boolean) => void;
  onPromptDraftChange: (draft: string) => void;
  onApplyPrompt?: (prompt: string) => void;
};

export function LogoLivePromptSidebar({
  variantA,
  variantB,
  formValid,
  logoName,
  editPrompt,
  promptDraft,
  onEditPromptChange,
  onPromptDraftChange,
  onApplyPrompt,
}: LogoLivePromptSidebarProps) {
  const [tab, setTab] = useState<PromptVariantTab>('a');
  const [saved, setSaved] = useState<SavedLogoPrompt[]>([]);
  const [copyOk, setCopyOk] = useState(false);
  const [saveOk, setSaveOk] = useState(false);
  const [showSaved, setShowSaved] = useState(false);

  useEffect(() => {
    setSaved(listSavedLogoPrompts());
  }, []);

  const displayPrompt = useMemo(() => {
    if (editPrompt) return promptDraft;
    return tab === 'a' ? variantA : variantB;
  }, [editPrompt, promptDraft, tab, variantA, variantB]);

  async function handleCopy() {
    const text = displayPrompt.trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopyOk(true);
      window.setTimeout(() => setCopyOk(false), 1800);
    } catch {
      /* clipboard blocked */
    }
  }

  function handleSave() {
    const prompt = (editPrompt ? promptDraft : variantA).trim();
    if (!prompt) return;
    const defaultName = logoName?.trim()
      ? `${logoName.trim()} · ${new Date().toLocaleDateString('de-DE')}`
      : `Prompt · ${new Date().toLocaleString('de-DE')}`;
    const name = window.prompt('Name für gespeicherten Prompt:', defaultName);
    if (!name?.trim()) return;
    saveLogoPrompt({ name, prompt, logoName: logoName?.trim() });
    setSaved(listSavedLogoPrompts());
    setSaveOk(true);
    window.setTimeout(() => setSaveOk(false), 1800);
  }

  function handleLoad(item: SavedLogoPrompt) {
    onPromptDraftChange(item.prompt);
    onEditPromptChange(true);
    onApplyPrompt?.(item.prompt);
    setTab('a');
  }

  function handleDelete(id: string) {
    deleteSavedLogoPrompt(id);
    setSaved(listSavedLogoPrompts());
  }

  function toggleEditMode() {
    if (editPrompt) {
      onEditPromptChange(false);
      onApplyPrompt?.('');
      return;
    }
    onPromptDraftChange(variantA);
    onEditPromptChange(true);
    setTab('a');
  }

  function handleApply() {
    const trimmed = promptDraft.trim();
    if (!trimmed) return;
    onApplyPrompt?.(trimmed);
    onEditPromptChange(true);
  }

  return (
    <GlassCard accent="cyan" hover={false} className="flex h-full flex-col !p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ucbs-accent-cyan)]">
            Schritt 12 · Live-Prompt
          </p>
          <p className="mt-1 text-[10px] text-zinc-500">
            MAGIK-Prompt live ansehen, bearbeiten, kopieren und speichern.
          </p>
        </div>
        <span className="font-mono text-[9px] text-zinc-600">
          {displayPrompt.length}/{LOGO_PROMPT_MAX_LENGTH}
        </span>
      </div>

      {!editPrompt && (
        <div className="mb-2 flex gap-1">
          <StudioOptionPill active={tab === 'a'} onClick={() => setTab('a')} className="flex-1 text-[10px]">
            Variante A · Name
          </StudioOptionPill>
          <StudioOptionPill active={tab === 'b'} onClick={() => setTab('b')} className="flex-1 text-[10px]">
            Variante B · Design
          </StudioOptionPill>
        </div>
      )}

      {editPrompt && (
        <p className="mb-2 rounded-md border border-amber-500/20 bg-amber-500/5 px-2 py-1 text-[9px] text-amber-200/90">
          Bearbeitungsmodus — dein Text wird als Prompt-Override für A + B verwendet.
        </p>
      )}

      <textarea
        readOnly={!editPrompt}
        value={displayPrompt}
        onChange={(e) => onPromptDraftChange(e.target.value.slice(0, LOGO_PROMPT_MAX_LENGTH))}
        className="min-h-[180px] flex-1 resize-y rounded-lg border border-white/10 bg-[var(--ucbs-bg)] p-2.5 text-[10px] leading-relaxed text-zinc-300 outline-none focus:border-[var(--ucbs-accent-cyan)]/40"
        placeholder={formValid ? 'Prompt wird berechnet…' : 'Bitte Pflichtfelder ausfüllen…'}
        spellCheck={false}
      />

      {!formValid && (
        <p className="mt-2 text-[9px] text-amber-400/90">Prompt-Vorschau nach vollständiger Eingabe verfügbar.</p>
      )}

      <div className="mt-3 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={toggleEditMode}
          className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-[10px] text-zinc-300 hover:border-white/20 hover:text-white"
        >
          {editPrompt ? <Eye className="h-3 w-3" /> : <Pencil className="h-3 w-3" />}
          {editPrompt ? 'Auto' : 'Bearbeiten'}
        </button>
        <button
          type="button"
          onClick={handleCopy}
          disabled={!displayPrompt.trim()}
          className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-[10px] text-zinc-300 hover:border-white/20 hover:text-white disabled:opacity-40"
        >
          {copyOk ? <Check className="h-3 w-3 text-[var(--ucbs-accent-green)]" /> : <Copy className="h-3 w-3" />}
          {copyOk ? 'Kopiert' : 'Kopieren'}
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!displayPrompt.trim()}
          className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1.5 text-[10px] text-zinc-300 hover:border-white/20 hover:text-white disabled:opacity-40"
        >
          {saveOk ? <Check className="h-3 w-3 text-[var(--ucbs-accent-green)]" /> : <Save className="h-3 w-3" />}
          {saveOk ? 'Gespeichert' : 'Speichern'}
        </button>
        {editPrompt && (
          <button
            type="button"
            onClick={handleApply}
            disabled={!promptDraft.trim()}
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--ucbs-accent-cyan)]/30 bg-[var(--ucbs-accent-cyan)]/10 px-2.5 py-1.5 text-[10px] text-[var(--ucbs-accent-cyan)] hover:bg-[var(--ucbs-accent-cyan)]/15 disabled:opacity-40"
          >
            Übernehmen
          </button>
        )}
      </div>

      <div className="mt-3 border-t border-white/5 pt-3">
        <button
          type="button"
          onClick={() => setShowSaved((v) => !v)}
          className="flex w-full items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-zinc-500 hover:text-zinc-300"
        >
          <span className="inline-flex items-center gap-1.5">
            <FileText className="h-3 w-3" />
            Gespeicherte Prompts ({saved.length})
          </span>
          <span>{showSaved ? '−' : '+'}</span>
        </button>

        {showSaved && (
          <div className="mt-2 max-h-36 space-y-1.5 overflow-y-auto">
            {saved.length === 0 ? (
              <p className="text-[10px] text-zinc-600">Noch keine Prompts gespeichert.</p>
            ) : (
              saved.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start gap-2 rounded-lg border border-white/5 bg-white/[0.02] p-2"
                >
                  <button
                    type="button"
                    onClick={() => handleLoad(item)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="truncate text-[10px] font-medium text-zinc-300">{item.name}</p>
                    <p className="mt-0.5 line-clamp-2 text-[9px] text-zinc-600">{item.prompt}</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(item.id)}
                    className="shrink-0 text-zinc-600 hover:text-red-400"
                    aria-label={`${item.name} löschen`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </GlassCard>
  );
}
