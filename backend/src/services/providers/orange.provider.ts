import axios from 'axios';
import logger from '../../utils/logger';
import {
  CheckoutResult,
  CreateCheckoutParams,
  ParsedWebhook,
  PaymentProvider,
} from './payment-provider.interface';

const ORANGE_TOKEN_URL =
  process.env.ORANGE_TOKEN_URL || 'https://api.orange.com/oauth/v3/token';
// Senegal (Sonatel) web-payment endpoint. Override per the merchant's actual creds.
const ORANGE_WEBPAY_URL =
  process.env.ORANGE_WEBPAY_URL ||
  'https://api.orange.com/orange-money-webpay/sn/v1/webpayment';

interface CachedToken {
  token: string;
  expiresAt: number;
}

/**
 * Orange Money Web Payment integration.
 * Docs: https://developer.orange.com/apis/om-webpay
 *
 * Correlation: the callback that Orange POSTs to our notif_url carries the
 * per-transaction `notif_token` (returned at checkout creation) rather than our
 * order id, so we persist that token and match it in the service layer.
 */
export class OrangeProvider implements PaymentProvider {
  readonly method = 'orange_money';
  private static cachedToken: CachedToken | null = null;

  private requireCreds(): { clientId: string; clientSecret: string; merchantKey: string } {
    const clientId = process.env.ORANGE_MONEY_CLIENT_ID;
    const clientSecret = process.env.ORANGE_MONEY_CLIENT_SECRET;
    const merchantKey = process.env.ORANGE_MONEY_MERCHANT_KEY;
    if (!clientId || !clientSecret || !merchantKey) {
      throw new Error('Orange Money credentials are not configured');
    }
    return { clientId, clientSecret, merchantKey };
  }

  /** Fetch (and cache) an OAuth2 client-credentials access token. */
  private async getAccessToken(clientId: string, clientSecret: string): Promise<string> {
    const cached = OrangeProvider.cachedToken;
    if (cached && cached.expiresAt > Date.now() + 30000) {
      return cached.token;
    }

    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const response = await axios.post(
      ORANGE_TOKEN_URL,
      'grant_type=client_credentials',
      {
        headers: {
          Authorization: `Basic ${basic}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        timeout: 15000,
      }
    );

    const token = response.data?.access_token;
    const expiresIn = Number(response.data?.expires_in) || 3600;
    if (!token) {
      throw new Error('Orange Money did not return an access token');
    }

    OrangeProvider.cachedToken = {
      token,
      expiresAt: Date.now() + expiresIn * 1000,
    };
    return token;
  }

  async createCheckout(params: CreateCheckoutParams): Promise<CheckoutResult> {
    const { clientId, clientSecret, merchantKey } = this.requireCreds();
    const accessToken = await this.getAccessToken(clientId, clientSecret);

    const response = await axios.post(
      ORANGE_WEBPAY_URL,
      {
        merchant_key: merchantKey,
        currency: params.currency,
        order_id: params.reference,
        amount: params.amount,
        return_url: params.successUrl,
        cancel_url: params.errorUrl,
        notif_url: process.env.ORANGE_MONEY_CALLBACK_URL,
        lang: 'fr',
        reference: params.reference,
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      }
    );

    const data = response.data;
    if (!data?.payment_url) {
      throw new Error('Orange Money did not return a payment URL');
    }

    return {
      providerSessionId: data.pay_token,
      redirectUrl: data.payment_url,
      // notif_token is persisted by the service and matched on callback.
      raw: { notif_token: data.notif_token, pay_token: data.pay_token, order_id: params.reference },
    };
  }

  /**
   * The genuine authentication is the per-transaction `notif_token` match done in
   * the service (it is a shared secret only we and Orange know). Here we just
   * ensure the callback is well-formed.
   */
  verifyWebhook(_rawBody: Buffer | string | undefined, _headers: any, parsedBody: any): boolean {
    if (!parsedBody?.notif_token) {
      logger.warn('Orange callback missing notif_token');
      return false;
    }
    return true;
  }

  parseWebhook(parsedBody: any): ParsedWebhook {
    const raw: string = String(parsedBody?.status || '').toUpperCase();
    let status: ParsedWebhook['status'] = 'pending';
    if (raw === 'SUCCESS' || raw === 'SUCCESSFUL' || raw === 'COMPLETED') {
      status = 'completed';
    } else if (raw === 'FAILED' || raw === 'FAILURE' || raw === 'EXPIRED' || raw === 'CANCELLED') {
      status = 'failed';
    }

    return {
      reference: parsedBody?.order_id || parsedBody?.reference,
      providerTxnId: parsedBody?.txnid,
      token: parsedBody?.notif_token,
      status,
    };
  }
}
