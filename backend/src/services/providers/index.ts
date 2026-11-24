import { PaymentProvider } from './payment-provider.interface';
import { WaveProvider } from './wave.provider';
import { OrangeProvider } from './orange.provider';
import { StripeProvider } from './stripe.provider';

export * from './payment-provider.interface';

const stripe = new StripeProvider();

const providers: Record<string, PaymentProvider> = {
  wave: new WaveProvider(),
  orange_money: new OrangeProvider(),
  card: stripe,
};

/** Whether card payments (Stripe) can be offered: the API key and the webhook secret are both set. */
export function isCardEnabled(): boolean {
  return stripe.isConfigured();
}

/**
 * Resolve a payment provider by its `payment_method` value.
 * @throws if the method is not supported
 */
export function getProvider(method: string): PaymentProvider {
  const provider = providers[method];
  if (!provider) {
    throw new Error(`Unsupported payment method: ${method}`);
  }
  return provider;
}

/** Resolve a provider by its webhook path segment (`wave` | `orange`). */
export function getProviderByWebhookKey(key: string): PaymentProvider {
  const map: Record<string, string> = { wave: 'wave', orange: 'orange_money', stripe: 'card' };
  const method = map[key];
  if (!method) {
    throw new Error(`Unknown webhook provider: ${key}`);
  }
  return providers[method];
}
