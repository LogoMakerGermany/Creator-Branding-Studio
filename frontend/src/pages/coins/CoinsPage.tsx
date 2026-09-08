import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { PageHeader, Badge, NeonCard, CardTitle, Button, StatCard } from '@/components/ui';
import { Coins, CreditCard, History, Gift, CheckCircle2, XCircle, Wallet, AlertCircle } from 'lucide-react';
import { NEXTER_STUDIO_PATHS } from '@ucbs/shared';
import { useAuth } from '@/context/AuthContext';
import {
  api,
  ApiError,
  type CoinCatalogItem,
  type CoinPackage,
  type CoinQuoteSummary,
  type CoinTransaction,
  type PlatformStatus,
} from '@/services/api';
import { formatCoins, cn } from '@/lib/utils';

type PaymentMethod = 'stripe' | 'paypal';

const HISTORY_PAGE = 20;

const KIND_LABELS: Record<string, string> = {
  logo: 'Logo',
  banner: 'Banner',
  facecam: 'Facecam',
  overlay: 'Overlay',
  sticker: 'Sticker',
  streamset: 'Streamset',
  mockup: 'Lifestyle-Mockup',
  animation: 'Animation',
  music: 'Musik',
  voice: 'Stimme',
  text: 'Text',
  captions: 'Video-Captions',
};

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function txTypeLabel(tx: CoinTransaction): string {
  if (tx.type === 'bonus' || tx.sourceType === 'welcome') return 'Welcome Bonus';
  if (tx.type === 'refund') return 'Refund';
  if (tx.type === 'purchase') return 'Purchase';
  if (tx.type === 'subscription') return 'Subscription';
  if (tx.type === 'spend') {
    const cat = `${tx.category ?? ''} ${tx.description ?? ''}`.toLowerCase();
    if (cat.includes('streamset')) return 'Streamset';
    if (cat.includes('änderung') || cat.includes('change')) return 'Change Request';
    return 'Generation';
  }
  return tx.type || 'Coins';
}

function txDescription(tx: CoinTransaction): string {
  const raw = (tx.description || tx.reason || txTypeLabel(tx)).trim();
  if (tx.type === 'refund' && !/erstattung/i.test(raw)) {
    return `Erstattung: ${raw}`;
  }
  return raw;
}

function txReference(tx: CoinTransaction): string | null {
  if (tx.jobId) return `Job ${tx.jobId.slice(0, 8)}`;
  if (tx.quoteId) return `Quote ${tx.quoteId.slice(0, 8)}`;
  if (tx.refundOfTransactionId) return `Refund von ${tx.refundOfTransactionId.slice(0, 8)}`;
  return null;
}

function studioPathForKind(kind: string): string {
  if (kind === 'captions') return '/video-studio';
  return NEXTER_STUDIO_PATHS[kind] ?? '/nexter';
}

export function CoinsPage() {
  const { user, refreshUser, isDevMode } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [packages, setPackages] = useState<CoinPackage[]>([]);
  const [transactions, setTransactions] = useState<CoinTransaction[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyOffset, setHistoryOffset] = useState(0);
  const [catalogItems, setCatalogItems] = useState<CoinCatalogItem[]>([]);
  const [freeActions, setFreeActions] = useState<CoinCatalogItem[]>([]);
  const [quotes, setQuotes] = useState<CoinQuoteSummary[]>([]);
  const [platform, setPlatform] = useState<PlatformStatus | null>(null);
  const [serverBalance, setServerBalance] = useState<number | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [quotesLoading, setQuotesLoading] = useState(true);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [quotesError, setQuotesError] = useState<string | null>(null);
  const [quoteActionError, setQuoteActionError] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [loadingPkg, setLoadingPkg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('stripe');
  const [paymentNotice, setPaymentNotice] = useState<string | null>(null);

  const success = searchParams.get('success') === 'true';
  const canceled = searchParams.get('canceled') === 'true';
  const provider = searchParams.get('provider');
  const sessionId = searchParams.get('session_id');
  const paypalToken = searchParams.get('token');

  const loadBalance = useCallback(async () => {
    setBalanceLoading(true);
    setBalanceError(null);
    try {
      const r = await api.coins.balance();
      setServerBalance(r.balance);
      await refreshUser();
    } catch (err) {
      setBalanceError(err instanceof ApiError ? err.message : 'Guthaben konnte nicht geladen werden.');
    } finally {
      setBalanceLoading(false);
    }
  }, [refreshUser]);

  const loadHistory = useCallback(async (offset = 0, append = false) => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const r = await api.coins.transactions({ limit: HISTORY_PAGE, offset });
      setTransactions((prev) => (append ? [...prev, ...r.transactions] : r.transactions));
      setHistoryTotal(r.total);
      setHistoryOffset(r.offset);
    } catch (err) {
      setHistoryError(err instanceof ApiError ? err.message : 'Verlauf konnte nicht geladen werden.');
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const loadCatalog = useCallback(async () => {
    setCatalogLoading(true);
    setCatalogError(null);
    try {
      const r = await api.coins.catalog();
      setCatalogItems(r.catalog.items);
      setFreeActions(r.catalog.freeActions);
    } catch (err) {
      setCatalogError(err instanceof ApiError ? err.message : 'Kostenübersicht konnte nicht geladen werden.');
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  const loadQuotes = useCallback(async () => {
    setQuotesLoading(true);
    setQuotesError(null);
    try {
      const r = await api.coins.quotes();
      setQuotes(r.quotes.filter((q) => q.status === 'pending'));
    } catch (err) {
      setQuotesError(err instanceof ApiError ? err.message : 'Angebote konnten nicht geladen werden.');
    } finally {
      setQuotesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBalance();
    void loadHistory(0, false);
    void loadCatalog();
    void loadQuotes();
    api.status()
      .then((s) => {
        setPlatform(s);
        if (s.paypal.configured) setPaymentMethod('paypal');
        else if (s.stripe.configured) setPaymentMethod('stripe');
      })
      .catch(() => {});
  }, [loadBalance, loadCatalog, loadHistory, loadQuotes]);

  const paymentsKnown = platform != null;
  const paymentsEnabled = platform?.killSwitches?.paymentsEnabled === true;
  const stripeAvailable = platform?.stripe.configured ?? false;
  const paypalAvailable = platform?.paypal.configured ?? false;
  const anyPaymentConfigured = stripeAvailable || paypalAvailable;
  const devPurchaseAllowed = isDevMode && (platform?.features.devCoinPurchase ?? false);

  useEffect(() => {
    if (!paymentsKnown || !paymentsEnabled) return;
    api.coins.packages().then((r) => setPackages(r.packages)).catch(() => {});
  }, [paymentsKnown, paymentsEnabled]);

  useEffect(() => {
    if (!success || !paymentsKnown || !paymentsEnabled) return;

    async function handlePaymentSuccess() {
      try {
        let result: { credited: boolean; duplicate?: boolean; coinsAdded?: number } | null = null;
        if (provider === 'paypal' && paypalToken) {
          result = await api.paypal.verifyOrder(paypalToken);
        } else if (sessionId) {
          result = await api.stripe.verifySession(sessionId);
        } else if (paypalToken) {
          result = await api.paypal.verifyOrder(paypalToken);
        }

        if (result?.credited && result.coinsAdded) {
          setPaymentNotice(`${formatCoins(result.coinsAdded)} Coins gutgeschrieben.`);
        } else if (result?.duplicate) {
          setPaymentNotice('Zahlung bereits verarbeitet — Guthaben ist aktuell.');
        } else {
          setPaymentNotice('Zahlung erfolgreich — Guthaben wird aktualisiert.');
        }
      } catch {
        setPaymentNotice('Zahlung erhalten — Coins werden per Webhook gutgeschrieben.');
      }
      await loadBalance();
      await loadHistory(0, false);
    }

    void handlePaymentSuccess();
  }, [success, sessionId, paypalToken, provider, paymentsKnown, paymentsEnabled, loadBalance, loadHistory]);

  async function handlePurchase(packageId: string, forceDev = false) {
    setLoadingPkg(packageId);
    setError(null);
    try {
      if (!paymentsEnabled) {
        throw new ApiError('Coin-Kauf derzeit nicht verfügbar', 'PAYMENTS_DISABLED', 503);
      }
      if (forceDev || (devPurchaseAllowed && !anyPaymentConfigured)) {
        if (!devPurchaseAllowed) {
          throw new ApiError('Dev-Kauf in Produktion deaktiviert', 'FORBIDDEN', 403);
        }
        const res = await api.stripe.devPurchase(packageId);
        await loadBalance();
        await loadHistory(0, false);
        setPaymentNotice(
          `${formatCoins(res.coinsAdded)} Coins gutgeschrieben. Neues Guthaben: ${formatCoins(res.newBalance)}`
        );
        return;
      }

      if (paymentMethod === 'paypal' && paypalAvailable) {
        const { url } = await api.paypal.checkout(packageId);
        window.location.href = url;
      } else if (stripeAvailable) {
        const { url } = await api.stripe.checkout(packageId);
        window.location.href = url;
      } else if (paypalAvailable) {
        const { url } = await api.paypal.checkout(packageId);
        window.location.href = url;
      } else {
        throw new ApiError('Keine Zahlungsmethode konfiguriert', 'PAYMENT_NOT_CONFIGURED', 503);
      }
    } catch (err) {
      if (
        err instanceof ApiError &&
        (err.code === 'STRIPE_NOT_CONFIGURED' || err.code === 'PAYPAL_NOT_CONFIGURED') &&
        devPurchaseAllowed
      ) {
        await handlePurchase(packageId, true);
        return;
      }
      setError(err instanceof ApiError ? err.message : 'Kauf fehlgeschlagen');
    } finally {
      setLoadingPkg(null);
    }
  }

  async function handleConfirmQuote(quote: CoinQuoteSummary) {
    if (confirmingId) return;
    if (quote.expired || quote.status !== 'pending') {
      setQuoteActionError('Das Angebot ist abgelaufen. Bitte ein neues Angebot im Studio anfragen.');
      return;
    }
    const balance = serverBalance ?? user?.coinBalance;
    if (typeof balance === 'number' && balance < quote.coinCost) {
      setQuoteActionError(
        `Nicht genügend Coins. Dieses Angebot kostet ${formatCoins(quote.coinCost)} Coins. Coin-Kauf derzeit nicht verfügbar.`
      );
      return;
    }
    setConfirmingId(quote.id);
    setQuoteActionError(null);
    try {
      await api.nexter.confirmQuote(quote.id);
      await loadBalance();
      await loadHistory(0, false);
      await loadQuotes();
    } catch (err) {
      const code = err instanceof ApiError ? err.code : '';
      if (code === 'QUOTE_EXPIRED') {
        setQuoteActionError('Das Angebot ist abgelaufen. Bitte ein neues Angebot im Studio anfragen.');
      } else if (code === 'PRICE_CHANGED') {
        setQuoteActionError('Der Preis hat sich geändert. Bitte das Angebot erneut bestätigen.');
      } else if (code === 'INSUFFICIENT_COINS') {
        setQuoteActionError(
          err instanceof ApiError
            ? err.message
            : 'Nicht genügend Coins. Es wurde nichts abgebucht.'
        );
      } else {
        setQuoteActionError(err instanceof ApiError ? err.message : 'Bestätigung fehlgeschlagen.');
      }
      await loadQuotes();
      await loadBalance();
    } finally {
      setConfirmingId(null);
    }
  }

  async function handleCancelQuote(quoteId: string) {
    if (confirmingId) return;
    setConfirmingId(quoteId);
    setQuoteActionError(null);
    try {
      await api.nexter.cancelQuote(quoteId);
      await loadQuotes();
      await loadBalance();
    } catch (err) {
      setQuoteActionError(err instanceof ApiError ? err.message : 'Angebot konnte nicht verworfen werden.');
    } finally {
      setConfirmingId(null);
    }
  }

  function dismissBanner() {
    searchParams.delete('success');
    searchParams.delete('canceled');
    searchParams.delete('session_id');
    searchParams.delete('token');
    searchParams.delete('provider');
    setSearchParams(searchParams);
  }

  const displayBalance = serverBalance ?? (balanceLoading ? null : user?.coinBalance ?? null);
  const spent = transactions.filter((t) => t.amount < 0).reduce((sum, t) => sum + Math.abs(t.amount), 0);
  const bonus = transactions.filter((t) => t.type === 'bonus').reduce((sum, t) => sum + t.amount, 0);
  const hasMoreHistory = transactions.length < historyTotal;

  return (
    <div>
      <PageHeader
        title="Coins"
        description="Dein Coin-Guthaben, Verlauf und die aktuellen Generierungskosten. Kauf ist derzeit nicht live."
      />

      {success && paymentsEnabled && (
        <div className="ucbs-neon-card ucbs-neon-card-cyan mb-6 flex items-center justify-between p-4 text-cyan-200" role="status">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-400" aria-hidden />
            <span>{paymentNotice ?? 'Zahlung erfolgreich! Coins wurden gutgeschrieben.'}</span>
          </div>
          <button type="button" onClick={dismissBanner} className="min-h-11 text-sm underline">
            Schließen
          </button>
        </div>
      )}

      {canceled && paymentsEnabled && (
        <div className="mb-6 flex items-center justify-between rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-amber-200" role="status">
          <div className="flex items-center gap-3">
            <XCircle className="h-5 w-5" aria-hidden />
            <span>Zahlung abgebrochen.</span>
          </div>
          <button type="button" onClick={dismissBanner} className="min-h-11 text-sm underline">
            Schließen
          </button>
        </div>
      )}

      {error && (
        <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-red-300" role="alert">
          {error}
        </div>
      )}

      <NeonCard accent="purple" className="mb-6" title="Zahlungsstatus">
        <p className="text-sm text-zinc-300">
          {paymentsKnown && !paymentsEnabled
            ? 'Coin-Kauf derzeit nicht verfügbar. Stripe und PayPal sind nicht live. Es gibt keine funktionierenden Kaufbuttons.'
            : paymentsEnabled
              ? 'Coin-Kauf ist eingeschaltet. Bestätige Pakete nur, wenn du wirklich zahlen möchtest.'
              : 'Zahlungsstatus wird geladen…'}
        </p>
      </NeonCard>

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Guthaben"
          value={balanceLoading && displayBalance == null ? '…' : formatCoins(displayBalance ?? 0)}
          icon={<Coins className="h-5 w-5" />}
        />
        <StatCard
          label="Ausgegeben (diese Seite)"
          value={historyLoading && transactions.length === 0 ? '…' : formatCoins(spent)}
          icon={<History className="h-5 w-5" />}
        />
        <StatCard
          label="Bonus erhalten (diese Seite)"
          value={historyLoading && transactions.length === 0 ? '…' : formatCoins(bonus)}
          icon={<Gift className="h-5 w-5" />}
        />
      </div>
      {balanceError && (
        <p className="mb-6 text-sm text-red-300" role="alert">
          {balanceError}
        </p>
      )}

      <NeonCard accent="cyan" className="mb-8" title="So funktionieren Coins">
        <ul className="list-disc space-y-2 pl-5 text-sm text-zinc-300">
          <li>Coins sind das Guthaben für kostenpflichtige Generierungen. Quelle ist immer der Server, nicht der Browser.</li>
          <li>Ein Angebot zeigt Aktion, Kosten, aktuellen Bestand, Bestand danach und Ablaufzeit. Öffnen bucht nichts ab.</li>
          <li>Erst explizites Bestätigen startet die Aktion. Abgelaufene Angebote brauchen ein neues Angebot.</li>
          <li>Wenn Coins fehlen, startet kein Job und es gibt keine Abbuchung. Kaufbuttons bleiben in diesem Stand deaktiviert.</li>
          <li>Willkommenscoins werden einmalig beim Konto vergeben — es gibt keinen Button zum erneuten Beanspruchen.</li>
        </ul>
      </NeonCard>

      <NeonCard accent="green" className="mb-8" title="Kostenübersicht">
        {catalogLoading && catalogItems.length === 0 && (
          <p className="text-sm text-zinc-400">Kostenübersicht wird geladen…</p>
        )}
        {catalogError && (
          <p className="mb-3 text-sm text-red-300" role="alert">
            {catalogError}
          </p>
        )}
        {catalogItems.length > 0 && (
          <ul className="divide-y divide-white/5">
            {catalogItems.map((item) => (
              <li key={item.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:justify-between">
                <div>
                  <p className="text-sm text-zinc-200">{item.label}</p>
                  {item.note && <p className="text-xs text-zinc-500">{item.note}</p>}
                  {item.pricing === 'quote' && (
                    <p className="text-xs text-zinc-500">Preis wird vor Generierung berechnet</p>
                  )}
                </div>
                <p className="text-sm font-medium text-zinc-100">
                  {item.pricing === 'quote' && item.coins == null
                    ? 'Quote'
                    : `${formatCoins(item.coins ?? 0)} Coins`}
                </p>
              </li>
            ))}
          </ul>
        )}
        {freeActions.length > 0 && (
          <div className="mt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Kostenlose Aktionen</h3>
            <ul className="mt-2 space-y-1 text-sm text-zinc-400">
              {freeActions.map((item) => (
                <li key={item.id}>
                  {item.label} — {formatCoins(0)} Coins
                </li>
              ))}
            </ul>
          </div>
        )}
      </NeonCard>

      <NeonCard accent="magenta" className="mb-8" title="Offene Angebote">
        <p className="mb-3 text-sm text-zinc-400">
          Angebote kommen aus Studio oder Nexter. Bestätigen startet die kostenpflichtige Aktion. Abbrechen bucht nichts ab.
        </p>
        {quotesLoading && quotes.length === 0 && (
          <p className="text-sm text-zinc-400">Angebote werden geladen…</p>
        )}
        {quotesError && (
          <p className="mb-3 text-sm text-red-300" role="alert">
            {quotesError}
          </p>
        )}
        {quoteActionError && (
          <p className="mb-3 text-sm text-red-300" role="alert">
            {quoteActionError}
          </p>
        )}
        {!quotesLoading && quotes.length === 0 && !quotesError && (
          <p className="text-sm text-zinc-500">Keine offenen Angebote.</p>
        )}
        <ul className="space-y-3">
          {quotes.map((quote) => {
            const after =
              displayBalance == null ? null : displayBalance - quote.coinCost;
            const insufficient = displayBalance != null && displayBalance < quote.coinCost;
            const expired = quote.expired;
            return (
              <li key={quote.id} className="rounded-xl border border-white/10 bg-black/20 p-4">
                <p className="text-sm font-medium text-zinc-100">
                  {KIND_LABELS[quote.kind] ?? quote.kind}
                </p>
                <dl className="mt-2 grid gap-1 text-sm text-zinc-400 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-zinc-500">Kosten</dt>
                    <dd className="text-zinc-200">{formatCoins(quote.coinCost)} Coins</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-zinc-500">Aktueller Bestand</dt>
                    <dd className="text-zinc-200">
                      {displayBalance == null ? '…' : `${formatCoins(displayBalance)} Coins`}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-zinc-500">Bestand danach</dt>
                    <dd className="text-zinc-200">
                      {after == null ? '…' : `${formatCoins(Math.max(0, after))} Coins`}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-zinc-500">Ablauf</dt>
                    <dd className="text-zinc-200">{formatDateTime(quote.expiresAt)}</dd>
                  </div>
                </dl>
                {expired && (
                  <p className="mt-2 text-sm text-amber-200" role="status">
                    Angebot abgelaufen — bitte neu anfragen.
                  </p>
                )}
                {insufficient && !expired && (
                  <p className="mt-2 text-sm text-amber-200" role="status">
                    Nicht genügend Coins. Coin-Kauf derzeit nicht verfügbar.
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    className="min-h-11"
                    disabled={Boolean(confirmingId) || expired || insufficient}
                    loading={confirmingId === quote.id}
                    onClick={() => void handleConfirmQuote(quote)}
                  >
                    Bestätigen
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="min-h-11"
                    disabled={Boolean(confirmingId)}
                    onClick={() => void handleCancelQuote(quote.id)}
                  >
                    Abbrechen
                  </Button>
                  <Link
                    to={studioPathForKind(quote.kind)}
                    className="inline-flex min-h-11 items-center text-sm text-[var(--ucbs-accent-cyan)] hover:underline"
                  >
                    Im Studio öffnen
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      </NeonCard>

      {paymentsEnabled ? (
        <>
          {(stripeAvailable || paypalAvailable) && (
            <div className="mb-6 flex flex-wrap gap-2">
              {stripeAvailable && (
                <button
                  type="button"
                  onClick={() => setPaymentMethod('stripe')}
                  className={cn(
                    'flex min-h-11 items-center gap-2 rounded-full border px-4 py-2 text-sm transition-colors',
                    paymentMethod === 'stripe'
                      ? 'border-brand-500 bg-brand-500/20 text-brand-200'
                      : 'border-zinc-700 text-zinc-400 hover:border-zinc-600'
                  )}
                >
                  <CreditCard className="h-4 w-4" aria-hidden />
                  Stripe
                </button>
              )}
              {paypalAvailable && (
                <button
                  type="button"
                  onClick={() => setPaymentMethod('paypal')}
                  className={cn(
                    'flex min-h-11 items-center gap-2 rounded-full border px-4 py-2 text-sm transition-colors',
                    paymentMethod === 'paypal'
                      ? 'border-cyan-500 bg-cyan-500/20 text-cyan-200'
                      : 'border-zinc-700 text-zinc-400 hover:border-zinc-600'
                  )}
                >
                  <Wallet className="h-4 w-4" aria-hidden />
                  PayPal
                </button>
              )}
            </div>
          )}
          <div className="mb-8 grid gap-4 sm:grid-cols-3">
            {packages.map((pkg, i) => (
              <NeonCard
                key={pkg.id}
                accent={(['purple', 'cyan', 'magenta'] as const)[i % 3]}
                className={pkg.isPopular ? 'ring-1 ring-brand-500/40' : ''}
              >
                {pkg.isPopular && <Badge variant="brand" className="mb-3">Beliebt</Badge>}
                <CardTitle>{pkg.name}</CardTitle>
                <p className="mt-2 font-display text-3xl font-bold text-zinc-100">
                  {pkg.coins}
                  {pkg.bonusCoins > 0 && (
                    <span className="text-sm font-normal text-emerald-400"> +{pkg.bonusCoins} Bonus</span>
                  )}
                </p>
                <p className="text-sm text-zinc-400">Coins</p>
                <p className="mt-4 text-xl font-semibold text-zinc-200">
                  {(pkg.priceCents / 100).toFixed(2).replace('.', ',')} €
                </p>
                <Button
                  className="mt-4 min-h-11 w-full gap-2"
                  variant={pkg.isPopular ? 'primary' : 'secondary'}
                  loading={loadingPkg === pkg.id}
                  onClick={() => void handlePurchase(pkg.id)}
                >
                  {paymentMethod === 'paypal' && paypalAvailable ? (
                    <Wallet className="h-4 w-4" aria-hidden />
                  ) : (
                    <CreditCard className="h-4 w-4" aria-hidden />
                  )}
                  Mit {paymentMethod === 'paypal' && paypalAvailable ? 'PayPal' : 'Stripe'} kaufen
                </Button>
              </NeonCard>
            ))}
          </div>
        </>
      ) : (
        <div className="mb-8 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-100" role="status">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
            <p className="text-sm">Coin-Kauf derzeit nicht verfügbar. Es gibt keine Checkout-Seite und keine Kaufbuttons.</p>
          </div>
        </div>
      )}

      <NeonCard accent="purple" title="Transaktionshistorie">
        {historyError && (
          <p className="mb-3 text-sm text-red-300" role="alert">
            {historyError}
          </p>
        )}
        {historyLoading && transactions.length === 0 && (
          <p className="text-sm text-zinc-400">Verlauf wird geladen…</p>
        )}
        {!historyLoading && transactions.length === 0 && !historyError && (
          <p className="text-sm text-zinc-500">Noch keine Coin-Bewegungen.</p>
        )}
        {transactions.length > 0 && (
          <ul className="space-y-2">
            {transactions.map((tx) => {
              const credit = tx.amount >= 0;
              return (
                <li
                  key={tx.id}
                  className="flex flex-col gap-2 rounded-lg border border-zinc-800/80 bg-surface-950/50 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="text-zinc-300">{txDescription(tx)}</p>
                    <p className="text-xs text-zinc-500">
                      {txTypeLabel(tx)} · {formatDateTime(tx.createdAt)}
                      {txReference(tx) ? ` · ${txReference(tx)}` : ''}
                    </p>
                  </div>
                  <p className={credit ? 'shrink-0 font-medium text-emerald-400' : 'shrink-0 font-medium text-red-400'}>
                    <span className="sr-only">{credit ? 'Gutschrift' : 'Abbuchung'} </span>
                    {credit ? '+' : '−'}
                    {formatCoins(Math.abs(tx.amount))} Coins
                  </p>
                </li>
              );
            })}
          </ul>
        )}
        {hasMoreHistory && (
          <Button
            type="button"
            variant="secondary"
            className="mt-4 min-h-11"
            loading={historyLoading}
            onClick={() => void loadHistory(historyOffset + HISTORY_PAGE, true)}
          >
            Weitere laden
          </Button>
        )}
      </NeonCard>
    </div>
  );
}
