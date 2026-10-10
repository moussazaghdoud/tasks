import { ArrowUpRight, Check, LoaderCircle, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { haptic } from '@/lib/native/bridge';
import { apiBase, isNative } from '@/lib/native/platform';
import { closePro, FREE_OPEN_LIMIT, useProSheet, type ProReason } from '@/lib/pro/limits';
import { buy, loadOffers, PRODUCTS, redeemCode, restorePurchases, usePro, type Offer, type Period } from '@/lib/pro/store';
import { cn } from '@/lib/platform';
import { toast } from '@/store/toast';
import { Sheet } from './Sheet';
import { pt, type ProKey } from './proI18n';

/** Apple's standard licence, which applies when an app has no terms of its own. */
const TERMS = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';
const MANAGE = 'https://apps.apple.com/account/subscriptions';

const REASON: Record<ProReason, ProKey | null> = {
  limit: 'reason_limit',
  backdrop: 'reason_backdrop',
  share: 'reason_share',
  team: 'reason_team',
  settings: null,
};

const days = (p: Period): number => p.value * (p.unit === 'day' ? 1 : p.unit === 'week' ? 7 : p.unit === 'month' ? 30 : 365);

function priceLine(offer: Offer): string {
  if (offer.kind === 'lifetime') return pt('once', { price: offer.price });
  return pt(offer.period?.unit === 'year' ? 'per_year' : 'per_month', { price: offer.price });
}

function planName(offer: Offer): string {
  if (offer.id === PRODUCTS.yearly) return pt('plan_yearly');
  if (offer.id === PRODUCTS.monthly) return pt('plan_monthly');
  return pt('plan_lifetime');
}

/**
 * Hence Pro, offered. Says why it came up, what Pro adds, the three ways to
 * pay at the App Store's own prices, and everything App Review asks of a
 * paywall: restore, how renewal works, terms and privacy.
 */
export function ProSheet() {
  const { open, reason } = useProSheet();
  const pro = usePro();
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [chosen, setChosen] = useState<string>(PRODUCTS.yearly);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || offers?.length) return;
    let live = true;
    void loadOffers().then((found) => live && setOffers(found));
    return () => {
      live = false;
    };
  }, [open, offers]);

  const offer = offers?.find((o) => o.id === chosen) ?? offers?.[0];
  const trial = offer?.trial && offer.trialEligible ? days(offer.trial) : 0;

  const purchase = async () => {
    if (!offer) return;
    setBusy(true);
    const result = await buy(offer.id);
    setBusy(false);
    if (result === 'purchased') {
      haptic('success');
      toast(pt('purchased'));
      closePro();
    } else if (result === 'pending') toast(pt('pending'));
    else if (result === 'failed') toast(pt('failed'));
  };

  const restore = async () => {
    setBusy(true);
    const found = await restorePurchases();
    setBusy(false);
    if (found === null) toast(pt('store_unavailable'));
    else if (found) {
      haptic('success');
      toast(pt('restored'));
      closePro();
    } else toast(pt('nothing_restored'));
  };

  const why = REASON[reason];
  const policy = `${isNative() ? apiBase() : ''}/privacy`;

  return (
    <Sheet open={open} onClose={closePro} label={pt('pro_title')}>
      <div className="px-6 pb-3">
        <span className="grid size-12 place-items-center rounded-full bg-accent-soft text-accent">
          <Sparkles className="size-6" strokeWidth={1.8} />
        </span>
        <h2 className="mt-4 text-[26px] leading-8 font-bold tracking-[-0.03em] text-ink">{pt('pro_title')}</h2>
        <p className="mt-1 text-[15px] text-ink-3">{pt('pro_tagline')}</p>

        {pro ? (
          <div className="mt-5">
            <p className="text-[16px] font-medium text-accent">{pt('pro_active')}</p>
            <a href={MANAGE} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-[15px] font-medium text-accent">
              {pt('manage')}
              <ArrowUpRight className="size-4" strokeWidth={2} />
            </a>
          </div>
        ) : (
          <>
            {why && (
              <p className="mt-4 rounded-[14px] border border-accent/25 bg-accent-soft px-4 py-3 text-[14px] leading-[20px] text-accent">
                {pt(why, { max: FREE_OPEN_LIMIT })}
              </p>
            )}

            <ul className="mt-4 space-y-2">
              {(['benefit_unlimited', 'benefit_backdrops', 'benefit_share', 'benefit_receipts'] as ProKey[]).map((key) => (
                <li key={key} className="flex items-start gap-2.5 text-[15px] leading-[21px] text-ink-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-accent" strokeWidth={2.6} />
                  {pt(key)}
                </li>
              ))}
            </ul>

            {/* The ways to pay, at the App Store's prices; yearly first. */}
            <div className="mt-5 space-y-2" role="radiogroup" aria-label={pt('pro_title')}>
              {offers === null ? (
                <div className="grid h-[132px] place-items-center">
                  <LoaderCircle className="size-6 animate-spin text-accent" />
                </div>
              ) : offers.length === 0 ? (
                <p className="text-[14px] leading-[20px] text-ink-3">{pt('store_unavailable')}</p>
              ) : (
                offers.map((o) => {
                  const on = o.id === offer?.id;
                  const free = o.trial && o.trialEligible ? days(o.trial) : 0;
                  return (
                    <button
                      key={o.id}
                      role="radio"
                      aria-checked={on}
                      onClick={() => setChosen(o.id)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-[16px] border-2 px-4 py-3 text-start transition-colors',
                        on ? 'border-accent bg-accent-soft' : 'border-line bg-sunk',
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2 text-[16px] font-semibold text-ink">
                          {planName(o)}
                          {o.id === PRODUCTS.yearly && (
                            <span className="rounded-full bg-accent px-2 py-0.5 text-[10.5px] font-bold tracking-[0.04em] text-on-accent uppercase">
                              {pt('best_value')}
                            </span>
                          )}
                        </span>
                        {free > 0 && <span className="text-[13px] text-accent">{pt('trial_days', { n: free })}</span>}
                      </span>
                      <span className="shrink-0 text-[15px] font-medium text-ink-2">{priceLine(o)}</span>
                    </button>
                  );
                })
              )}
            </div>

            <button
              onClick={() => void purchase()}
              disabled={!offer || busy}
              className="mt-4 h-14 w-full rounded-[18px] bg-accent text-[16px] font-semibold text-on-accent transition-transform active:scale-[0.985] disabled:opacity-40"
            >
              {busy ? <LoaderCircle className="mx-auto size-5 animate-spin" /> : trial > 0 ? pt('cta_trial') : pt('cta_buy')}
            </button>
          </>
        )}

        <div className="mt-3 flex justify-center gap-6">
          <button onClick={() => void restore()} disabled={busy} className="py-2 text-[14px] font-medium text-accent disabled:opacity-40">
            {pt('restore')}
          </button>
          {/* A code someone was given: Apple's own redeem sheet. */}
          {!pro && (
            <button
              onClick={() => void redeemCode().then((shown) => !shown && toast(pt('store_unavailable')))}
              disabled={busy}
              className="py-2 text-[14px] font-medium text-accent disabled:opacity-40"
            >
              {pt('redeem')}
            </button>
          )}
        </div>

        <p className="mt-2 text-[11.5px] leading-[16px] text-ink-4">{pt('legal')}</p>
        <p className="mt-2 flex gap-4 text-[12px] font-medium">
          <a href={TERMS} target="_blank" rel="noopener noreferrer" className="text-accent">
            {pt('terms')}
          </a>
          <a href={policy} target="_blank" rel="noopener noreferrer" className="text-accent">
            {pt('privacy')}
          </a>
        </p>
      </div>
    </Sheet>
  );
}
