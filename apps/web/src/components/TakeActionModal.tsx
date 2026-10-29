/**
 * UNDERSTAND → VERIFY → ACT.
 * The human review screen for a PayPal SANDBOX action. Nothing is created at PayPal until the
 * user ticks the sandbox acknowledgement and presses PayPal's own button. Success is shown only
 * after the server reports PayPal's authoritative capture result.
 */
import { useEffect, useRef, useState, type HTMLAttributes } from 'react';
import type { ActionOption, PaymentRecord } from '@worldlens/shared';
import { api, ApiError } from '../lib/api';
import { safeExternalUrl } from '../lib/format';
import { useConfig, useEventDetail } from '../hooks/useData';
import { preparePayPal, type PreparedPayPal } from '../payments/paypal';
import { useAppStore } from '../state/store';
import { ExternalLink, Notice, Spinner } from './ui';

declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'paypal-button': HTMLAttributes<HTMLElement> & {
        type?: 'pay' | 'checkout' | 'buynow' | 'donate' | 'subscribe';
        ref?: React.Ref<HTMLElement>;
        disabled?: boolean;
      };
    }
  }
}

type Phase =
  | { kind: 'review' }
  | { kind: 'working'; message: string }
  | { kind: 'done'; payment: PaymentRecord; verifiedBy: string }
  | { kind: 'cancelled' }
  | { kind: 'error'; message: string };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-2 py-1.5 text-[13px]">
      <dt className="text-white/50">{label}</dt>
      <dd className="m-0 text-white/90">{children}</dd>
    </div>
  );
}

export function TakeActionModal() {
  const take = useAppStore((s) => s.takeAction);
  const close = () => useAppStore.getState().openTakeAction(null);
  const detail = useEventDetail(take?.eventId ?? null);
  const config = useConfig();
  const option: ActionOption | undefined = detail.data?.actions.find(
    (a) => a.id === take?.optionId,
  );
  const [amount, setAmount] = useState<string>('');
  const [ack, setAck] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: 'review' });
  const [paypal, setPaypal] = useState<PreparedPayPal | null>(null);
  const [paypalError, setPaypalError] = useState<string | null>(null);
  const buttonRef = useRef<HTMLElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const orderIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!take) return;
    setPhase({ kind: 'review' });
    setAck(false);
    setPaypal(null);
    setPaypalError(null);
    orderIdRef.current = null;
  }, [take?.eventId, take?.optionId, take]);

  useEffect(() => {
    if (option)
      setAmount(
        String(
          take?.amount ?? option.suggestedAmounts[Math.min(1, option.suggestedAmounts.length - 1)],
        ),
      );
  }, [option, take?.amount]);

  useEffect(() => {
    if (!take) return;
    const prev = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && phase.kind !== 'working' && close();
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('keydown', esc);
      prev?.focus?.();
    };
  }, [take, phase.kind]);

  const pp = config.data?.paypal;
  // Load the PayPal v6 SDK once the user has acknowledged the sandbox terms.
  useEffect(() => {
    if (!take || !ack || !pp?.configured || !pp.clientId || paypal) return;
    let cancelled = false;
    preparePayPal(pp.clientId, {
      onApprove: async (data) => {
        setPhase({
          kind: 'working',
          message: 'Approved in PayPal. Confirming the capture with PayPal…',
        });
        try {
          const r = await api.capturePayment(data.orderId);
          setPhase({ kind: 'done', payment: r.payment, verifiedBy: r.verifiedBy });
        } catch (err) {
          setPhase({
            kind: 'error',
            message: `${err instanceof Error ? err.message : 'Capture failed.'} No payment was confirmed.`,
          });
        }
      },
      onCancel: () => {
        if (orderIdRef.current) void api.cancelPayment(orderIdRef.current).catch(() => undefined);
        setPhase({ kind: 'cancelled' });
      },
      onError: (err) =>
        setPhase({
          kind: 'error',
          message: `PayPal reported an error (${err.message || err.code || 'unknown'}). No payment was confirmed.`,
        }),
    })
      .then((p) => !cancelled && setPaypal(p))
      .catch(
        () =>
          !cancelled &&
          setPaypalError('PayPal could not be loaded. No payment can be made right now.'),
      );
    return () => {
      cancelled = true;
    };
  }, [take, ack, pp?.configured, pp?.clientId, paypal]);

  const amountNum = Number(amount);
  const amountOk = option
    ? Number.isFinite(amountNum) && amountNum >= option.minAmount && amountNum <= option.maxAmount
    : false;
  const ready = !!paypal?.eligible && ack && amountOk && phase.kind === 'review';

  // Attach PayPal's click handler to the official <paypal-button> web component.
  useEffect(() => {
    const el = buttonRef.current;
    if (!el || !paypal || !option || !take) return;
    const onClick = () => {
      if (!ready) return;
      setPhase({ kind: 'working', message: 'Opening PayPal sandbox…' });
      // Start the PayPal session immediately (transient activation); the order is created in parallel.
      const orderPromise = api
        .createPayment({
          actionOptionId: option.id,
          eventId: take.eventId,
          amount: amountNum.toFixed(2),
          currency: 'USD',
          reviewedTerms: {
            beneficiary: option.beneficiary.name,
            purpose: option.purpose,
            sandboxAcknowledged: true,
          },
        })
        .then((r) => {
          orderIdRef.current = r.orderId;
          return { orderId: r.orderId };
        });
      orderPromise.catch((err: unknown) =>
        setPhase({
          kind: 'error',
          message: `${err instanceof ApiError ? err.message : 'Order could not be created.'} No payment was made.`,
        }),
      );
      paypal.start(orderPromise).catch((err: unknown) => {
        setPhase((p) =>
          p.kind === 'working'
            ? {
                kind: 'error',
                message: `PayPal could not start (${err instanceof Error ? err.message : 'unknown'}). No payment was made.`,
              }
            : p,
        );
      });
    };
    el.addEventListener('click', onClick);
    return () => el.removeEventListener('click', onClick);
  }, [paypal, option, take, ready, amountNum]);

  if (!take) return null;
  const event = detail.data?.event;

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-end bg-black/60 p-0 md:place-items-center md:p-6"
      role="presentation"
      onMouseDown={(e) => e.target === e.currentTarget && phase.kind !== 'working' && close()}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="take-action-title"
        className="glass scroll-thin max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl outline-none md:max-w-lg md:rounded-2xl"
        data-testid="take-action-modal"
      >
        <div
          className="sandbox-banner border-b border-sandbox/40 px-4 py-2 text-center text-[12px] font-extrabold tracking-[0.12em] text-white/85"
          data-testid="sandbox-banner"
        >
          SANDBOX DEMO — NO REAL MONEY TRANSFERRED
        </div>
        <div className="p-4">
          <h2 id="take-action-title" className="text-[17px] font-normal">
            Review before continuing
          </h2>
          {!option && <Spinner />}
          {option && event && (
            <>
              <dl className="mt-2 divide-y divide-white/[0.06]">
                <Row label="Recipient">
                  <span className="font-medium">{option.beneficiary.name}</span>
                  <span className="block text-[11.5px] text-white/50">
                    {option.beneficiary.disclosure}
                  </span>
                </Row>
                <Row label="Amount">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {option.suggestedAmounts.map((a) => (
                      <button
                        key={a}
                        type="button"
                        disabled={phase.kind !== 'review'}
                        aria-pressed={Number(amount) === a}
                        onClick={() => setAmount(String(a))}
                        className={`rounded-md border px-2 py-0.5 text-[12.5px] ${Number(amount) === a ? 'border-sandbox bg-sandbox/15 text-white/85' : 'border-white/15 text-white/85 hover:bg-white/10'}`}
                      >
                        ${a}
                      </button>
                    ))}
                    <label className="flex items-center gap-1 text-[12.5px]">
                      <span className="sr-only">Custom amount in US dollars</span>$
                      <input
                        inputMode="decimal"
                        value={amount}
                        disabled={phase.kind !== 'review'}
                        onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
                        className="w-20 rounded-md border border-white/15 bg-white/5 px-2 py-0.5 text-white/90"
                        data-testid="amount-input"
                      />
                    </label>
                  </div>
                  {!amountOk && (
                    <span className="mt-1 block text-[11.5px] text-white/70">
                      Enter between ${option.minAmount} and ${option.maxAmount}.
                    </span>
                  )}
                </Row>
                <Row label="Currency">USD</Row>
                <Row label="Purpose">{option.purpose}</Row>
                <Row label="Event">
                  {event.title}
                  {event.isDemo && (
                    <span className="ml-1 text-[11px] text-white/70">(DEMO scenario)</span>
                  )}
                </Row>
                <Row label="Environment">
                  <span className="font-normal text-white/85">PayPal SANDBOX</span>{' '}
                  <span className="text-white/50">— test accounts only</span>
                </Row>
              </dl>

              {option.informationalLinks.length > 0 && (
                <div className="mt-3 rounded-lg border border-white/10 p-3 text-[12px] text-white/70">
                  <p className="mb-1 font-medium text-white/85">Want to help for real?</p>
                  <p className="mb-1.5 text-white/50">
                    These organisations are listed for information only. WorldLens does not process
                    donations to them and is not affiliated with them.
                  </p>
                  <ul className="space-y-1">
                    {option.informationalLinks.map((l) => {
                      const href = safeExternalUrl(l.url);
                      return href ? (
                        <li key={l.url}>
                          <ExternalLink href={href}>{l.name}</ExternalLink>
                          <span className="block text-[11px] text-white/35">{l.note}</span>
                        </li>
                      ) : null;
                    })}
                  </ul>
                </div>
              )}

              {phase.kind === 'review' && (
                <>
                  <label className="mt-4 flex cursor-pointer items-start gap-2 text-[12.5px] text-white/85">
                    <input
                      type="checkbox"
                      checked={ack}
                      onChange={(e) => setAck(e.target.checked)}
                      className="mt-0.5 accent-white"
                      data-testid="sandbox-ack"
                    />
                    I understand this is a PayPal sandbox demonstration: no real money is
                    transferred and the recipient is a demo merchant, not a charity.
                  </label>
                  <div className="mt-4 flex flex-col gap-2">
                    <span className="text-[11px] font-normal uppercase tracking-[0.14em] text-white/50">
                      Continue with PayPal
                    </span>
                    {!pp?.configured ? (
                      <Notice testId="paypal-not-configured">
                        PayPal sandbox is not configured on this server (see MANUAL_SETUP.md). No
                        payment can be made.
                        {pp?.diagnostics && (
                          <span className="mt-1 block text-[11px] text-white/50">
                            Missing in .dev.vars:{' '}
                            {[
                              !pp.diagnostics.hasClientId && 'PAYPAL_CLIENT_ID',
                              !pp.diagnostics.hasClientSecret && 'PAYPAL_CLIENT_SECRET',
                            ]
                              .filter(Boolean)
                              .join(', ') || 'credentials'}
                          </span>
                        )}
                      </Notice>
                    ) : !ack ? (
                      <p className="text-[12px] text-white/35">
                        Tick the acknowledgement to load PayPal.
                      </p>
                    ) : paypalError ? (
                      <Notice tone="danger">{paypalError}</Notice>
                    ) : !paypal ? (
                      <Spinner label="Loading PayPal…" />
                    ) : !paypal.eligible ? (
                      <Notice>PayPal is not available for this browser or region.</Notice>
                    ) : (
                      <div
                        className={amountOk ? '' : 'pointer-events-none opacity-40'}
                        data-testid="paypal-button-wrap"
                      >
                        <paypal-button ref={buttonRef} type="pay" data-testid="paypal-button" />
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={close}
                      className="rounded-lg border border-white/15 py-2 text-[13px] font-medium text-white/90 hover:bg-white/10"
                      data-testid="cancel-action"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              )}
            </>
          )}

          {phase.kind === 'working' && (
            <div className="mt-4" data-testid="payment-working">
              <Spinner label={phase.message} />
            </div>
          )}
          {phase.kind === 'cancelled' && (
            <div className="mt-4 space-y-3" data-testid="payment-cancelled">
              <Notice tone="info">Payment cancelled in PayPal. Nothing was charged.</Notice>
              <button
                type="button"
                onClick={close}
                className="w-full rounded-lg border border-white/15 py-2 text-[13px]"
              >
                Close
              </button>
            </div>
          )}
          {phase.kind === 'error' && (
            <div className="mt-4 space-y-3" data-testid="payment-error">
              <Notice tone="danger">{phase.message}</Notice>
              <button
                type="button"
                onClick={() => setPhase({ kind: 'review' })}
                className="w-full rounded-lg border border-white/15 py-2 text-[13px]"
              >
                Back to review
              </button>
            </div>
          )}
          {phase.kind === 'done' && (
            <Receipt payment={phase.payment} verifiedBy={phase.verifiedBy} onClose={close} />
          )}
        </div>
      </div>
    </div>
  );
}

function Receipt({
  payment,
  verifiedBy,
  onClose,
}: {
  payment: PaymentRecord;
  verifiedBy: string;
  onClose: () => void;
}) {
  const captured = payment.state === 'CAPTURED';
  return (
    <div className="mt-4 space-y-3" data-testid="payment-result" data-state={payment.state}>
      {captured ? (
        <Notice tone="info">
          <strong>Sandbox payment captured.</strong> Confirmed by the WorldLens server from PayPal’s
          response — not from the browser.
        </Notice>
      ) : (
        <Notice>
          PayPal reports this payment as <strong>{payment.state}</strong>. It has not been confirmed
          as captured.
        </Notice>
      )}
      <dl className="divide-y divide-white/[0.06] rounded-lg border border-white/10 px-3">
        <Row label="Status">{payment.state}</Row>
        <Row label="Amount">
          {payment.amount} {payment.currency}
        </Row>
        <Row label="PayPal order">{payment.paypalOrderId}</Row>
        {payment.captureId && <Row label="Capture ID">{payment.captureId}</Row>}
        <Row label="Environment">SANDBOX — no real money</Row>
        <Row label="Verified by">{verifiedBy}</Row>
      </dl>
      <button
        type="button"
        onClick={onClose}
        className="w-full rounded-lg bg-white/10 py-2 text-[13px] font-medium"
      >
        Done
      </button>
    </div>
  );
}
