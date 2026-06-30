import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/ui';
import { MagikAssistantSettingsPanel } from '@/components/magik';
import { api, ApiError } from '@/services/api';
import type { MagikAiSettings } from '@/types/magik';
import { DEFAULT_MAGIK_AI_SETTINGS } from '@/types/magik';

export function MagikAssistantSettingsPage() {
  const [settings, setSettings] = useState<MagikAiSettings>(DEFAULT_MAGIK_AI_SETTINGS);
  const [locked, setLocked] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.magikAi
      .getSettings()
      .then((res) => {
        setSettings(res.settings);
        setLocked(res.locked);
      })
      .catch(() => {});
  }, []);

  async function save(patch: Partial<MagikAiSettings>) {
    setError(null);
    try {
      const res = await api.magikAi.updateSettings(patch);
      setSettings(res.settings);
      setLocked(res.locked);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Speichern fehlgeschlagen');
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="MAGIK AI Assistant"
        description="Einstellungen für den zukünftigen persönlichen Logo-Begleiter."
      />
      {error && <p className="text-sm text-red-400">{error}</p>}
      <MagikAssistantSettingsPanel
        settings={settings}
        locked={locked}
        onPersonalityChange={(personalityId) => save({ personalityId })}
        onLanguageChange={(language) => save({ language })}
      />
    </div>
  );
}
