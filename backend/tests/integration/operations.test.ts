import fs from 'fs';
import os from 'os';
import path from 'path';
import pool from '../../src/config/database';
import { applyPendingMigrations, migrate, withMigrationLock } from '../../src/config/migrate';
import { api, closeDatabase, setupDatabase } from './helpers';

beforeAll(setupDatabase);
afterAll(async () => {
  await pool.query('DROP TABLE IF EXISTS lot4_probe, lot4_never');
  await closeDatabase();
});

function tempMigrations(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sengp-mig-'));
  for (const [name, sql] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), sql);
  return dir;
}

describe('sondes de santé', () => {
  it('/health répond sans toucher la base', async () => {
    expect((await api().get('/health')).status).toBe(200);
  });

  it('/health/ready confirme que la base répond', async () => {
    const res = await api().get('/health/ready');
    expect(res.status).toBe(200);
    expect(res.body.database).toBe('up');
  });
});

describe('moteur de migrations', () => {
  beforeEach(async () => {
    await pool.query('DROP TABLE IF EXISTS lot4_probe, lot4_never');
    await pool.query(`DELETE FROM schema_migrations WHERE name LIKE '9%'`).catch(() => undefined);
  });

  it('applique chaque fichier une seule fois, dans l\'ordre, et ignore 001/002', async () => {
    const dir = tempMigrations({
      '001_ignored.sql': 'CREATE TABLE lot4_never (id int);',
      '901_create.sql': 'CREATE TABLE lot4_probe (id int);',
      '902_insert.sql': 'INSERT INTO lot4_probe VALUES (1);',
    });

    expect(await applyPendingMigrations(dir)).toEqual(['901_create.sql', '902_insert.sql']);
    expect(await applyPendingMigrations(dir)).toEqual([]);

    const rows = await pool.query('SELECT count(*)::int AS n FROM lot4_probe');
    expect(rows.rows[0].n).toBe(1);
    expect((await pool.query(`SELECT to_regclass('public.lot4_never') AS t`)).rows[0].t).toBeNull();
  });

  it('annule une migration en échec et lève une erreur', async () => {
    const dir = tempMigrations({
      '903_bad.sql': 'CREATE TABLE lot4_probe (id int); SELECT * FROM table_inexistante;',
    });

    await expect(applyPendingMigrations(dir)).rejects.toThrow();
    expect((await pool.query(`SELECT to_regclass('public.lot4_probe') AS t`)).rows[0].t).toBeNull();
    const recorded = await pool.query(`SELECT 1 FROM schema_migrations WHERE name = '903_bad.sql'`);
    expect(recorded.rows).toHaveLength(0);
  });

  it('sérialise deux démarrages simultanés (verrou consultatif)', async () => {
    const order: string[] = [];
    const slow = withMigrationLock(async () => {
      order.push('a:start');
      await new Promise(r => setTimeout(r, 300));
      order.push('a:end');
    });
    await new Promise(r => setTimeout(r, 50));
    const fast = withMigrationLock(async () => {
      order.push('b:start');
    });
    await Promise.all([slow, fast]);
    expect(order).toEqual(['a:start', 'a:end', 'b:start']);
  });

  it('migrate() est rejouable sans effet sur une base déjà à jour', async () => {
    await expect(migrate()).resolves.toEqual([]);
    await expect(migrate()).resolves.toEqual([]);
  });
});
