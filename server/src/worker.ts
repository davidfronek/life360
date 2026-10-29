import { config } from './config.js';
import { query } from './db.js';
import { fillGeoCache } from './geo.js';
import { hub } from './hub.js';
import { getLife360Token, getSnapshot } from './repo.js';
import {
  Life360Error,
  getCircles,
  getMembers,
  getPlaces,
  type L360Member,
} from './life360.js';

type State = 'unconfigured' | 'ok' | 'invalid' | 'error';

export const status: { state: State; lastOkAt: Date | null; message: string } = {
  state: 'unconfigured',
  lastOkAt: null,
  message: '',
};

const LOW_BATTERY_ON = 15;
const LOW_BATTERY_OFF = 20;
const PLACES_EVERY_N_CYCLES = 10;
const INVALID_TOKEN_DELAY_MS = 5 * 60_000;
const MAX_BACKOFF_MS = 10 * 60_000;

let timer: NodeJS.Timeout | undefined;
let running = false;
let stopped = false;
let cycle = 0;
let failures = 0;
let lastCleanup = 0;

export function startWorker(): void {
  stopped = false;
  void loop();
}

export function stopWorker(): void {
  stopped = true;
  if (timer) clearTimeout(timer);
}

// Po uložení nového tokenu spustí okamžitý dotaz
export function triggerPoll(): void {
  if (running || stopped) return;
  if (timer) clearTimeout(timer);
  cycle = 0;
  failures = 0;
  void loop();
}

async function loop(): Promise<void> {
  running = true;
  let delay = config.pollIntervalSec * 1000;
  try {
    const token = await getLife360Token();
    if (!token) {
      status.state = 'unconfigured';
      status.message = 'Life360 token není nastaven';
    } else {
      await pollOnce(token);
      status.state = 'ok';
      status.lastOkAt = new Date();
      status.message = '';
      failures = 0;
    }
  } catch (err) {
    failures++;
    if (err instanceof Life360Error && err.isAuth) {
      status.state = 'invalid';
      status.message = 'Life360 token je neplatný nebo expiroval';
      delay = INVALID_TOKEN_DELAY_MS;
    } else {
      status.state = 'error';
      status.message = (err as Error).message;
      const backoff = Math.min(delay * 2 ** Math.min(failures, 6), MAX_BACKOFF_MS);
      delay = err instanceof Life360Error && err.status === 429
        ? Math.max((err.retryAfterSec ?? 0) * 1000, backoff)
        : backoff;
    }
    console.error(`[worker] ${status.message}; další pokus za ${Math.round(delay / 1000)} s`);
  } finally {
    running = false;
    if (!stopped) timer = setTimeout(() => void loop(), delay);
  }
}

async function pollOnce(token: string): Promise<void> {
  const refreshPlaces = cycle % PLACES_EVERY_N_CYCLES === 0;
  cycle++;

  const circles = await getCircles(token);
  for (const c of circles) {
    await query(
      `INSERT INTO circles (id, name) VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, updated_at = now()`,
      [c.id, c.name],
    );
    if (refreshPlaces) await syncPlaces(token, c.id);
    const members = await getMembers(token, c.id);
    for (const m of members) await processMember(c.id, m);
  }

  // Město a země se doplňují na serveru; selhání geokódování nesmí zastavit stahování poloh
  await fillGeoCache().catch((err) => console.error('[geo]', (err as Error).message));
  hub.emit('snapshot', await getSnapshot());
  await maybeCleanup();
}

async function syncPlaces(token: string, circleId: string): Promise<void> {
  const places = await getPlaces(token, circleId);
  for (const p of places) {
    await query(
      `INSERT INTO places (id, circle_id, name, geom, radius_m)
       VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($5, $4), 4326)::geography, $6)
       ON CONFLICT (id) DO UPDATE
         SET name = EXCLUDED.name, geom = EXCLUDED.geom, radius_m = EXCLUDED.radius_m`,
      [p.id, circleId, p.name, p.lat, p.lng, p.radius],
    );
  }
  await query('DELETE FROM places WHERE circle_id = $1 AND NOT (id = ANY($2::text[]))', [
    circleId,
    places.map((p) => p.id),
  ]);
}

async function processMember(circleId: string, m: L360Member): Promise<void> {
  await query(
    `INSERT INTO members (id, circle_id, first_name, last_name, avatar_url)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id) DO UPDATE
       SET circle_id = EXCLUDED.circle_id, first_name = EXCLUDED.first_name,
           last_name = EXCLUDED.last_name, avatar_url = EXCLUDED.avatar_url, updated_at = now()`,
    [m.id, circleId, m.firstName, m.lastName, m.avatar],
  );

  const l = m.location;
  if (!l) return;

  const inserted = await query(
    `INSERT INTO locations (member_id, ts, geom, accuracy_m, speed, battery, charging, is_driving, place_name)
     VALUES ($1, to_timestamp($2), ST_SetSRID(ST_MakePoint($4, $3), 4326)::geography, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (member_id, ts) DO NOTHING
     RETURNING id`,
    [m.id, l.ts, l.lat, l.lng, l.accuracy, l.speed, l.battery, l.charging, l.isDriving, l.placeName],
  );
  if (!inserted.rowCount) return;

  const prev = (
    await query<{ current_place_id: string | null; low_battery: boolean; last_seen_ts: Date | null }>(
      'SELECT current_place_id, low_battery, last_seen_ts FROM members WHERE id = $1',
      [m.id],
    )
  ).rows[0];

  // Starší (zpožděné) polohy neovlivňují aktuální stav
  if (prev.last_seen_ts && prev.last_seen_ts.getTime() >= l.ts * 1000) return;

  const place = (
    await query<{ id: string; name: string }>(
      `SELECT id, name FROM places
        WHERE circle_id = $1
          AND ST_DWithin(geom, ST_SetSRID(ST_MakePoint($3, $2), 4326)::geography, radius_m)
        ORDER BY radius_m LIMIT 1`,
      [circleId, l.lat, l.lng],
    )
  ).rows[0];
  const newPlaceId = place?.id ?? null;

  let lowBattery = prev.low_battery;
  if (l.battery !== null) {
    if (l.battery <= LOW_BATTERY_ON && !l.charging) lowBattery = true;
    else if (l.battery > LOW_BATTERY_OFF || l.charging) lowBattery = false;
  }

  // První pozorování jen inicializuje stav, aby nevznikaly falešné události
  if (prev.last_seen_ts) {
    if (prev.current_place_id !== newPlaceId) {
      if (prev.current_place_id) {
        await addEvent(m.id, 'leave', prev.current_place_id, l.ts);
      }
      if (place) await addEvent(m.id, 'arrive', place.id, l.ts);
    }
    if (lowBattery && !prev.low_battery) await addEvent(m.id, 'low_battery', null, l.ts);
  }

  await query(
    `UPDATE members SET current_place_id = $2, low_battery = $3, last_seen_ts = to_timestamp($4) WHERE id = $1`,
    [m.id, newPlaceId, lowBattery, l.ts],
  );
}

async function addEvent(memberId: string, type: string, placeId: string | null, ts: number): Promise<void> {
  await query(
    `INSERT INTO events (member_id, type, place_id, place_name, ts)
     VALUES ($1, $2, $3::text, (SELECT name FROM places WHERE id = $3::text), to_timestamp($4))`,
    [memberId, type, placeId, ts],
  );
}

async function maybeCleanup(): Promise<void> {
  if (config.retentionDays <= 0 || Date.now() - lastCleanup < 3_600_000) return;
  lastCleanup = Date.now();
  const r = await query(`DELETE FROM locations WHERE ts < now() - make_interval(days => $1)`, [
    config.retentionDays,
  ]);
  await query(`DELETE FROM events WHERE ts < now() - make_interval(days => $1)`, [config.retentionDays]);
  if (r.rowCount) console.log(`[worker] Smazáno ${r.rowCount} starých poloh`);
}
