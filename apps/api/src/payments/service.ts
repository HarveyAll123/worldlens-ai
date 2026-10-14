/**
 * Payment rules — UNDERSTAND → VERIFY → ACT.
 *
 *  - Orders are created only from an explicit user request that echoes the reviewed terms.
 *    No AI tool can reach this code path.
 *  - Only SANDBOX is allowed in this build.
 *  - Success is reported only from PayPal's authoritative capture response, a verified
 *    webhook, or a fresh GET of the order. Browser callbacks are hints, never proof.
 */
import { z } from 'zod';
import type { CreatePaymentRequest, PaymentRecord, PaymentState } from '@worldlens/shared';
import type { Config } from '../env';
import type { EventRepository } from '../data/repository';
import { firstCapture, PayPalApiError, type PayPalClient, type PayPalOrder } from './paypal-client';
import { canTransition, type PaymentStore } from './store';

export class PaymentError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: 400 | 401 | 403 | 404 | 409 | 422 | 502 | 503,
  ) {
    super(message);
    this.name = 'PaymentError';
  }
}

export const ORDER_ID_RE = /^[A-Z0-9]{5,40}$/;
const PAYMENT_ID_RE = /^wl_[a-z0-9]{8,40}$/;

export function stateFromOrder(order: PayPalOrder): PaymentState {
  const capture = firstCapture(order);
  if (capture) {
    switch (capture.status) {
      case 'COMPLETED':
        return 'CAPTURED';
      case 'PENDING':
        return 'PENDING';
      case 'DECLINED':
      case 'FAILED':
        return 'DECLINED';
      case 'REFUNDED':
      case 'PARTIALLY_REFUNDED':
        return 'REFUNDED';
    }
  }
  switch (order.status) {
    case 'APPROVED':
      return 'APPROVED';
    case 'VOIDED':
      return 'CANCELLED';
    case 'COMPLETED':
      return 'PENDING'; // completed without a visible capture: wait for webhook / refresh
    default:
      return 'CREATED';
  }
}

const WebhookEventSchema = z.object({
  id: z.string().min(1).max(100),
  event_type: z.string().min(1).max(100),
  resource: z
    .object({
      id: z.string().optional(),
      status: z.string().optional(),
      custom_id: z.string().optional(),
      supplementary_data: z
        .object({ related_ids: z.object({ order_id: z.string().optional() }).partial().optional() })
        .partial()
        .optional(),
    })
    .passthrough(),
});
type WebhookEvent = z.infer<typeof WebhookEventSchema>;

const WEBHOOK_STATE: Record<string, PaymentState | 'REFRESH'> = {
  'CHECKOUT.ORDER.APPROVED': 'APPROVED',
  'CHECKOUT.ORDER.COMPLETED': 'REFRESH',
  'CHECKOUT.PAYMENT-APPROVAL.REVERSED': 'FAILED',
  'PAYMENT.CAPTURE.COMPLETED': 'CAPTURED',
  'PAYMENT.CAPTURE.PENDING': 'PENDING',
  'PAYMENT.CAPTURE.DENIED': 'DECLINED',
  'PAYMENT.CAPTURE.DECLINED': 'DECLINED',
  'PAYMENT.CAPTURE.REFUNDED': 'REFUNDED',
  'PAYMENT.CAPTURE.REVERSED': 'REFUNDED',
};

export interface PaymentServiceDeps {
  client: PayPalClient | null;
  store: PaymentStore;
  repo: EventRepository;
  config: Config;
  now: () => number;
  newId: () => string;
}

export class PaymentService {
  constructor(private readonly d: PaymentServiceDeps) {}

  publicConfig() {
    const { paypal } = this.d.config;
    return {
      configured: !!this.d.client,
      environment: paypal.environment,
      /** Client IDs are browser-safe by design (PayPal docs); the secret never leaves the server. */
      clientId: this.d.client ? paypal.clientId : null,
      webhooksConfigured: !!paypal.webhookId,
      store: this.d.store.name,
    };
  }

  private requireClient(): PayPalClient {
    if (!this.d.client) {
      throw new PaymentError(
        'PAYPAL_NOT_CONFIGURED',
        'PayPal sandbox credentials are not configured on the server (see MANUAL_SETUP.md).',
        503,
      );
    }
    if (this.d.client.environment !== 'sandbox') {
      throw new PaymentError(
        'LIVE_DISABLED',
        'Live payments are disabled in this build. Use the PayPal sandbox.',
        403,
      );
    }
    return this.d.client;
  }

  async create(
    req: CreatePaymentRequest,
  ): Promise<{ paymentId: string; orderId: string; record: PaymentRecord }> {
    const client = this.requireClient();
    const nowMs = this.d.now();
    const option = this.d.repo.actionOption(req.actionOptionId);
    if (!option) throw new PaymentError('UNKNOWN_OPTION', 'Unknown action option.', 404);
    const event = await this.d.repo.getEvent(req.eventId, nowMs);
    if (!event) throw new PaymentError('UNKNOWN_EVENT', 'Unknown event.', 404);
    if (!this.d.repo.actionOptions(event).some((o) => o.id === option.id)) {
      throw new PaymentError(
        'OPTION_NOT_AVAILABLE',
        'This action is not offered for this event.',
        400,
      );
    }
    const amount = Number(req.amount);
    if (!Number.isFinite(amount) || amount < option.minAmount || amount > option.maxAmount) {
      throw new PaymentError(
        'AMOUNT_OUT_OF_RANGE',
        `Amount must be between ${option.minAmount} and ${option.maxAmount} ${option.currency}.`,
        400,
      );
    }
    if (
      req.reviewedTerms.beneficiary !== option.beneficiary.name ||
      req.reviewedTerms.purpose !== option.purpose
    ) {
      throw new PaymentError(
        'TERMS_MISMATCH',
        'The reviewed terms do not match this action. Please review again.',
        409,
      );
    }
    const amountStr = amount.toFixed(2);
    const id = `wl_${this.d.newId()}`;
    const ts = new Date(nowMs).toISOString();
    const record: PaymentRecord = {
      id,
      paypalOrderId: null,
      actionOptionId: option.id,
      eventId: event.id,
      amount: amountStr,
      currency: 'USD',
      state: 'REVIEW',
      environment: 'sandbox',
      captureId: null,
      paypalStatus: null,
      createdAt: ts,
      updatedAt: ts,
      lastError: null,
    };
    await this.d.store.create(record);
    await this.d.store.log(id, 'review_confirmed', {
      optionId: option.id,
      eventId: event.id,
      amount: amountStr,
    });
    try {
      const base = this.d.config.publicAppUrl.replace(/\/$/, '');
      const order = await client.createOrder({
        amount: amountStr,
        currency: 'USD',
        description: `SANDBOX DEMO - ${option.purpose} - no real money`,
        customId: id,
        referenceId: option.id,
        requestId: id,
        brandName: 'WorldLens (Sandbox Demo)',
        returnUrl: `${base}/?payment=return`,
        cancelUrl: `${base}/?payment=cancel`,
      });
      const updated = await this.d.store.update(id, {
        paypalOrderId: order.id,
        paypalStatus: order.status,
        state: 'CREATED',
        updatedAt: new Date(this.d.now()).toISOString(),
      });
      await this.d.store.log(id, 'order_created', { orderId: order.id, status: order.status });
      return { paymentId: id, orderId: order.id, record: updated! };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.d.store.update(id, {
        state: 'FAILED',
        lastError: message,
        updatedAt: new Date(this.d.now()).toISOString(),
      });
      await this.d.store.log(id, 'order_create_failed', { message });
      throw new PaymentError(
        'PAYPAL_ERROR',
        'PayPal could not create the order. No payment was made.',
        502,
      );
    }
  }

  /** Reconstruct a record from PayPal when this isolate/store has no copy (e.g. memory store). */
  private async adopt(orderId: string): Promise<PaymentRecord> {
    const client = this.requireClient();
    const order = await client.getOrder(orderId).catch((err: unknown) => {
      if (err instanceof PayPalApiError && err.status === 404) {
        throw new PaymentError('UNKNOWN_ORDER', 'Unknown PayPal order.', 404);
      }
      throw err;
    });
    const pu = order.purchase_units?.[0];
    const customId = pu?.custom_id ?? '';
    const option = pu?.reference_id ? this.d.repo.actionOption(pu.reference_id) : null;
    if (!PAYMENT_ID_RE.test(customId) || !option || !pu?.amount) {
      throw new PaymentError('FOREIGN_ORDER', 'This order was not created by WorldLens.', 404);
    }
    const ts = new Date(this.d.now()).toISOString();
    const record: PaymentRecord = {
      id: customId,
      paypalOrderId: order.id,
      actionOptionId: option.id,
      eventId: option.eventIds[0] ?? 'live',
      amount: pu.amount.value,
      currency: pu.amount.currency_code,
      state: 'CREATED',
      environment: 'sandbox',
      captureId: null,
      paypalStatus: order.status,
      createdAt: ts,
      updatedAt: ts,
      lastError: null,
    };
    await this.d.store.create(record);
    await this.d.store.log(record.id, 'adopted_from_paypal', { orderId });
    return record;
  }

  /**
   * Applies PayPal's authoritative order state. If another request changed the record since
   * it was read (compare-and-set lost), re-read and decide again against the newer state.
   */
  private async apply(
    record: PaymentRecord,
    order: PayPalOrder,
    source: string,
  ): Promise<PaymentRecord> {
    let current = record;
    for (let attempt = 0; attempt < 3; attempt++) {
      const result = await this.applyOnce(current, order, source);
      if (result) return result;
      const fresh = await this.d.store.get(current.id);
      if (!fresh) throw new PaymentError('UNKNOWN_PAYMENT', 'Unknown payment.', 404);
      current = fresh;
    }
    return current;
  }

  /** Returns null when the stored state changed underneath (caller re-reads). */
  private async applyOnce(
    record: PaymentRecord,
    order: PayPalOrder,
    source: string,
  ): Promise<PaymentRecord | null> {
    const target = stateFromOrder(order);
    const capture = firstCapture(order);
    if (
      capture?.amount &&
      (capture.amount.value !== record.amount || capture.amount.currency_code !== record.currency)
    ) {
      await this.d.store.log(record.id, 'amount_mismatch', {
        expected: record.amount,
        got: capture.amount,
      });
      return this.d.store.update(
        record.id,
        {
          state: canTransition(record.state, 'FAILED') ? 'FAILED' : record.state,
          lastError: 'Captured amount does not match the reviewed amount.',
          updatedAt: new Date(this.d.now()).toISOString(),
        },
        { expectState: record.state },
      );
    }
    if (!canTransition(record.state, target)) {
      await this.d.store.log(record.id, 'transition_ignored', {
        from: record.state,
        to: target,
        source,
      });
      return record;
    }
    const next = await this.d.store.update(
      record.id,
      {
        state: target,
        paypalStatus: order.status,
        captureId: capture?.id ?? record.captureId,
        lastError: null,
        updatedAt: new Date(this.d.now()).toISOString(),
      },
      { expectState: record.state },
    );
    if (!next) return null;
    await this.d.store.log(record.id, 'state', {
      from: record.state,
      to: target,
      source,
      captureId: capture?.id,
    });
    return next;
  }

  async capture(orderId: string): Promise<PaymentRecord> {
    if (!ORDER_ID_RE.test(orderId))
      throw new PaymentError('BAD_ORDER_ID', 'Invalid order id.', 400);
    const client = this.requireClient();
    const record = (await this.d.store.getByOrderId(orderId)) ?? (await this.adopt(orderId));
    if (record.state === 'CAPTURED' || record.state === 'REFUNDED') return record;
    let order: PayPalOrder;
    try {
      order = await client.captureOrder(orderId, `${record.id}-capture`);
    } catch (err) {
      if (err instanceof PayPalApiError && err.issue === 'ORDER_ALREADY_CAPTURED') {
        order = await client.getOrder(orderId);
      } else {
        const message = err instanceof Error ? err.message : String(err);
        const declined = err instanceof PayPalApiError && err.issue === 'INSTRUMENT_DECLINED';
        // Compare-and-set: if a webhook already moved the payment on, keep its newer state.
        await this.d.store.update(
          record.id,
          {
            state: canTransition(record.state, 'FAILED') ? 'FAILED' : record.state,
            lastError: declined
              ? 'The funding source was declined. Please try again with PayPal.'
              : message,
            updatedAt: new Date(this.d.now()).toISOString(),
          },
          { expectState: record.state },
        );
        await this.d.store.log(record.id, 'capture_failed', { message });
        throw new PaymentError(
          declined ? 'INSTRUMENT_DECLINED' : 'CAPTURE_FAILED',
          declined
            ? 'PayPal declined the funding source. No payment was captured.'
            : 'PayPal capture failed. No payment was confirmed.',
          declined ? 422 : 502,
        );
      }
    }
    return this.apply(record, order, 'capture');
  }

  async cancel(orderId: string): Promise<PaymentRecord | null> {
    if (!ORDER_ID_RE.test(orderId))
      throw new PaymentError('BAD_ORDER_ID', 'Invalid order id.', 400);
    const record = await this.d.store.getByOrderId(orderId);
    if (!record) return null;
    if (!canTransition(record.state, 'CANCELLED') || record.state === 'CANCELLED') return record;
    const next = await this.d.store.update(
      record.id,
      { state: 'CANCELLED', updatedAt: new Date(this.d.now()).toISOString() },
      { expectState: record.state },
    );
    // Lost the race (e.g. captured meanwhile): the newer state stands.
    if (!next) return this.d.store.get(record.id);
    await this.d.store.log(record.id, 'cancelled_by_user', {});
    return next;
  }

  /** Authoritative refresh from PayPal (used by the UI and by the AI's get_payment_status tool). */
  async refresh(idOrOrderId: string): Promise<PaymentRecord> {
    const client = this.requireClient();
    const record = PAYMENT_ID_RE.test(idOrOrderId)
      ? await this.d.store.get(idOrOrderId)
      : ORDER_ID_RE.test(idOrOrderId)
        ? ((await this.d.store.getByOrderId(idOrOrderId)) ?? (await this.adopt(idOrOrderId)))
        : null;
    if (!record) throw new PaymentError('UNKNOWN_PAYMENT', 'Unknown payment.', 404);
    if (!record.paypalOrderId) return record;
    const order = await client.getOrder(record.paypalOrderId);
    return this.apply(record, order, 'refresh');
  }

  async webhook(
    headers: Headers,
    rawBody: string,
  ): Promise<{ status: 'processed' | 'duplicate' | 'ignored'; eventType?: string }> {
    const client = this.requireClient();
    const webhookId = this.d.config.paypal.webhookId;
    if (!webhookId)
      throw new PaymentError('WEBHOOK_NOT_CONFIGURED', 'PAYPAL_WEBHOOK_ID is not configured.', 503);
    if (rawBody.length > 200_000) throw new PaymentError('TOO_LARGE', 'Payload too large.', 400);
    const verified = await client.verifyWebhook(headers, rawBody, webhookId);
    if (!verified)
      throw new PaymentError('BAD_SIGNATURE', 'Webhook signature verification failed.', 401);
    const parsed = WebhookEventSchema.safeParse(JSON.parse(rawBody));
    if (!parsed.success) return { status: 'ignored' };
    const evt = parsed.data;
    const first = await this.d.store.claimWebhook(evt.id, evt.event_type, rawBody.slice(0, 20_000));
    if (!first) return { status: 'duplicate', eventType: evt.event_type };
    // If processing throws, the receipt stays unprocessed and PayPal's retry is handled again.
    const outcome = await this.processWebhook(evt);
    await this.d.store.completeWebhook(evt.id);
    return { status: outcome, eventType: evt.event_type };
  }

  private async processWebhook(evt: WebhookEvent): Promise<'processed' | 'ignored'> {
    const client = this.requireClient();
    const target = WEBHOOK_STATE[evt.event_type];
    if (!target) return 'ignored';
    const orderId = evt.event_type.startsWith('CHECKOUT.')
      ? evt.resource.id
      : evt.resource.supplementary_data?.related_ids?.order_id;
    let record = orderId ? await this.d.store.getByOrderId(orderId) : null;
    if (!record && evt.resource.custom_id && PAYMENT_ID_RE.test(evt.resource.custom_id)) {
      record = await this.d.store.get(evt.resource.custom_id);
    }
    if (!record && orderId && ORDER_ID_RE.test(orderId)) {
      // Not ours, or unknown to PayPal: nothing to do. Anything else (network, database) is
      // transient and must surface so PayPal retries.
      record = await this.adopt(orderId).catch((err: unknown) => {
        if (
          err instanceof PaymentError &&
          (err.code === 'FOREIGN_ORDER' || err.code === 'UNKNOWN_ORDER')
        )
          return null;
        throw err;
      });
    }
    if (!record) return 'ignored';
    if (target === 'REFRESH') {
      if (record.paypalOrderId)
        await this.apply(record, await client.getOrder(record.paypalOrderId), 'webhook');
    } else {
      for (let attempt = 0; attempt < 3 && canTransition(record.state, target); attempt++) {
        const next = await this.d.store.update(
          record.id,
          {
            state: target,
            ...(evt.event_type.startsWith('PAYMENT.CAPTURE.') && evt.resource.id
              ? { captureId: evt.resource.id }
              : {}),
            paypalStatus: evt.resource.status ?? record.paypalStatus,
            updatedAt: new Date(this.d.now()).toISOString(),
          },
          { expectState: record.state },
        );
        if (next) break;
        const fresh = await this.d.store.get(record.id);
        if (!fresh) break;
        record = fresh;
      }
    }
    await this.d.store.log(record.id, 'webhook', { eventId: evt.id, type: evt.event_type, target });
    return 'processed';
  }
}
