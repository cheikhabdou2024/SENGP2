import pool from '../config/database';
import { config } from '../config/env';
import logger from '../utils/logger';

/**
 * Business settings an admin can change from the console (table platform_setting).
 * Each one falls back to its environment default when nothing is stored, so the
 * behaviour only changes once an admin saves a value. Reads are cached for a few
 * seconds: a change applies everywhere almost at once without a query per payment.
 */
const TTL_MS = 15_000;
let cache: { at: number; values: Record<string, any> } | null = null;

export const SETTING_KEYS = ['commission_pct', 'insurance_pct', 'min_withdrawal'] as const;
export type SettingKey = typeof SETTING_KEYS[number];

/** Allowed range per setting (inclusive); anything outside is refused when saved. */
export const SETTING_LIMITS: Record<SettingKey, { min: number; max: number; integer?: boolean }> = {
  commission_pct: { min: 0, max: 50 },
  insurance_pct: { min: 0, max: 20 },
  min_withdrawal: { min: 0, max: 10_000_000, integer: true },
};

export function settingDefaults(): Record<SettingKey, number> {
  return {
    commission_pct: config.commissionPct,
    insurance_pct: Number(process.env.INSURANCE_FEE_PERCENTAGE) || 2,
    min_withdrawal: Number(process.env.MIN_WITHDRAWAL_AMOUNT) || 5000,
  };
}

export function invalidateSettingsCache(): void {
  cache = null;
}

async function stored(): Promise<Record<string, any>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.values;
  const values: Record<string, any> = {};
  try {
    const r = await pool.query(`SELECT key, value FROM platform_setting WHERE key = ANY($1)`, [[...SETTING_KEYS]]);
    r.rows.forEach((row: any) => { values[row.key] = row.value; });
  } catch (e) {
    logger.warn(`Could not read platform settings, using defaults: ${(e as Error).message}`);
    return {};
  }
  cache = { at: Date.now(), values };
  return values;
}

/** The effective value of a setting: the stored one if valid, else the default. */
export async function getSetting(key: SettingKey): Promise<number> {
  const v = Number((await stored())[key]);
  const lim = SETTING_LIMITS[key];
  if (Number.isFinite(v) && v >= lim.min && v <= lim.max) return v;
  return settingDefaults()[key];
}
