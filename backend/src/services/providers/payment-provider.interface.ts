/**
 * Common abstraction over the mobile-money providers (Wave, Orange Money).
 *
 * Both providers use the same shape of flow: create a hosted checkout, redirect
 * the payer to a provider URL, then receive an asynchronous webhook/callback that
 * confirms (or fails) the payment. Implementations live alongside this file and
 * are selected via `getProvider()` in ./index.
 */

export type ProviderPaymentStatus = 'completed' | 'failed' | 'pending';

export interface CreateCheckoutParams {
  /** Gross amount to collect (integer FCFA — XOF has no minor units). */
  amount: number;
  /** ISO currency code, e.g. "XOF". */
  currency: string;
  /** Our payment_code; echoed back by the provider to correlate the webhook. */
  reference: string;
  /** Where the provider redirects the payer after success. */
  successUrl: string;
  /** Where the provider redirects the payer on cancel/error. */
  errorUrl: string;
}

export interface CheckoutResult {
  /** The provider's session/transaction id. */
  providerSessionId: string;
  /** URL to redirect the payer to in order to pay. */
  redirectUrl: string;
  /** Raw provider response, persisted for debugging. */
  raw?: any;
}

export interface ParsedWebhook {
  /**
   * Our payment_code carried through as the provider reference (Wave). May be
   * absent for providers that correlate by a per-transaction token instead.
   */
  reference?: string;
  /** The provider's transaction id. */
  providerTxnId?: string;
  /**
   * Per-transaction secret used to correlate + authenticate the callback when
   * there is no reference echoed back (Orange `notif_token`). The service looks
   * the payment up by the token it stored at checkout time and compares it.
   */
  token?: string;
  status: ProviderPaymentStatus;
}

export interface PaymentProvider {
  /** Matches the `payment_method` enum value, e.g. "wave" | "orange_money". */
  readonly method: string;

  /** Create a hosted checkout and return the redirect URL. */
  createCheckout(params: CreateCheckoutParams): Promise<CheckoutResult>;

  /**
   * Verify the authenticity of an incoming webhook/callback.
   * @param rawBody the exact raw request body bytes (needed for HMAC)
   * @param headers the request headers
   * @param parsedBody the JSON-parsed body (for token-based schemes)
   */
  verifyWebhook(rawBody: Buffer | string | undefined, headers: any, parsedBody: any): boolean;

  /** Extract the reference, provider txn id, and normalized status. */
  parseWebhook(parsedBody: any): ParsedWebhook;
}
