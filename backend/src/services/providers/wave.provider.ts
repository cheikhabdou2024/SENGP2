import axios from 'axios';
import crypto from 'crypto';
import logger from '../../utils/logger';
import {
  CheckoutResult,
  CreateCheckoutParams,
  ParsedWebhook,
  PaymentProvider,
} from './payment-provider.interface';

const WAVE_API_BASE = process.env.WAVE_API_BASE || 'https://api.wave.com';

/**
 * Wave Checkout API integration.
 * Docs: https://docs.wave.com/checkout and https://docs.wave.com/webhook
 */
export class WaveProvider implements PaymentProvider {
  readonly method = 'wave';

  private requireKey(): string {
    const key = process.env.WAVE_API_KEY;
    if (!key) {
      throw new Error('WAVE_API_KEY is not configured');
    }
    return key;
  }

  async createCheckout(params: CreateCheckoutParams): Promise<CheckoutResult> {
    const apiKey = this.requireKey();

    const response = await axios.post(
      `${WAVE_API_BASE}/v1/checkout/sessions`,
      {
        amount: String(params.amount),
        currency: params.currency,
        success_url: params.successUrl,
        error_url: params.errorUrl,
        client_reference: params.reference,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      }
    );

    const data = response.data;

    if (!data?.wave_launch_url) {
      throw new Error('Wave did not return a checkout URL');
    }

    return {
      providerSessionId: data.id,
      redirectUrl: data.wave_launch_url,
      raw: data,
    };
  }

  /**
   * Verify the `Wave-Signature` header (format: `t=<ts>,v1=<hmac>`). The signed
   * payload is `<ts>.<rawBody>` HMAC-SHA256'd with WAVE_API_SECRET.
   */
  verifyWebhook(rawBody: Buffer | string | undefined, headers: any): boolean {
    const secret = process.env.WAVE_API_SECRET;
    if (!secret) {
      logger.error('WAVE_API_SECRET is not configured; rejecting webhook');
      return false;
    }

    const header = headers['wave-signature'] || headers['Wave-Signature'];
    if (!header || rawBody === undefined) {
      return false;
    }

    const parts = String(header)
      .split(',')
      .reduce<Record<string, string>>((acc, part) => {
        const [k, v] = part.split('=');
        if (k && v) acc[k.trim()] = v.trim();
        return acc;
      }, {});

    const timestamp = parts['t'];
    const signature = parts['v1'];
    if (!timestamp || !signature) {
      return false;
    }

    const payload = `${timestamp}.${typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8')}`;
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');

    try {
      return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
    } catch {
      return false;
    }
  }

  parseWebhook(parsedBody: any): ParsedWebhook {
    const type: string = parsedBody?.type || '';
    const obj = parsedBody?.data || {};

    let status: ParsedWebhook['status'] = 'pending';
    if (type.includes('completed') || obj.checkout_status === 'complete' || obj.payment_status === 'succeeded') {
      status = 'completed';
    } else if (type.includes('failed') || type.includes('expired') || obj.checkout_status === 'expired') {
      status = 'failed';
    }

    return {
      reference: obj.client_reference,
      providerTxnId: obj.id,
      status,
    };
  }
}
