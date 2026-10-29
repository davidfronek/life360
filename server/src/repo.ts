import { query } from './db.js';
import { decrypt, encrypt } from './crypto.js';

const TOKEN_KEY = 'life360_token';
const ME_KEY = 'me_member_id';

export async function getLife360Token(): Promise<string | null> {
  const r = await query<{ value: string }>('SELECT value FROM settings WHERE key = $1', [TOKEN_KEY]);
  if (!r.rows[0]) return null;
  try {
    return decrypt(r.rows[0].value);
  } catch {
    return null;
  }
}

export async function saveLife360Token(token: string): Promise<void> {
  await query(
    `INSERT INTO settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [TOKEN_KEY, encrypt(token)],
  );
}

export async function deleteLife360Token(): Promise<void> {
  await query('DELETE FROM settings WHERE key = ANY($1::text[])', [[TOKEN_KEY, ME_KEY]]);
}

export async function getMeMemberId(): Promise<string | null> {
  const r = await query<{ value: string }>('SELECT value FROM settings WHERE key = $1', [ME_KEY]);
  return r.rows[0]?.value ?? null;
}

export async function setMeMemberId(id: string | null): Promise<void> {
  if (id === null) {
    await query('DELETE FROM settings WHERE key = $1', [ME_KEY]);
    return;
  }
  await query(
    `INSERT INTO settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [ME_KEY, id],
  );
}

export interface MemberSnapshot {
  id: string;
  circleId: string;
  name: string;
  avatar: string | null;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  battery: number | null;
  charging: boolean | null;
  isDriving: boolean | null;
  placeName: string | null;
  city: string | null;
  country: string | null;
  ts: string | null;
}

export async function getSnapshot(circleId?: string): Promise<MemberSnapshot[]> {
  const r = await query(
    `SELECT m.id, m.circle_id, trim(m.first_name || ' ' || m.last_name) AS name, m.avatar_url,
            l.ts, ST_Y(l.geom::geometry) AS lat, ST_X(l.geom::geometry) AS lng,
            l.accuracy_m, l.battery, l.charging, l.is_driving, l.place_name, g.city, g.country
       FROM members m
       LEFT JOIN LATERAL (
         SELECT * FROM locations WHERE member_id = m.id ORDER BY ts DESC LIMIT 1
       ) l ON true
       LEFT JOIN geo_cache g ON g.lat_r = round(ST_Y(l.geom::geometry)::numeric, 2)
                            AND g.lng_r = round(ST_X(l.geom::geometry)::numeric, 2)
      WHERE ($1::text IS NULL OR m.circle_id = $1)
      ORDER BY name`,
    [circleId ?? null],
  );
  return r.rows.map((x) => ({
    id: x.id,
    circleId: x.circle_id,
    name: x.name,
    avatar: x.avatar_url,
    lat: x.lat,
    lng: x.lng,
    accuracy: x.accuracy_m,
    battery: x.battery,
    charging: x.charging,
    isDriving: x.is_driving,
    placeName: x.place_name,
    city: x.city,
    country: x.country,
    ts: x.ts ? new Date(x.ts).toISOString() : null,
  }));
}
