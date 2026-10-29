import fs from 'node:fs';
import path from 'node:path';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import { config } from './config.js';
import { requireAuth } from './auth.js';
import { pool } from './db.js';
import { migrate } from './migrate.js';
import { publicRoutes } from './routes/public.js';
import { protectedRoutes } from './routes/protected.js';
import { startWorker, stopWorker } from './worker.js';

const app = Fastify({ logger: true, trustProxy: config.trustProxy });

await app.register(cookie, { secret: config.sessionSecret });

app.addHook('onSend', async (_req, reply) => {
  reply.header('x-content-type-options', 'nosniff');
  reply.header('referrer-policy', 'same-origin');
  reply.header('x-frame-options', 'DENY');
});

await app.register(publicRoutes);
await app.register(async (scope) => {
  scope.addHook('onRequest', requireAuth);
  await scope.register(protectedRoutes);
});

// Produkční build frontendu servíruje stejný proces
if (fs.existsSync(path.join(config.webDist, 'index.html'))) {
  await app.register(fastifyStatic, {
    root: config.webDist,
    // index.html se vždy revaliduje, aby prohlížeč po nasazení nepoužil starou verzi; soubory v assets mají hash v názvu
    setHeaders: (res, filePath) => {
      res.header(
        'cache-control',
        filePath.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
      );
    },
  });
  app.setNotFoundHandler((req, reply) => {
    if (req.method === 'GET' && !req.url.startsWith('/api/')) {
      return reply.header('cache-control', 'no-cache').sendFile('index.html');
    }
    return reply.code(404).send({ error: 'Nenalezeno' });
  });
}

await migrate();
await app.listen({ host: config.host, port: config.port });
startWorker();

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    stopWorker();
    await app.close();
    await pool.end();
    process.exit(0);
  });
}
