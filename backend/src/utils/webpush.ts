import pool from '../config/database';
import logger from '../utils/logger';

// web-push ships no bundled types; use it untyped to avoid TS friction.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const webpush: any = require('web-push');

let vapid: { publicKey: string; privateKey: string } | null = null;

/**
 * Ensure a VAPID keypair exists (self-hosted, no Firebase). Keys are generated
 * once and persisted in platform_setting so they survive restarts, then loaded
 * into web-push. No manual env configuration required.
 */
async function ensureVapid(): Promise<{ publicKey: string; privateKey: string }> {
  if (vapid) return vapid;
  let row = await pool.query(`SELECT value FROM platform_setting WHERE key = 'vapid_keys'`);
  let keys = row.rows[0]?.value;
  if (typeof keys === 'string') { try { keys = JSON.parse(keys); } catch { keys = null; } }
  if (!keys || !keys.publicKey || !keys.privateKey) {
    const generated = webpush.generateVAPIDKeys();
    await pool.query(
      `INSERT INTO platform_setting (key, value) VALUES ('vapid_keys', $1)
       ON CONFLICT (key) DO NOTHING`,
      [JSON.stringify(generated)]
    );
    const re = await pool.query(`SELECT value FROM platform_setting WHERE key = 'vapid_keys'`);
    keys = re.rows[0]?.value;
    if (typeof keys === 'string') { try { keys = JSON.parse(keys); } catch { /* noop */ } }
  }
  vapid = keys;
  const subject = process.env.VAPID_SUBJECT || 'mailto:support@sengp.com';
  webpush.setVapidDetails(subject, vapid!.publicKey, vapid!.privateKey);
  return vapid!;
}

export async function getVapidPublicKey(): Promise<string> {
  const k = await ensureVapid();
  return k.publicKey;
}

/** Upsert a browser push subscription for a user. */
export async function saveSubscription(userId: string, sub: any): Promise<void> {
  if (!sub || !sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) throw new Error('Invalid subscription');
  await pool.query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
    [userId, sub.endpoint, sub.keys.p256dh, sub.keys.auth]
  );
}

export async function removeSubscription(endpoint: string): Promise<void> {
  await pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [endpoint]);
}

/** Send a web-push to every subscription matching a raw users WHERE clause. */
export async function pushToSegment(usersWhere: string, payload: { title: string; body: string; url?: string }): Promise<number> {
  try {
    await ensureVapid();
    const subs = await pool.query(
      `SELECT ps.id, ps.endpoint, ps.p256dh, ps.auth
         FROM push_subscriptions ps JOIN users u ON ps.user_id = u.id
        WHERE ${usersWhere}`
    );
    return await dispatch(subs.rows, payload);
  } catch (e: any) {
    logger.warn('pushToSegment failed: ' + (e.message || e));
    return 0;
  }
}

/** Send a web-push to a set of user ids. */
export async function pushToUserIds(userIds: string[], payload: { title: string; body: string; url?: string }): Promise<number> {
  if (!userIds.length) return 0;
  try {
    await ensureVapid();
    const subs = await pool.query(
      `SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ANY($1::uuid[])`,
      [userIds]
    );
    return await dispatch(subs.rows, payload);
  } catch (e: any) {
    logger.warn('pushToUserIds failed: ' + (e.message || e));
    return 0;
  }
}

async function dispatch(rows: any[], payload: any): Promise<number> {
  let sent = 0;
  const body = JSON.stringify(payload);
  for (const s of rows) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body);
      sent++;
    } catch (e: any) {
      if (e.statusCode === 404 || e.statusCode === 410) {
        await pool.query('DELETE FROM push_subscriptions WHERE id = $1', [s.id]).catch(() => {});
      } else {
        logger.warn('web-push send failed: ' + (e.statusCode || e.message || e));
      }
    }
  }
  return sent;
}
