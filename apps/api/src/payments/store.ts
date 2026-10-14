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
   * Records a webhook delivery. Returns false only if the same event id was already
   * processed to completion (idempotency); a delivery whose processing failed can be retried.
   */
  claimWebhook(eventId: string, eventType: string, payload: string): Promise<boolean>;
  /** Marks a claimed webhook event as fully processed. */
  completeWebhook(eventId: string): Promise<void>;
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
  /** event id → processed to completion */
  private webhooks = new Map<string, boolean>();
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
  async claimWebhook(eventId: string): Promise<boolean> {
    if (this.webhooks.get(eventId)) return false;
    this.webhooks.set(eventId, false);
    return true;
  }
  async completeWebhook(eventId: string): Promise<void> {
    this.webhooks.set(eventId, true);
  }
  async log(paymentId: string, kind: string, detail: Record<string, unknown>): Promise<void> {
    this.events.push({ paymentId, kind, detail });
    if (this.events.length > 1000) this.events.shift();
  }
}
