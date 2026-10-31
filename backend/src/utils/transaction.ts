import { PoolClient } from 'pg';
import pool from '../config/database';

/**
 * Run `fn` inside a database transaction: COMMIT when it resolves, ROLLBACK and rethrow
 * when it throws, and always release the client.
 */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
