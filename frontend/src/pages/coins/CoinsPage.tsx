import { useEffect, useState } from 'react';

import { useSearchParams } from 'react-router-dom';

import { PageHeader, Badge, NeonCard, CardTitle, Button, StatCard } from '@/components/ui';

import { Coins, CreditCard, History, Gift, CheckCircle2, XCircle, Wallet } from 'lucide-react';

import { useAuth } from '@/context/AuthContext';

import { api, ApiError, type CoinPackage, type CoinTransaction, type PlatformStatus } from '@/services/api';

import { formatCoins, formatDate } from '@/lib/utils';

import { cn } from '@/lib/utils';



type PaymentMethod = 'stripe' | 'paypal';



export function CoinsPage() {

  const { user, refreshUser, isDevMode } = useAuth();

  const [searchParams, setSearchParams] = useSearchParams();

  const [packages, setPackages] = useState<CoinPackage[]>([]);

  const [transactions, setTransactions] = useState<CoinTransaction[]>([]);

  const [platform, setPlatform] = useState<PlatformStatus | null>(null);

  const [loadingPkg, setLoadingPkg] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('stripe');
  const [paymentNotice, setPaymentNotice] = useState<string | null>(null);

  const success = searchParams.get('success') === 'true';

  const canceled = searchParams.get('canceled') === 'true';

  const provider = searchParams.get('provider');

  const sessionId = searchParams.get('session_id');

  const paypalToken = searchParams.get('token');



  useEffect(() => {

    api.coins.packages().then((r) => setPackages(r.packages));

    api.status().then((s) => {

      setPlatform(s);

      if (s.paypal.configured) setPaymentMethod('paypal');

      else if (s.stripe.configured) setPaymentMethod('stripe');

    }).catch(() => {});

    loadTransactions();

  }, []);



  useEffect(() => {

    if (!success) return;



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
      await refreshUser();
      await loadTransactions();
    }



    handlePaymentSuccess();

  }, [success, sessionId, paypalToken, provider, refreshUser]);



  async function loadTransactions() {

    try {

      const r = await api.coins.transactions();

      setTransactions(r.transactions);

    } catch {

      /* ignore */

    }

  }



  const stripeAvailable = platform?.stripe.configured ?? false;

  const paypalAvailable = platform?.paypal.configured ?? false;

  const anyPaymentConfigured = stripeAvailable || paypalAvailable;



  const devPurchaseAllowed = isDevMode && (platform?.features.devCoinPurchase ?? false);

  async function handlePurchase(packageId: string, forceDev = false) {

    setLoadingPkg(packageId);

    setError(null);

    try {

      if (forceDev || (devPurchaseAllowed && !anyPaymentConfigured)) {
        if (!devPurchaseAllowed) {
          throw new ApiError('Dev-Kauf in Produktion deaktiviert', 'FORBIDDEN', 403);
        }

        const res = await api.stripe.devPurchase(packageId);

        await refreshUser();

        await loadTransactions();

        alert(`${formatCoins(res.coinsAdded)} Coins gutgeschrieben! Neues Guthaben: ${formatCoins(res.newBalance)}`);

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



  function dismissBanner() {

    searchParams.delete('success');

    searchParams.delete('canceled');

    searchParams.delete('session_id');

    searchParams.delete('token');

    searchParams.delete('provider');

    setSearchParams(searchParams);

  }



  const spent = transactions

    .filter((t) => t.amount < 0)

    .reduce((sum, t) => sum + Math.abs(t.amount), 0);



  const bonus = transactions

    .filter((t) => t.type === 'bonus')

    .reduce((sum, t) => sum + t.amount, 0);



  return (

    <div>

      <PageHeader

        title="Coin System"

        description="Coins für Bilder, Videos, Musik und Stimmen. Bezahle mit Stripe oder PayPal."

        badge={

          <div className="flex gap-2">

            {stripeAvailable && (

              <Badge variant={platform?.stripe.mode === 'live' ? 'brand' : 'default'}>

                Stripe {platform?.stripe.mode === 'live' ? 'Live' : 'Test'}

              </Badge>

            )}

            {paypalAvailable && (

              <Badge variant={platform?.paypal.mode === 'live' ? 'brand' : 'default'}>

                PayPal {platform?.paypal.mode === 'live' ? 'Live' : 'Sandbox'}

              </Badge>

            )}

            {!anyPaymentConfigured && isDevMode && <Badge variant="phase">Dev</Badge>}

          </div>

        }

      />



      {success && (

        <div className="ucbs-neon-card ucbs-neon-card-cyan mb-6 flex items-center justify-between p-4 text-cyan-200">

          <div className="flex items-center gap-3">

            <CheckCircle2 className="h-5 w-5 text-emerald-400" />

            <span>{paymentNotice ?? 'Zahlung erfolgreich! Coins wurden gutgeschrieben.'}</span>

          </div>

          <button onClick={dismissBanner} className="text-sm underline">Schließen</button>

        </div>

      )}



      {canceled && (

        <div className="mb-6 flex items-center justify-between rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-amber-200">

          <div className="flex items-center gap-3">

            <XCircle className="h-5 w-5" />

            <span>Zahlung abgebrochen.</span>

          </div>

          <button onClick={dismissBanner} className="text-sm underline">Schließen</button>

        </div>

      )}



      {error && (

        <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-red-300">{error}</div>

      )}



      <div className="mb-8 grid gap-4 sm:grid-cols-3">

        <StatCard label="Guthaben" value={formatCoins(user?.coinBalance ?? 0)} icon={<Coins className="h-5 w-5" />} />

        <StatCard label="Ausgegeben" value={formatCoins(spent)} icon={<History className="h-5 w-5" />} />

        <StatCard label="Bonus erhalten" value={formatCoins(bonus)} icon={<Gift className="h-5 w-5" />} />

      </div>



      {(stripeAvailable || paypalAvailable) && (

        <div className="mb-6 flex flex-wrap gap-2">

          {stripeAvailable && (

            <button

              type="button"

              onClick={() => setPaymentMethod('stripe')}

              className={cn(

                'flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition-colors',

                paymentMethod === 'stripe'

                  ? 'border-brand-500 bg-brand-500/20 text-brand-200'

                  : 'border-zinc-700 text-zinc-400 hover:border-zinc-600'

              )}

            >

              <CreditCard className="h-4 w-4" />

              Stripe

            </button>

          )}

          {paypalAvailable && (

            <button

              type="button"

              onClick={() => setPaymentMethod('paypal')}

              className={cn(

                'flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition-colors',

                paymentMethod === 'paypal'

                  ? 'border-cyan-500 bg-cyan-500/20 text-cyan-200'

                  : 'border-zinc-700 text-zinc-400 hover:border-zinc-600'

              )}

            >

              <Wallet className="h-4 w-4" />

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

              className="mt-4 w-full gap-2"

              variant={pkg.isPopular ? 'primary' : 'secondary'}

              loading={loadingPkg === pkg.id}

              onClick={() => handlePurchase(pkg.id)}

            >

              {paymentMethod === 'paypal' && paypalAvailable ? (

                <Wallet className="h-4 w-4" />

              ) : (

                <CreditCard className="h-4 w-4" />

              )}

              Mit {paymentMethod === 'paypal' && paypalAvailable ? 'PayPal' : 'Stripe'} kaufen

            </Button>

          </NeonCard>

        ))}

      </div>



      {transactions.length > 0 && (

        <NeonCard accent="purple" title="Transaktionshistorie">

          <div className="space-y-2">

            {transactions.map((tx) => (

              <div key={tx.id} className="flex items-center justify-between rounded-lg border border-zinc-800/80 bg-surface-950/50 px-4 py-2 text-sm">

                <div>

                  <p className="text-zinc-300">{tx.description}</p>

                  <p className="text-xs text-zinc-500">
                    {formatDate(tx.createdAt)}
                    {tx.metadata && typeof tx.metadata === 'object' && 'provider' in tx.metadata && (
                      <> · {String((tx.metadata as { provider?: string }).provider)}</>
                    )}
                  </p>

                </div>

                <span className={tx.amount >= 0 ? 'text-emerald-400' : 'text-red-400'}>

                  {tx.amount >= 0 ? '+' : ''}{formatCoins(tx.amount)}

                </span>

              </div>

            ))}

          </div>

        </NeonCard>

      )}

    </div>

  );

}

