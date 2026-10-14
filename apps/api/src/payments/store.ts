/**
 * Server-side payment state. The browser never decides whether a payment succeeded.
 * Implementations: in-memory (development/tests) and Supabase (production; see supabase-store.ts).
 */
import type { PaymentRecord, PaymentState } from '@worldlens/shared';

export interface PaymentStore {
  readonly name: string;
  create(record: PaymentRecord): Promise<void>;
  get(id: string): Promise<PaymentRecord | null>;
  getByOrderId(orderId: string): Promise<PaymentRecord | null>;
  update(id: string, patch: Partial<PaymentRecord>): Promise<PaymentRecord | null>;
  /** Returns false if the webhook event id was already processed (idempotency). */
  markWebhookProcessed(eventId: string, eventType: string, payload: string): Promise<boolean>;
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
  private webhooks = new Set<string>();
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
  async update(id: string, patch: Partial<PaymentRecord>): Promise<PaymentRecord | null> {
    const r = this.records.get(id);
    if (!r) return null;
    const next = { ...r, ...patch };
    this.records.set(id, next);
    if (next.paypalOrderId) this.byOrder.set(next.paypalOrderId, id);
    return { ...next };
  }
  async markWebhookProcessed(eventId: string): Promise<boolean> {
    if (this.webhooks.has(eventId)) return false;
    this.webhooks.add(eventId);
    return true;
  }
  async log(paymentId: string, kind: string, detail: Record<string, unknown>): Promise<void> {
    this.events.push({ paymentId, kind, detail });
    if (this.events.length > 1000) this.events.shift();
  }
}
