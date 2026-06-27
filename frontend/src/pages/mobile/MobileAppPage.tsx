import { useEffect, useState } from 'react';
import {
  PageHeader,
  Badge,
  Button,
  NeonCard,
  Input,
  StatCard,
} from '@/components/ui';
import {
  Globe,
  Monitor,
  Copy,
  CheckCircle2,
  Smartphone,
  Apple,
  Download,
  Share2,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { usePwaInstall } from '@/hooks/usePwaInstall';
import { applyPwaTheme, isStandaloneDisplay } from '@/lib/pwa-theme';
import { api, ApiError, type MobileAppConfig, type MobileDevice, type MobileAppOverview } from '@/services/api';

export function MobileAppPage() {
  const { user } = useAuth();
  const { canInstall, isInstalled, isIos, install } = usePwaInstall();
  const [config, setConfig] = useState<MobileAppConfig | null>(null);
  const [devices, setDevices] = useState<MobileDevice[]>([]);
  const [stores, setStores] = useState<MobileAppOverview['stores'] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    setStandalone(isStandaloneDisplay());
    api.mobile
      .get()
      .then((res) => {
        setConfig(res.config);
        setDevices(res.devices);
        setStores(res.stores);
        applyPwaTheme(res.config.themeColor, res.config.appName);
      })
      .catch(() => {});
  }, []);

  async function handleSave() {
    if (!config) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.mobile.update({
        appName: config.appName,
        shortName: config.shortName,
        themeColor: config.themeColor,
        splashColor: config.splashColor,
        pwaEnabled: config.pwaEnabled,
        pushEnabled: config.pushEnabled,
        androidEnabled: false,
        iosEnabled: false,
      });
      setConfig(res.config);
      applyPwaTheme(res.config.themeColor, res.config.appName);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Speichern fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister() {
    const res = await api.mobile.registerDevice('pwa', `Browser – ${user?.displayName ?? 'User'}`);
    setDevices((prev) => [res.device, ...prev]);
  }

  async function copyAppUrl() {
    const url = config?.installUrl || window.location.origin;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!config) return null;

  return (
    <div>
      <PageHeader
        title="Web App"
        description="UCBS läuft als reine Web-App im Browser. Optional als PWA auf Desktop oder Handy installieren."
        badge={<Badge variant="brand">PWA</Badge>}
      />

      {error && (
        <div className="ucbs-neon-card ucbs-neon-card-magenta mb-4 p-3 text-sm text-fuchsia-200">
          {error}
        </div>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Plattform" value="Web" icon={<Globe className="h-5 w-5" />} />
        <StatCard
          label="Installation"
          value={standalone || isInstalled ? 'Installiert' : config.pwaEnabled ? 'Bereit' : 'Aus'}
          icon={<Monitor className="h-5 w-5" />}
        />
        <StatCard label="Browser-Sessions" value={devices.length} icon={<Smartphone className="h-5 w-5" />} />
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-[1fr_280px]">
        <NeonCard accent="cyan" title="So nutzt du UCBS">
          <ol className="list-inside list-decimal space-y-2 text-sm text-zinc-300">
            <li>Im Browser öffnen und anmelden — fertig.</li>
            <li>
              <strong className="text-zinc-200">Desktop (Chrome/Edge):</strong> Adressleiste → „App installieren“
            </li>
            <li>
              <strong className="text-zinc-200">iPhone/Android:</strong> Safari/Chrome → „Zum Home-Bildschirm“
            </li>
          </ol>
          <div className="mt-4 flex flex-wrap gap-2">
            {canInstall && (
              <Button size="sm" className="gap-1.5" onClick={() => install()}>
                <Download className="h-3.5 w-3.5" />
                Jetzt installieren
              </Button>
            )}
            {isIos && !isInstalled && (
              <Button size="sm" variant="outline" className="gap-1.5">
                <Share2 className="h-3.5 w-3.5" />
                Safari → Teilen → Home-Bildschirm
              </Button>
            )}
            <Button size="sm" variant="outline" className="gap-1" onClick={copyAppUrl}>
              <Copy className="h-3 w-3" />
              {copied ? 'URL kopiert!' : 'App-URL kopieren'}
            </Button>
            <Button size="sm" variant="outline" onClick={handleRegister}>
              Browser registrieren
            </Button>
          </div>
          <p className="mt-3 text-xs text-zinc-500">{stores?.pwa.note}</p>
        </NeonCard>

        <div
          className="ucbs-neon-card flex flex-col items-center justify-center p-6 text-center"
          style={{ background: `linear-gradient(160deg, ${config.splashColor} 0%, #09090b 70%)` }}
        >
          <div
            className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl shadow-lg"
            style={{ backgroundColor: config.themeColor }}
          >
            <span className="font-display text-lg font-bold text-white">{config.shortName.slice(0, 4)}</span>
          </div>
          <p className="font-display text-sm font-semibold text-zinc-100">{config.appName}</p>
          <p className="mt-1 text-xs text-zinc-500">PWA-Vorschau</p>
          <div
            className="mt-4 h-1.5 w-full max-w-[120px] rounded-full"
            style={{ backgroundColor: config.themeColor }}
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <NeonCard accent="purple" title="Branding (PWA)">
          <div className="space-y-3">
            <Input
              placeholder="App-Name"
              value={config.appName}
              onChange={(e) => setConfig({ ...config, appName: e.target.value })}
            />
            <Input
              placeholder="Kurzname"
              value={config.shortName}
              onChange={(e) => setConfig({ ...config, shortName: e.target.value })}
            />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-zinc-500">Theme-Farbe</label>
                <Input
                  type="color"
                  value={config.themeColor}
                  onChange={(e) => setConfig({ ...config, themeColor: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs text-zinc-500">Splash-Farbe</label>
                <Input
                  type="color"
                  value={config.splashColor}
                  onChange={(e) => setConfig({ ...config, splashColor: e.target.value })}
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={config.pwaEnabled}
                onChange={(e) => setConfig({ ...config, pwaEnabled: e.target.checked })}
              />
              PWA-Installation erlauben
            </label>
            <label className="flex items-center gap-2 text-sm text-zinc-500">
              <input
                type="checkbox"
                checked={config.pushEnabled}
                onChange={(e) => setConfig({ ...config, pushEnabled: e.target.checked })}
                disabled
              />
              Push-Benachrichtigungen (kommt später)
            </label>
            <Button onClick={handleSave} loading={loading}>
              Speichern
            </Button>
          </div>
        </NeonCard>

        <NeonCard accent="magenta" title="Native Apps (später)">
          <p className="mb-4 text-sm text-zinc-500">
            v1.0 ist eine reine Web-App. Google Play und App Store sind für eine spätere Version geplant.
          </p>
          <div className="space-y-3">
            <div className="ucbs-neon-card p-4 opacity-60">
              <p className="flex items-center gap-2 text-sm font-medium text-zinc-200">
                <Smartphone className="h-4 w-4" /> Android
              </p>
              <p className="mt-1 text-xs text-zinc-500">{stores?.android.note}</p>
            </div>
            <div className="ucbs-neon-card p-4 opacity-60">
              <p className="flex items-center gap-2 text-sm font-medium text-zinc-200">
                <Apple className="h-4 w-4" /> iOS
              </p>
              <p className="mt-1 text-xs text-zinc-500">{stores?.ios.note}</p>
            </div>
          </div>
        </NeonCard>
      </div>

      {devices.length > 0 && (
        <NeonCard accent="cyan" className="mt-6" title="Registrierte Browser">
          <div className="space-y-2">
            {devices.map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between rounded-lg border border-zinc-800/80 bg-zinc-900/40 p-3"
              >
                <div>
                  <p className="text-sm text-zinc-200">{d.deviceName}</p>
                  <p className="text-xs text-zinc-500">{new Date(d.lastActiveAt).toLocaleString('de-DE')}</p>
                </div>
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              </div>
            ))}
          </div>
        </NeonCard>
      )}
    </div>
  );
}
