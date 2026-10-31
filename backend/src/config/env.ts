import dotenv from 'dotenv';

dotenv.config();

/**
 * Business settings read from the environment, in one place with their defaults.
 * Read lazily (getters) so tests and admin tooling see changes to process.env.
 */
export const config = {
  /** Platform commission, in percent of each mission payment. */
  get commissionPct(): number {
    return Number(process.env.PLATFORM_COMMISSION_PERCENTAGE) || 15;
  },
  /** Currency recorded on payments. */
  get currency(): string {
    return process.env.PAYMENT_CURRENCY || 'XOF';
  },
};
