/**
 * In-process fake of the PayPal REST endpoints WorldLens uses. FOR TESTS ONLY.
 * It is wired in by unit tests and by the Node dev server when WORLDLENS_TEST_PAYPAL_MOCK=1
 * (used by Playwright). It is never part of the Cloudflare Worker build path.
 */
import type { FetchLike } from '../lib/http';

interface FakeOrder {
  id: string;
  status: 'CREATED' | 'APPROVED' | 'COMPLETED';
  amount: { currency_code: string; value: string };
  custom_id: string;
  reference_id: string;
  description: string;
  captureId?: string;
  captureStatus?: string;
  requestIds: Set<string>;
}

export class FakePayPal {
  orders = new Map<string, FakeOrder>();
  calls: Array<{ method: string; path: string }> = [];
  /** Force the next capture to fail with this PayPal issue code. */
  nextCaptureIssue: string | null = null;
  autoApprove = false;
  private seq = 0;

  approve(orderId: string): void {
    const o = this.orders.get(orderId);
    if (o && o.status === 'CREATED') o.status = 'APPROVED';
  }

  private json(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  }

  private view(o: FakeOrder) {
    return {
      id: o.id,
      status: o.status,
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: o.reference_id,
          custom_id: o.custom_id,
          description: o.description,
          amount: o.amount,
          ...(o.captureId
            ? { payments: { captures: [{ id: o.captureId, status: o.captureStatus, amount: o.amount, custom_id: o.custom_id }] } }
            : {}),
        },
      ],
      links: [{ href: `https://www.sandbox.paypal.com/checkoutnow?token=${o.id}`, rel: 'payer-action', method: 'GET' }],
    };
  }

  fetch: FetchLike = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    const method = (init?.method ?? 'GET').toUpperCase();
    this.calls.push({ method, path: url.pathname });
    if (!url.hostname.endsWith('paypal.com')) return new Response('not found', { status: 404 });
    if (url.pathname === '/v1/oauth2/token') return this.json(200, { access_token: 'fake-token', expires_in: 3600 });
    if (url.pathname === '/v1/notifications/verify-webhook-signature') {
      const body = JSON.parse(String(init?.body ?? '{}')) as { transmission_sig?: string };
      return this.json(200, { verification_status: body.transmission_sig === 'valid-signature' ? 'SUCCESS' : 'FAILURE' });
    }
    if (url.pathname === '/v2/checkout/orders' && method === 'POST') {
      const body = JSON.parse(String(init?.body ?? '{}')) as {
        purchase_units: Array<{ amount: FakeOrder['amount']; custom_id: string; reference_id: string; description: string }>;
      };
      const pu = body.purchase_units[0]!;
      const id = `FAKE${String(++this.seq).padStart(6, '0')}ORDER`;
      const o: FakeOrder = {
        id,
        status: this.autoApprove ? 'APPROVED' : 'CREATED',
        amount: pu.amount,
        custom_id: pu.custom_id,
        reference_id: pu.reference_id,
        description: pu.description,
        requestIds: new Set(),
      };
      this.orders.set(id, o);
      return this.json(201, this.view(o));
    }
    const m = /^\/v2\/checkout\/orders\/([A-Z0-9]+)(\/capture)?$/.exec(url.pathname);
    if (m) {
      const o = this.orders.get(m[1]!);
      if (!o) return this.json(404, { name: 'RESOURCE_NOT_FOUND', details: [{ issue: 'INVALID_RESOURCE_ID' }] });
      if (!m[2]) return this.json(200, this.view(o));
      if (this.nextCaptureIssue) {
        const issue = this.nextCaptureIssue;
        this.nextCaptureIssue = null;
        return this.json(422, { name: 'UNPROCESSABLE_ENTITY', details: [{ issue }] });
      }
      if (o.status === 'COMPLETED') return this.json(422, { name: 'UNPROCESSABLE_ENTITY', details: [{ issue: 'ORDER_ALREADY_CAPTURED' }] });
      if (o.status !== 'APPROVED') return this.json(422, { name: 'UNPROCESSABLE_ENTITY', details: [{ issue: 'ORDER_NOT_APPROVED' }] });
      o.status = 'COMPLETED';
      o.captureId = `CAP${o.id}`;
      o.captureStatus = 'COMPLETED';
      return this.json(201, this.view(o));
    }
    return this.json(404, { name: 'NOT_FOUND' });
  };
}
