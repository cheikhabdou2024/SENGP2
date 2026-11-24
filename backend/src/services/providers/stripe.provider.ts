import axios from 'axios';
import crypto from 'crypto';
import logger from '../../utils/logger';
import {
  CheckoutResult,
  CreateCheckoutParams,
  ParsedWebhook,
  PaymentProvider,
} from './payment-provider.interface';

const STRIPE_API_BASE = process.env.STRIPE_API_BASE || 'https://api.stripe.com';

/** Tolerance on the webhook timestamp, against replays (Stripe's own default is 5 minutes). */
const WEBHOOK_TOLERANCE_SECONDS = 300;

/** Languages Stripe Checkout can display; anything else falls back to the payer's browser language. */
const STRIPE_LOCALES = new Set(['de', 'en', 'es', 'fr', 'it', 'ja', 'ko', 'nl', 'pt', 'ru', 'tr', 'zh']);

/**
 * Stripe Checkout (hosted page) for card payments. The card number never reaches
 * our servers: the payer is redirected to a Stripe page, then Stripe calls our
 * webhook. XOF is a zero-decimal currency, so the amount is sent as is.
 * Docs: https://docs.stripe.com/payments/checkout and https://docs.stripe.com/webhooks
 */
export class StripeProvider implements PaymentProvider {
  /** Matches the `payment_method` enum value. */
  readonly method = 'card';

  /** Cards can be offered only when both the API key and the webhook secret are set. */
  isConfigured(): boolean {
    return !!process.env.STRIPE_SECRET_KEY && !!process.env.STRIPE_WEBHOOK_SECRET;
  }

  private requireKey(): string {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error('STRIPE_SECRET_KEY is not configured');
    }
    return key;
  }

  async createCheckout(params: CreateCheckoutParams): Promise<CheckoutResult> {
    const apiKey = this.requireKey();

    const body = new URLSearchParams();
    body.set('mode', 'payment');
    body.set('payment_method_types[0]', 'card');
    body.set('client_reference_id', params.reference);
    body.set('metadata[payment_code]', params.reference);
    body.set('payment_intent_data[metadata][payment_code]', params.reference);
    body.set('success_url', params.successUrl);
    body.set('cancel_url', params.errorUrl);
    body.set('line_items[0][quantity]', '1');
    body.set('line_items[0][price_data][currency]', params.currency.toLowerCase());
    body.set('line_items[0][price_data][unit_amount]', String(Math.round(params.amount)));
    body.set('line_items[0][price_data][product_data][name]', params.description || 'SEN GP');
    if (params.locale && STRIPE_LOCALES.has(params.locale)) {
      body.set('locale', params.locale);
    }

    const response = await axios.post(`${STRIPE_API_BASE}/v1/checkout/sessions`, body.toString(), {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        // One logical attempt = one Stripe session, even if our request is retried.
        'Idempotency-Key': params.reference,
      },
      timeout: 15000,
    });

    const data = response.data;
    if (!data?.url) {
      throw new Error('Stripe did not return a checkout URL');
    }

    return { providerSessionId: data.id, redirectUrl: data.url, raw: { id: data.id, expires_at: data.expires_at } };
  }

  /**
   * Verify the `Stripe-Signature` header (`t=<ts>,v1=<hmac>[,v1=<hmac>]`): the
   * signed payload is `<ts>.<rawBody>`, HMAC-SHA256 with STRIPE_WEBHOOK_SECRET.
   */
  verifyWebhook(rawBody: Buffer | string | undefined, headers: any): boolean {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) {
      logger.error('STRIPE_WEBHOOK_SECRET is not configured; rejecting webhook');
      return false;
    }

    const header = headers['stripe-signature'] || headers['Stripe-Signature'];
    if (!header || rawBody === undefined) {
      return false;
    }

    let timestamp = '';
    const signatures: string[] = [];
    for (const part of String(header).split(',')) {
      const [k, v] = part.split('=');
      if (k?.trim() === 't' && v) timestamp = v.trim();
      if (k?.trim() === 'v1' && v) signatures.push(v.trim());
    }
    if (!timestamp || signatures.length === 0) {
      return false;
    }

    const age = Math.abs(Date.now() / 1000 - Number(timestamp));
    if (!Number.isFinite(age) || age > WEBHOOK_TOLERANCE_SECONDS) {
      return false;
    }

    const payload = `${timestamp}.${typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8')}`;
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');

    return signatures.some(sig => {
      try {
        return sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
      } catch {
        return false;
      }
    });
  }

  parseWebhook(parsedBody: any): ParsedWebhook {
    const type: string = parsedBody?.type || '';
    const obj = parsedBody?.data?.object || {};

    let status: ParsedWebhook['status'] = 'pending';
    if (type === 'checkout.session.completed' || type === 'checkout.session.async_payment_succeeded') {
      // A session can complete before the money is there (delayed methods): wait for "paid".
      status = obj.payment_status === 'paid' ? 'completed' : 'pending';
    } else if (type === 'checkout.session.expired' || type === 'checkout.session.async_payment_failed') {
      status = 'failed';
    }

    const amount = obj.amount_total !== undefined && obj.amount_total !== null ? Number(obj.amount_total) : undefined;

    return {
      reference: obj.client_reference_id || obj.metadata?.payment_code,
      providerTxnId: typeof obj.payment_intent === 'string' ? obj.payment_intent : obj.id,
      amount: Number.isFinite(amount) ? amount : undefined,
      currency: typeof obj.currency === 'string' ? obj.currency.toUpperCase() : undefined,
      status,
    };
  }
}
