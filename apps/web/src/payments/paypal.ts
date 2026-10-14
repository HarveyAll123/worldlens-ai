/**
 * PayPal JavaScript SDK v6 (browser). Loaded with the official loader from
 * @paypal/paypal-js/sdk-v6, which fetches https://www.sandbox.paypal.com/web-sdk/v6/core.
 *
 * Flow (per PayPal's v6 sample integration):
 *   createInstance({ clientId, components: ['paypal-payments'], pageType: 'checkout' })
 *   → findEligibleMethods({ currencyCode }) → createPayPalOneTimePaymentSession({ onApprove, onCancel, onError })
 *   → on the user's click: session.start({ presentationMode: 'auto' }, createOrderPromise)
 * The order is created and captured by the WorldLens server; the browser never decides success.
 */
import { loadCoreSdkScript } from '@paypal/paypal-js/sdk-v6';
import type {
  OnApproveDataOneTimePayments,
  OnCancelDataOneTimePayments,
  OnErrorData,
} from '@paypal/paypal-js/sdk-v6';

export interface PayPalSessionHandlers {
  onApprove: (data: OnApproveDataOneTimePayments) => Promise<void>;
  onCancel: (data: OnCancelDataOneTimePayments) => void;
  onError: (err: OnErrorData) => void;
}

export interface PreparedPayPal {
  eligible: boolean;
  start: (createOrder: Promise<{ orderId: string }>) => Promise<void>;
}

let instance: Promise<Awaited<ReturnType<typeof createInstance>>> | null = null;

async function createInstance(clientId: string, environment: 'sandbox' | 'production') {
  const paypal = await loadCoreSdkScript({ environment });
  if (!paypal) throw new Error('PayPal SDK is not available in this environment.');
  return paypal.createInstance({ clientId, components: ['paypal-payments'], pageType: 'checkout' });
}

export async function preparePayPal(
  clientId: string,
  handlers: PayPalSessionHandlers,
): Promise<PreparedPayPal> {
  // Hackathon build: sandbox only. The server also refuses live orders.
  instance ??= createInstance(clientId, 'sandbox').catch((err: unknown) => {
    instance = null;
    throw err;
  });
  const sdk = await instance;
  const methods = await sdk.findEligibleMethods({ currencyCode: 'USD' });
  const eligible = methods.isEligible('paypal');
  const session = sdk.createPayPalOneTimePaymentSession({
    onApprove: handlers.onApprove,
    onCancel: handlers.onCancel,
    onError: handlers.onError,
  });
  return {
    eligible,
    // Do not await createOrder before calling start(): PayPal needs the click's transient activation.
    start: (createOrder) => session.start({ presentationMode: 'auto' }, createOrder),
  };
}
