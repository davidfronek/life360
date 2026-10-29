import { timingSafeEqual, createHash } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from './config.js';

const COOKIE = 'sid';
const SESSION_TTL_SEC = 7 * 24 * 3600;

function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function checkAccessToken(token: string): boolean {
  return safeEqual(token, config.appAccessToken);
}

export function startSession(reply: FastifyReply): void {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SEC;
  reply.setCookie(COOKIE, String(exp), {
    signed: true,
    httpOnly: true,
    sameSite: 'strict',
    secure: config.secureCookies,
    path: '/',
    maxAge: SESSION_TTL_SEC,
  });
}

export function endSession(reply: FastifyReply): void {
  reply.clearCookie(COOKIE, { path: '/' });
}

export function isAuthenticated(req: FastifyRequest): boolean {
  const raw = req.cookies[COOKIE];
  if (!raw) return false;
  const res = req.unsignCookie(raw);
  if (!res.valid || !res.value) return false;
  return Number(res.value) > Date.now() / 1000;
}

export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!isAuthenticated(req)) {
    await reply.code(401).send({ error: 'Nepřihlášen' });
  }
}

// Jednoduché omezení pokusů o přihlášení podle IP (v paměti)
const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 60_000;

export function loginAllowed(ip: string): boolean {
  const now = Date.now();
  const a = attempts.get(ip);
  if (!a || a.resetAt < now) return true;
  return a.count < MAX_ATTEMPTS;
}

export function recordLoginFailure(ip: string): void {
  const now = Date.now();
  const a = attempts.get(ip);
  if (!a || a.resetAt < now) attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
  else a.count++;
}
