import { PaymentProvider } from './payment-provider.interface';
import { WaveProvider } from './wave.provider';
import { OrangeProvider } from './orange.provider';

export * from './payment-provider.interface';

const providers: Record<string, PaymentProvider> = {
  wave: new WaveProvider(),
  orange_money: new OrangeProvider(),
};

/**
 * Resolve a payment provider by its `payment_method` value.
 * @throws if the method is not supported (e.g. card, which Wave/Orange can't handle)
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
  const map: Record<string, string> = { wave: 'wave', orange: 'orange_money' };
  const method = map[key];
  if (!method) {
    throw new Error(`Unknown webhook provider: ${key}`);
  }
  return providers[method];
}
