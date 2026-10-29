import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import { query } from '../db.js';
import { hub } from '../hub.js';
import { connectLife360 } from '../connect.js';
import {
  deleteLife360Token,
  getLife360Token,
  getMeMemberId,
  getSnapshot,
  setMeMemberId,
  type MemberSnapshot,
} from '../repo.js';
import { status } from '../worker.js';

const MAX_HISTORY_POINTS = 20_000;

function parseDate(v: unknown): Date | null {
  if (typeof v !== 'string') return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function protectedRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/config', async () => ({ mapboxToken: config.mapboxToken }));

  // --- Life360 token ---
  app.get('/api/settings/life360', async () => ({
    configured: (await getLife360Token()) !== null,
    state: status.state,
    message: status.message,
    lastOkAt: status.lastOkAt?.toISOString() ?? null,
    pollIntervalSec: config.pollIntervalSec,
    meMemberId: await getMeMemberId(),
  }));

  app.put<{ Body: { token?: unknown } }>('/api/settings/life360', async (req, reply) => {
    const raw = req.body?.token;
    if (typeof raw !== 'string') return reply.code(400).send({ error: 'Chybí token' });
    const result = await connectLife360(raw);
    if (!result.ok) return reply.code(result.status).send({ error: result.error });
    return { ok: true };
  });

  app.put<{ Body: { memberId?: unknown } }>('/api/settings/me', async (req, reply) => {
    const id = req.body?.memberId;
    if (id === null) {
      await setMeMemberId(null);
      return { ok: true };
    }
    if (typeof id !== 'string') return reply.code(400).send({ error: 'Chybí memberId' });
    const exists = await query('SELECT 1 FROM members WHERE id = $1', [id]);
    if (!exists.rowCount) return reply.code(404).send({ error: 'Člen neexistuje' });
    await setMeMemberId(id);
    return { ok: true };
  });

  app.delete('/api/settings/life360', async () => {
    await deleteLife360Token();
    status.state = 'unconfigured';
    status.message = 'Life360 token není nastaven';
    return { ok: true };
  });

  // --- Data ---
  app.get('/api/circles', async () => {
    const r = await query('SELECT id, name FROM circles ORDER BY name');
    return r.rows;
  });

  app.get<{ Querystring: { circleId?: string } }>('/api/members', async (req) =>
    getSnapshot(req.query.circleId),
  );

  app.get<{ Querystring: { circleId?: string } }>('/api/places', async (req) => {
    const r = await query(
      `SELECT p.id, p.circle_id AS "circleId", p.name, p.radius_m AS radius,
              ST_Y(p.geom::geometry) AS lat, ST_X(p.geom::geometry) AS lng, g.city, g.country
         FROM places p
         LEFT JOIN geo_cache g ON g.lat_r = round(ST_Y(p.geom::geometry)::numeric, 2)
                              AND g.lng_r = round(ST_X(p.geom::geometry)::numeric, 2)
        WHERE ($1::text IS NULL OR p.circle_id = $1) ORDER BY p.name`,
      [req.query.circleId ?? null],
    );
    return r.rows;
  });

  app.get<{ Params: { id: string }; Querystring: { from?: string; to?: string } }>(
    '/api/members/:id/history',
    async (req, reply) => {
      const from = parseDate(req.query.from);
      const to = parseDate(req.query.to);
      if (!from || !to || from >= to) return reply.code(400).send({ error: 'Neplatné období' });
      if (to.getTime() - from.getTime() > 31 * 24 * 3600_000) {
        return reply.code(400).send({ error: 'Maximální období je 31 dní' });
      }
      const points = await query(
        `SELECT ts, ST_Y(geom::geometry) AS lat, ST_X(geom::geometry) AS lng,
                accuracy_m AS accuracy, battery, is_driving AS "isDriving", place_name AS "placeName"
           FROM locations
          WHERE member_id = $1 AND ts >= $2 AND ts < $3
          ORDER BY ts LIMIT ${MAX_HISTORY_POINTS}`,
        [req.params.id, from, to],
      );
      const dist = await query<{ d: number | null }>(
        `SELECT ST_Length(ST_MakeLine(geom::geometry ORDER BY ts)::geography) AS d
           FROM locations WHERE member_id = $1 AND ts >= $2 AND ts < $3`,
        [req.params.id, from, to],
      );
      return { points: points.rows, distanceM: dist.rows[0]?.d ?? 0 };
    },
  );

  app.get<{ Querystring: { limit?: string } }>('/api/events', async (req) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const r = await query(
      `SELECT e.id, e.type, e.ts, e.member_id AS "memberId", e.place_name AS "placeName",
              trim(m.first_name || ' ' || m.last_name) AS "memberName"
         FROM events e JOIN members m ON m.id = e.member_id
        ORDER BY e.ts DESC LIMIT $1`,
      [limit],
    );
    return r.rows;
  });

  // --- Živé polohy (Server-Sent Events) ---
  app.get('/api/stream', (req, reply) => {
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    const send = (snapshot: MemberSnapshot[]) => res.write(`event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`);
    hub.on('snapshot', send);
    const keepAlive = setInterval(() => res.write(': ping\n\n'), 25_000);
    req.raw.on('close', () => {
      clearInterval(keepAlive);
      hub.off('snapshot', send);
    });
    res.write(': connected\n\n');
  });
}
