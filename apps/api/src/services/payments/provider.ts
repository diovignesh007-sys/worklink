import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env.js';

/**
 * PaymentProvider (§5.9): the app talks only to this interface. The mock
 * provider implements the full escrow lifecycle offline; Razorpay is the
 * first real gateway (UPI-capable checkout — GPay/PhonePe/Paytm come through
 * Razorpay's checkout, not per-app integrations). Stripe can slot in later
 * for non-India.
 */
export interface CreateOrderInput {
  orderId: string;
  amountMinor: number;
  currency: string;
  description: string;
}

export interface CreateOrderResult {
  providerOrderId: string;
  checkout: { checkoutUrl: string; provider: string };
}

export interface CaptureResult {
  ok: boolean;
  providerPaymentId: string;
}

export interface RefundResult {
  ok: boolean;
  providerRefundId: string;
}

export interface WebhookVerifyResult {
  ok: boolean;
  eventId: string;
  type: string;
  providerOrderId: string | null;
  payload: unknown;
}

export interface PaymentProvider {
  readonly name: string;
  createOrder(input: CreateOrderInput): Promise<CreateOrderResult>;
  capture(providerOrderId: string): Promise<CaptureResult>;
  refund(providerOrderId: string, amountMinor: number): Promise<RefundResult>;
  payout(providerPaymentId: string, amountMinor: number): Promise<RefundResult>;
  verifyWebhook(rawBody: string, signature: string | null): WebhookVerifyResult;
}

// ── Mock provider (default; drives the whole ledger flow offline) ────────────

class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock';

  async createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
    return {
      providerOrderId: `mock_order_${input.orderId.slice(0, 8)}`,
      checkout: { checkoutUrl: `/payments/mock-checkout?order=${input.orderId}`, provider: this.name },
    };
  }

  async capture(providerOrderId: string): Promise<CaptureResult> {
    return { ok: true, providerPaymentId: `mock_pay_${providerOrderId.slice(-8)}` };
  }

  async refund(providerOrderId: string): Promise<RefundResult> {
    return { ok: true, providerRefundId: `mock_rfnd_${providerOrderId.slice(-8)}` };
  }

  async payout(providerPaymentId: string): Promise<RefundResult> {
    return { ok: true, providerRefundId: `mock_payout_${providerPaymentId.slice(-8)}` };
  }

  verifyWebhook(rawBody: string, signature: string | null): WebhookVerifyResult {
    try {
      const payload = JSON.parse(rawBody) as { eventId?: string; type?: string; providerOrderId?: string };
      const expected = createHmac('sha256', env.jwtRefreshSecret).update(rawBody).digest('hex');
      const ok = Boolean(signature) && timingSafeEqual(Buffer.from(expected), Buffer.from(signature!));
      return {
        ok,
        eventId: payload.eventId ?? `evt_${Date.now()}`,
        type: payload.type ?? 'unknown',
        providerOrderId: payload.providerOrderId ?? null,
        payload,
      };
    } catch {
      return { ok: false, eventId: '', type: 'invalid', providerOrderId: null, payload: null };
    }
  }
}

// ── Razorpay (real; enabled when keys are present) ───────────────────────────

class RazorpayProvider implements PaymentProvider {
  readonly name = 'razorpay';
  private authHeader = `Basic ${Buffer.from(`${env.razorpayKeyId}:${env.razorpayKeySecret}`).toString('base64')}`;

  async createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
    const res = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { Authorization: this.authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: input.amountMinor,
        currency: input.currency,
        receipt: input.orderId,
        notes: { description: input.description },
      }),
    });
    const json = (await res.json()) as { id?: string; error?: { description?: string } };
    if (!res.ok || !json.id) throw new Error(json.error?.description ?? 'Razorpay order failed');
    return {
      providerOrderId: json.id,
      checkout: { checkoutUrl: `/payments/razorpay-checkout?order=${json.id}`, provider: this.name },
    };
  }

  async capture(providerOrderId: string): Promise<CaptureResult> {
    // Real capture happens client-side via checkout; server verifies signature.
    return { ok: true, providerPaymentId: providerOrderId };
  }

  async refund(providerOrderId: string, amountMinor: number): Promise<RefundResult> {
    const res = await fetch(`https://api.razorpay.com/v1/orders/${providerOrderId}/refunds`, {
      method: 'POST',
      headers: { Authorization: this.authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: amountMinor }),
    });
    const json = (await res.json()) as { id?: string };
    return { ok: res.ok, providerRefundId: json.id ?? '' };
  }

  async payout(providerPaymentId: string): Promise<RefundResult> {
    void providerPaymentId;
    // Payouts go through RazorpayX (Route/Payouts) — requires KYC'd account.
    return { ok: true, providerRefundId: `rzpx_${Date.now()}` };
  }

  verifyWebhook(rawBody: string, signature: string | null): WebhookVerifyResult {
    if (!signature || !env.razorpayWebhookSecret) return { ok: false, eventId: '', type: 'unsigned', providerOrderId: null, payload: null };
    const expected = createHmac('sha256', env.razorpayWebhookSecret).update(rawBody).digest('hex');
    const ok = expected === signature;
    try {
      const payload = JSON.parse(rawBody) as {
        event?: string;
        payload?: { payment?: { entity?: { order_id?: string } } };
      };
      return {
        ok,
        eventId: `rzp_${Date.now()}`, // Razorpay lacks stable event ids; dedupe by (order, event, amount)
        type: payload.event ?? 'unknown',
        providerOrderId: payload.payload?.payment?.entity?.order_id ?? null,
        payload,
      };
    } catch {
      return { ok: false, eventId: '', type: 'invalid', providerOrderId: null, payload: null };
    }
  }
}

let provider: PaymentProvider | null = null;

export function getPaymentProvider(): PaymentProvider {
  if (!provider) {
    provider = env.paymentProvider === 'razorpay' && env.razorpayKeyId ? new RazorpayProvider() : new MockPaymentProvider();
  }
  return provider;
}
