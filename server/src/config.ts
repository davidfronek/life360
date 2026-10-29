import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..', '..');
loadEnv({ path: path.join(ROOT, '.env') });

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Chybí proměnná prostředí ${name} (viz .env.example)`);
  return v;
}

function int(name: string, def: number): number {
  const v = process.env[name];
  if (v === undefined || v === '') return def;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) throw new Error(`${name} musí být nezáporné celé číslo`);
  return n;
}

const sessionSecret = required('SESSION_SECRET');
if (sessionSecret.length < 32) throw new Error('SESSION_SECRET musí mít alespoň 32 znaků');

const appAccessToken = required('APP_ACCESS_TOKEN');
if (appAccessToken.length < 16) throw new Error('APP_ACCESS_TOKEN musí mít alespoň 16 znaků');

const keyHex = required('TOKEN_ENCRYPTION_KEY');
if (!/^[0-9a-fA-F]{64}$/.test(keyHex)) {
  throw new Error('TOKEN_ENCRYPTION_KEY musí být 64 hexadecimálních znaků (32 bajtů)');
}

export const config = {
  host: process.env.HOST || '0.0.0.0',
  port: int('PORT', 3000),
  databaseUrl: required('DATABASE_URL'),
  appAccessToken,
  sessionSecret,
  encryptionKey: Buffer.from(keyHex, 'hex'),
  mapboxToken: process.env.MAPBOX_TOKEN ?? '',
  secureCookies: process.env.SECURE_COOKIES === 'true',
  trustProxy: process.env.TRUST_PROXY === 'true',
  pollIntervalSec: Math.max(15, int('POLL_INTERVAL_SECONDS', 30)),
  retentionDays: int('RETENTION_DAYS', 90),
  webDist: path.join(ROOT, 'web', 'dist'),
  migrationsDir: path.join(ROOT, 'server', 'migrations'),
};
