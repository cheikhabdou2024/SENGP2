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
    logger.info('✅ Schema patches applied (phone/password nullable, delivery_token, recipient, mission_assigned)');
  } catch (error) {
    logger.error('❌ Error initializing database:', error);

    // Don't throw error, just log it
    // The app can still start, migrations can be run manually
    logger.warn('⚠️  Please run migrations manually:');
    logger.warn('   sudo -u postgres psql -d sengp_db -f backend/src/migrations/001_initial_schema.sql');
  }
}
