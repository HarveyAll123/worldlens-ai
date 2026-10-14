/**
 * Server-side payment state. The browser never decides whether a payment succeeded.
 * Implementations: in-memory (development/tests) and PostgreSQL on Neon (production; see data/postgres.ts).
 */
import type { PaymentRecord, PaymentState } from '@worldlens/shared';

/** The fields that may change after creation (mirrors the column grants in db/grants.sql). */
export type PaymentPatch = Partial<
  Pick<
    PaymentRecord,
    'paypalOrderId' | 'state' | 'captureId' | 'paypalStatus' | 'lastError' | 'updatedAt'
  >
>;

export type WebhookClaim = 'claimed' | 'in-progress' | 'done';
/** How long a processing attempt may hold a webhook event before another delivery takes over. */
export const WEBHOOK_LEASE_MS = 2 * 60_000;

export interface PaymentStore {
  readonly name: string;
  create(record: PaymentRecord): Promise<void>;
  get(id: string): Promise<PaymentRecord | null>;
  getByOrderId(orderId: string): Promise<PaymentRecord | null>;
  /**
   * Applies `patch`. With `expectState`, only if the stored state is still that value
   * (compare-and-set), so a decision based on a stale read never overwrites a newer state
   * written concurrently by another request or isolate. Returns null if nothing was updated.
   */
  update(
    id: string,
    patch: PaymentPatch,
    opts?: { expectState?: PaymentState },
  ): Promise<PaymentRecord | null>;
  /**
   * Records a webhook delivery and takes a short processing lease on its event id:
   * 'claimed' (process it), 'in-progress' (another delivery holds the lease) or 'done'
   * (already processed to completion — a duplicate).
   */
  claimWebhook(eventId: string, eventType: string, payload: string): Promise<WebhookClaim>;
  /** Marks a claimed webhook event as fully processed. */
  completeWebhook(eventId: string): Promise<void>;
  /** Gives up the lease after a failed attempt, so PayPal's retry is processed. */
  releaseWebhook(eventId: string): Promise<void>;
  log(paymentId: string, kind: string, detail: Record<string, unknown>): Promise<void>;
}

/**
 * Allowed state transitions. CAPTURED/REFUNDED are terminal except CAPTURED → REFUNDED.
 * A late or duplicate event can therefore never downgrade a confirmed payment.
 */
const TRANSITIONS: Record<PaymentState, PaymentState[]> = {
  REVIEW: ['CREATED', 'CANCELLED', 'FAILED'],
  CREATED: ['APPROVED', 'CAPTURED', 'PENDING', 'DECLINED', 'CANCELLED', 'FAILED'],
  APPROVED: ['CAPTURED', 'PENDING', 'DECLINED', 'FAILED', 'CANCELLED'],
  PENDING: ['CAPTURED', 'DECLINED', 'FAILED'],
  CANCELLED: ['APPROVED', 'CAPTURED', 'PENDING'], // a late approval/capture is authoritative
  FAILED: ['CAPTURED', 'PENDING'],
  DECLINED: [],
  CAPTURED: ['REFUNDED'],
  REFUNDED: [],
};

export function canTransition(from: PaymentState, to: PaymentState): boolean {
  return from === to || TRANSITIONS[from].includes(to);
}

export class MemoryPaymentStore implements PaymentStore {
  readonly name = 'memory';
  private records = new Map<string, PaymentRecord>();
  private byOrder = new Map<string, string>();
  private webhooks = new Map<string, { processed: boolean; claimedAt: number | null }>();
  constructor(private readonly now: () => number = Date.now) {}
  readonly events: Array<{ paymentId: string; kind: string; detail: Record<string, unknown> }> = [];

  async create(record: PaymentRecord): Promise<void> {
    this.records.set(record.id, { ...record });
    if (record.paypalOrderId) this.byOrder.set(record.paypalOrderId, record.id);
  }
  async get(id: string): Promise<PaymentRecord | null> {
    const r = this.records.get(id);
    return r ? { ...r } : null;
  }
  async getByOrderId(orderId: string): Promise<PaymentRecord | null> {
    const id = this.byOrder.get(orderId);
    return id ? this.get(id) : null;
  }
  async update(
    id: string,
    patch: PaymentPatch,
    opts: { expectState?: PaymentState } = {},
  ): Promise<PaymentRecord | null> {
    const r = this.records.get(id);
    if (!r || (opts.expectState !== undefined && r.state !== opts.expectState)) return null;
    const next = { ...r, ...patch };
    this.records.set(id, next);
    if (next.paypalOrderId) this.byOrder.set(next.paypalOrderId, id);
    return { ...next };
  }
  async claimWebhook(eventId: string): Promise<WebhookClaim> {
    const w = this.webhooks.get(eventId);
    if (w?.processed) return 'done';
    if (w && w.claimedAt !== null && this.now() - w.claimedAt < WEBHOOK_LEASE_MS)
      return 'in-progress';
    this.webhooks.set(eventId, { processed: false, claimedAt: this.now() });
    return 'claimed';
  }
  async completeWebhook(eventId: string): Promise<void> {
    this.webhooks.set(eventId, { processed: true, claimedAt: null });
  }
  async releaseWebhook(eventId: string): Promise<void> {
    const w = this.webhooks.get(eventId);
    if (w && !w.processed) w.claimedAt = null;
  }
  async log(paymentId: string, kind: string, detail: Record<string, unknown>): Promise<void> {
    this.events.push({ paymentId, kind, detail });
    if (this.events.length > 1000) this.events.shift();
  }
}
