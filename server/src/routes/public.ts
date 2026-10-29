import type { FastifyInstance } from 'fastify';
import {
  checkAccessToken,
  endSession,
  isAuthenticated,
  loginAllowed,
  recordLoginFailure,
  startSession,
} from '../auth.js';
import { pool } from '../db.js';

export async function publicRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/health', async (_req, reply) => {
    try {
      await pool.query('SELECT 1');
      return { ok: true };
    } catch {
      return reply.code(503).send({ ok: false });
    }
  });

  app.get('/api/auth/me', async (req) => ({ authenticated: isAuthenticated(req) }));

  app.post<{ Body: { accessToken?: unknown } }>('/api/auth/login', async (req, reply) => {
    if (!loginAllowed(req.ip)) {
      return reply.code(429).send({ error: 'Příliš mnoho pokusů, zkuste to za minutu' });
    }
    const token = req.body?.accessToken;
    if (typeof token !== 'string' || !checkAccessToken(token)) {
      recordLoginFailure(req.ip);
      return reply.code(401).send({ error: 'Neplatný token' });
    }
    startSession(reply);
    return { ok: true };
  });

  app.post('/api/auth/logout', async (_req, reply) => {
    endSession(reply);
    return { ok: true };
  });
}
