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
import { config } from '../config.js';
import { connectLife360, firstRunLoginAllowed } from '../connect.js';

export async function publicRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/health', async (_req, reply) => {
    try {
      await pool.query('SELECT 1');
      return { ok: true };
    } catch {
      return reply.code(503).send({ ok: false });
    }
  });

  app.get('/api/auth/me', async (req) => ({
    authenticated: isAuthenticated(req),
    firstRun: await firstRunLoginAllowed(req.ip, config.trustProxy),
  }));

  app.post<{ Body: { accessToken?: unknown } }>('/api/auth/login', async (req, reply) => {
    if (!loginAllowed(req.ip)) {
      return reply.code(429).send({ error: 'Příliš mnoho pokusů, zkuste to za minutu' });
    }
    const token = req.body?.accessToken;
    if (typeof token !== 'string' || !token.trim()) {
      return reply.code(400).send({ error: 'Zadejte token' });
    }
    if (checkAccessToken(token)) {
      startSession(reply);
      return { ok: true };
    }
    // První spuštění na localhostu: místo přístupového tokenu lze zadat přímo Life360 token
    if (await firstRunLoginAllowed(req.ip, config.trustProxy)) {
      const result = await connectLife360(token);
      if (result.ok) {
        startSession(reply);
        return { ok: true, setup: true };
      }
      recordLoginFailure(req.ip);
      return reply.code(401).send({
        error: `${result.error} (Přihlášení do aplikace přístupovým tokenem: hodnota APP_ACCESS_TOKEN z .env.)`,
      });
    }
    recordLoginFailure(req.ip);
    return reply.code(401).send({ error: 'Neplatný přístupový token (hodnota APP_ACCESS_TOKEN z .env)' });
  });

  app.post('/api/auth/logout', async (_req, reply) => {
    endSession(reply);
    return { ok: true };
  });
}
