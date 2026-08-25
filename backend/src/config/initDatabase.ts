import pool from './database';
import logger from '../utils/logger';
import fs from 'fs';
import path from 'path';

/**
 * Initialize database tables if they don't exist
 */
export async function initDatabase(): Promise<void> {
  try {
    // Check if tables exist
    const result = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'users'
      );
    `);

    const tablesExist = result.rows[0].exists;

    if (!tablesExist) {
      logger.info('📊 Tables not found. Creating database schema...');

      // Read SQL migration file
      const sqlPath = path.join(__dirname, '../migrations/001_initial_schema.sql');
      const sql = fs.readFileSync(sqlPath, 'utf8');

      // Execute SQL
      await pool.query(sql);

      logger.info('✅ Database schema created successfully!');
    } else {
      logger.info('✅ Database tables already exist');
    }

    // Idempotent schema patches: email/Google auth makes phone + password optional.
    await pool.query('ALTER TABLE users ALTER COLUMN phone DROP NOT NULL');
    await pool.query('ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL');
    // Phase 2: secret token carried by the package QR for proof-of-delivery.
    await pool.query('ALTER TABLE missions ADD COLUMN IF NOT EXISTS delivery_token VARCHAR(64)');
    await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_missions_delivery_token ON missions(delivery_token)');
    // Recipient identity for package-matching at delivery.
    await pool.query('ALTER TABLE missions ADD COLUMN IF NOT EXISTS recipient_name VARCHAR(150)');
    await pool.query('ALTER TABLE missions ADD COLUMN IF NOT EXISTS recipient_phone VARCHAR(30)');
    // National ID card back side (recto = existing identity_document_url).
    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS identity_document_url_back VARCHAR(500)');
    // Admin → GP mission assignment notifications (new enum value; PG12+).
    await pool.query("ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'mission_assigned'");
    // A QR data URL (base64 PNG) is ~3KB — too long for the original VARCHAR(500).
    await pool.query('ALTER TABLE missions ALTER COLUMN qr_code_url TYPE TEXT');
    // Admin confirms the GP's arrival at destination (by WhatsApp call) before the
    // GP is allowed to scan the recipient's QR and deliver.
    await pool.query('ALTER TABLE missions ADD COLUMN IF NOT EXISTS arrival_confirmed BOOLEAN DEFAULT FALSE');
    // Phase 4 (Finance): payout proof on withdrawals + refund tracking on payments.
    await pool.query('ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS payout_proof_url VARCHAR(500)');
    await pool.query('ALTER TABLE payments ADD COLUMN IF NOT EXISTS refund_reason TEXT');
    await pool.query('ALTER TABLE payments ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMP');
    // Phase 5 (Support): claim discussion thread (admin ↔ claimant).
    await pool.query(`CREATE TABLE IF NOT EXISTS claim_messages (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
      sender_id UUID REFERENCES users(id),
      sender_role VARCHAR(20) NOT NULL DEFAULT 'admin',
      message TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_claim_messages_claim ON claim_messages(claim_id)');
    // Phase 7 (Broadcast): Web Push (VAPID) subscriptions — self-hosted, no Firebase.
    await pool.query(`CREATE TABLE IF NOT EXISTS push_subscriptions (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      endpoint TEXT UNIQUE NOT NULL,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subscriptions(user_id)');
    logger.info('✅ Schema patches applied (phone/password nullable, delivery_token, recipient, mission_assigned, qr_code_url TEXT, payout_proof/refund)');

    // Incremental migration files (idempotent — safe to run on every boot).
    try {
      const rbacPath = path.join(__dirname, '../migrations/002_admin_rbac.sql');
      await pool.query(fs.readFileSync(rbacPath, 'utf8'));
      logger.info('✅ RBAC migration (002_admin_rbac) applied');
    } catch (mErr) {
      logger.error('❌ RBAC migration (002_admin_rbac) failed:', mErr);
      logger.warn('⚠️  Admin role features may be unavailable until this is resolved.');
    }
  } catch (error) {
    logger.error('❌ Error initializing database:', error);

    // Don't throw error, just log it
    // The app can still start, migrations can be run manually
    logger.warn('⚠️  Please run migrations manually:');
    logger.warn('   sudo -u postgres psql -d sengp_db -f backend/src/migrations/001_initial_schema.sql');
  }
}
