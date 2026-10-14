/**
 * Minimal PayPal REST client (server-side only; credentials never reach the browser).
 * Verified against PayPal's official REST API specifications (paypal/paypal-rest-api-specifications):
 *   POST /v1/oauth2/token                              client-credentials access token
 *   POST /v2/checkout/orders                           create order (PayPal-Request-Id for idempotency)
 *   GET  /v2/checkout/orders/{id}                      show order details
 *   POST /v2/checkout/orders/{id}/capture              capture payment (PayPal-Request-Id)
 *   POST /v1/notifications/verify-webhook-signature    verify webhook authenticity
 * The browser side uses the PayPal JavaScript SDK v6 (see apps/web/src/payments/paypal.ts).
 */
import { z } from 'zod';
import { fetchWithTimeout, UpstreamError, type FetchLike } from '../lib/http';

export const PAYPAL_API_BASE = {
  sandbox: 'https://api-m.sandbox.paypal.com',
  live: 'https://api-m.paypal.com',
} as const;

const TokenSchema = z.object({ access_token: z.string(), expires_in: z.number() });

const AmountSchema = z.object({ currency_code: z.string(), value: z.string() });
const CaptureSchema = z.object({
  id: z.string(),
  status: z.string(),
  amount: AmountSchema.optional(),
  custom_id: z.string().optional(),
  create_time: z.string().optional(),
});
export const OrderSchema = z.object({
  id: z.string(),
  status: z.string(),
  intent: z.string().optional(),
  purchase_units: z
    .array(
      z.object({
        reference_id: z.string().optional(),
        custom_id: z.string().optional(),
        description: z.string().optional(),
        amount: AmountSchema.optional(),
        payments: z.object({ captures: z.array(CaptureSchema).optional() }).optional(),
      }),
    )
    .optional(),
  links: z.array(z.object({ href: z.string(), rel: z.string(), method: z.string().optional() })).optional(),
});
export type PayPalOrder = z.infer<typeof OrderSchema>;

export interface CreateOrderInput {
  amount: string;
  currency: 'USD';
  description: string;
  customId: string;
  referenceId: string;
  requestId: string;
  brandName: string;
  returnUrl: string;
  cancelUrl: string;
}

export class PayPalApiError extends UpstreamError {
  constructor(
    message: string,
    status: number,
    body: string,
    readonly issue: string | null,
  ) {
    super(message, 'paypal', status, body);
    this.name = 'PayPalApiError';
  }
}

export class PayPalClient {
  private token: { value: string; expiresAt: number } | null = null;
  readonly base: string;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    readonly environment: 'sandbox' | 'live',
    private readonly fetchImpl: FetchLike = fetch,
    private readonly now: () => number = Date.now,
  ) {
    this.base = PAYPAL_API_BASE[environment];
  }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > this.now() + 60_000) return this.token.value;
    const res = await fetchWithTimeout(`${this.base}/v1/oauth2/token`, {
      provider: 'paypal',
      method: 'POST',
      timeoutMs: 10_000,
      retries: 1,
      fetchImpl: this.fetchImpl,
      headers: {
        Authorization: `Basic ${btoa(`${this.clientId}:${this.clientSecret}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: 'grant_type=client_credentials',
    });
    const text = await res.text();
    if (!res.ok) throw new PayPalApiError(`PayPal auth failed (HTTP ${res.status})`, res.status, text.slice(0, 300), null);
    const t = TokenSchema.parse(JSON.parse(text));
    this.token = { value: t.access_token, expiresAt: this.now() + t.expires_in * 1000 };
    return t.access_token;
  }

  private async call<T>(
    method: 'GET' | 'POST',
    path: string,
    schema: z.ZodType<T>,
    opts: { body?: string; requestId?: string; retries?: number } = {},
  ): Promise<T> {
    const token = await this.accessToken();
    const res = await fetchWithTimeout(`${this.base}${path}`, {
      provider: 'paypal',
      method,
      timeoutMs: 15_000,
      // Only retry when PayPal-Request-Id makes the call idempotent (or for GETs).
      retries: method === 'GET' || opts.requestId ? (opts.retries ?? 1) : 0,
      fetchImpl: this.fetchImpl,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Prefer: 'return=representation',
        ...(opts.requestId ? { 'PayPal-Request-Id': opts.requestId } : {}),
      },
      ...(opts.body !== undefined ? { body: opts.body } : {}),
    });
    const text = await res.text();
    if (!res.ok) {
      let issue: string | null = null;
      try {
        const j = JSON.parse(text) as { details?: Array<{ issue?: string }>; name?: string };
        issue = j.details?.[0]?.issue ?? j.name ?? null;
      } catch {
        /* not JSON */
      }
      throw new PayPalApiError(`PayPal ${method} ${path.split('?')[0]} failed (HTTP ${res.status}${issue ? `, ${issue}` : ''})`, res.status, text.slice(0, 500), issue);
    }
    return schema.parse(JSON.parse(text));
  }

  createOrder(input: CreateOrderInput): Promise<PayPalOrder> {
    const body = {
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: input.referenceId,
          custom_id: input.customId,
          description: input.description.slice(0, 127),
          amount: { currency_code: input.currency, value: input.amount },
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: input.brandName.slice(0, 127),
            shipping_preference: 'NO_SHIPPING',
            user_action: 'PAY_NOW',
            return_url: input.returnUrl,
            cancel_url: input.cancelUrl,
          },
        },
      },
    };
    return this.call('POST', '/v2/checkout/orders', OrderSchema, {
      body: JSON.stringify(body),
      requestId: input.requestId,
    });
  }

  getOrder(orderId: string): Promise<PayPalOrder> {
    return this.call('GET', `/v2/checkout/orders/${encodeURIComponent(orderId)}`, OrderSchema);
  }

  captureOrder(orderId: string, requestId: string): Promise<PayPalOrder> {
    return this.call('POST', `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, OrderSchema, {
      body: '{}',
      requestId,
    });
  }

  /**
   * Verify a webhook using PayPal's verification API. The raw body is embedded verbatim
   * (not re-serialised) so the event PayPal checks is byte-identical to what it sent.
   */
  async verifyWebhook(headers: Headers, rawBody: string, webhookId: string): Promise<boolean> {
    const h = (n: string) => headers.get(n);
    const fields = {
      auth_algo: h('paypal-auth-algo'),
      cert_url: h('paypal-cert-url'),
      transmission_id: h('paypal-transmission-id'),
      transmission_sig: h('paypal-transmission-sig'),
      transmission_time: h('paypal-transmission-time'),
      webhook_id: webhookId,
    };
    if (Object.values(fields).some((v) => !v)) return false;
    try {
      JSON.parse(rawBody);
    } catch {
      return false;
    }
    const prefix = JSON.stringify(fields).slice(0, -1);
    const body = `${prefix},"webhook_event":${rawBody}}`;
    const result = await this.call(
      'POST',
      '/v1/notifications/verify-webhook-signature',
      z.object({ verification_status: z.enum(['SUCCESS', 'FAILURE']) }),
      { body },
    );
    return result.verification_status === 'SUCCESS';
  }
}

/** Pull the first capture from an order, if any. */
export function firstCapture(order: PayPalOrder): z.infer<typeof CaptureSchema> | null {
  return order.purchase_units?.[0]?.payments?.captures?.[0] ?? null;
}
