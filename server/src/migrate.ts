import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { pool } from './db.js';

export async function migrate(): Promise<void> {
  const client = await pool.connect();
  try {
    // Advisory lock zabrání souběžnému spuštění migrací
    await client.query('SELECT pg_advisory_lock(360360)');
    await client.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         name text PRIMARY KEY,
         applied_at timestamptz NOT NULL DEFAULT now()
       )`,
    );
    const done = new Set(
      (await client.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map((r) => r.name),
    );
    const files = fs.readdirSync(config.migrationsDir).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
      if (done.has(file)) continue;
      const sql = fs.readFileSync(path.join(config.migrationsDir, file), 'utf8');
      console.log(`Aplikuji migraci ${file}`);
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock(360360)').catch(() => undefined);
    client.release();
  }
}

