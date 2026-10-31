import fs from 'fs';
import path from 'path';
import pool from './database';
import logger from '../utils/logger';
import { initDatabase } from './initDatabase';

// Arbitrary constant shared by every instance: only one of them migrates at a time.
const MIGRATION_LOCK_KEY = 727001;

// 001 (initial schema) and 002 (RBAC) are applied by initDatabase; the numbered
// runner takes over from 003 so existing databases are never replayed.
const FIRST_RUNNER_MIGRATION = 3;

const defaultDir = path.join(__dirname, '../migrations');

/** Serialise a section across instances (several App Runner instances boot together). */
export async function withMigrationLock<T>(fn: () => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
    return await fn();
  } finally {
    try {
      await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]);
    } finally {
      client.release();
    }
  }
}

/**
 * Apply every not-yet-applied `NNN_name.sql` file (NNN >= 003), in order, each in its
 * own transaction, and record it in schema_migrations. Must be called under the lock.
 * A failing migration is rolled back and rethrown so the deployment fails instead of
 * serving traffic against a half-migrated schema.
 */
export async function applyPendingMigrations(dir: string = defaultDir): Promise<string[]> {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       name VARCHAR(255) PRIMARY KEY,
       applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
     )`
  );

  const files = fs
    .readdirSync(dir)
    .filter(f => /^\d{3}_.+\.sql$/.test(f) && parseInt(f.slice(0, 3), 10) >= FIRST_RUNNER_MIGRATION)
    .sort();

  const done = new Set((await pool.query('SELECT name FROM schema_migrations')).rows.map(r => r.name));
  const applied: string[] = [];

  for (const file of files) {
    if (done.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      applied.push(file);
      logger.info(`Migration applied: ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error(`Migration failed and was rolled back: ${file}`, err);
      throw err;
    } finally {
      client.release();
    }
  }
  return applied;
}

/** Startup entry point: base schema + patches, then numbered migrations, under one lock. */
export async function migrate(): Promise<string[]> {
  return withMigrationLock(async () => {
    await initDatabase();
    return applyPendingMigrations();
  });
}
