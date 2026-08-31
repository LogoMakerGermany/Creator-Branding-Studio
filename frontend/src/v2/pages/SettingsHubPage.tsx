import { useState } from 'react';
import { HubPageLayout } from '@/v2/components/HubPageLayout';
import { SETTINGS_LINKS } from '@/v2/config/navigation';
import { Button, Input } from '@/components/ui';
import { api, ApiError } from '@/services/api';
import { useLocation } from 'react-router-dom';
import { Link } from 'react-router-dom';

function AccountDataSection() {
  const [confirm, setConfirm] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  async function exportData() {
    try {
      const res = await api.auth.exportData();
      const blob = new Blob([JSON.stringify(res.export, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'nexter-export.json';
      a.click();
      URL.revokeObjectURL(url);
      setStatus('Export heruntergeladen (ohne Secrets, nur eigene Daten).');
    } catch (err) {
      setStatus(err instanceof ApiError ? err.message : 'Export fehlgeschlagen');
    }
  }

  async function deleteAccount() {
    try {
      await api.auth.deleteAccount(confirm);
      setStatus('Konto deaktiviert und anonymisiert. Finanz-/Auditdaten bleiben technisch erhalten.');
    } catch (err) {
      setStatus(err instanceof ApiError ? err.message : 'Löschen fehlgeschlagen');
    }
  }

  return (
    <div className="mt-8 space-y-3 border-t border-white/10 pt-6">
      <h3 className="font-semibold text-white">Daten & Konto</h3>
      <p className="text-xs text-zinc-500">
        localStorage speichert u. a. auth_token. sessionStorage speichert Invite/Auth-Fehler. Firebase Auth
        hält die Sitzung. Kein Marketing-Tracking im aktuellen Stand.
      </p>
      <Button variant="ghost" onClick={() => void exportData()}>
        Eigene Daten exportieren (JSON)
      </Button>
      <p className="text-xs text-zinc-500">Löschung: gib DELETE_ACCOUNT ein. Kein Ein-Klick.</p>
      <Input label="Bestätigung" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="DELETE_ACCOUNT" />
      <Button disabled={confirm !== 'DELETE_ACCOUNT'} onClick={() => void deleteAccount()}>
        Konto löschen
      </Button>
      {status && <p className="text-sm text-zinc-400">{status}</p>}
    </div>
  );
}

export function SettingsHubPage() {
  const location = useLocation();
  const [message, setMessage] = useState('');
  const [category, setCategory] = useState('suggestion');
  const [screenshot, setScreenshot] = useState<string | undefined>();
  const [status, setStatus] = useState<string | null>(null);

  async function sendFeedback() {
    if (!message.trim()) return;
    try {
      await api.feedback.submit({
        module: location.pathname,
        route: location.pathname,
        message: message.trim(),
        category,
        screenshotDataUrl: screenshot,
      });
      setMessage('');
      setScreenshot(undefined);
      setStatus('Danke — Feedback ist bei Admin angekommen.');
    } catch (err) {
      setStatus(err instanceof ApiError ? err.message : 'Senden fehlgeschlagen');
    }
  }

  return (
    <div className="space-y-8">
      <HubPageLayout
        title="Einstellungen"
        description="Creator DNA, Coins und Tester-Feedback."
        modules={SETTINGS_LINKS}
      />
      <div id="feedback" className="rounded-2xl border border-white/10 p-6">
        <h2 className="font-semibold text-white">Feedback senden</h2>
        <p className="mt-1 text-sm text-zinc-400">Kategorie, Beschreibung, optionales Bild. Modul = aktuelle Seite.</p>
        <label htmlFor="fb-cat" className="mt-3 block text-xs text-zinc-400">
          Kategorie
        </label>
        <select
          id="fb-cat"
          className="mt-1 w-full rounded-lg border border-zinc-700 bg-surface-900 px-3 py-2 text-sm text-white"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          {['bug', 'usability', 'generation', 'payment', 'suggestion', 'other'].map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <Input
          className="mt-3"
          label="Beschreibung"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Was ist passiert?"
        />
        <label htmlFor="fb-shot" className="mt-3 block text-xs text-zinc-400">
          Screenshot (optional)
        </label>
        <input
          id="fb-shot"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="mt-1 text-sm text-zinc-400"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) {
              setScreenshot(undefined);
              return;
            }
            if (file.size > 1_400_000) {
              setStatus('Screenshot ist zu groß (max. ca. 1,4 MB).');
              setScreenshot(undefined);
              return;
            }
            const reader = new FileReader();
            reader.onload = () => setScreenshot(String(reader.result || ''));
            reader.readAsDataURL(file);
          }}
        />
        <Button className="mt-3" data-testid="feedback-send" onClick={() => void sendFeedback()}>
          Feedback senden
        </Button>
        {status && <p className="mt-2 text-sm text-zinc-400">{status}</p>}
        <div className="mt-6 flex flex-wrap gap-4 text-sm text-violet-300">
          <Link to="/legal/impressum">Impressum</Link>
          <Link to="/legal/datenschutz">Datenschutz</Link>
          <Link to="/legal/agb">AGB</Link>
          <Link to="/legal/widerruf">Widerruf</Link>
          <Link to="/legal/cookies">Speicher</Link>
        </div>
        <AccountDataSection />
      </div>
    </div>
  );
}
