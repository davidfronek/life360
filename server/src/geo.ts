import anyAscii from 'any-ascii';
import { config } from './config.js';
import { query } from './db.js';

// Povolené jsou latinské znaky včetně rozšířené latiny (české diakritiky) a obecná interpunkce
const NON_LATIN = /[^\u0000-\u024F\u1E00-\u1EFF\u2000-\u206F]/;
const MAX_PER_CYCLE = 40;
const CONCURRENCY = 4;

interface Where {
  city: string | null;
  country: string | null;
}

class RateLimited extends Error {}

async function geocode(lat: number, lng: number, language: string): Promise<Where | null> {
  const url =
    `https://api.mapbox.com/search/geocode/v6/reverse?longitude=${lng}&latitude=${lat}` +
    `&language=${language}&limit=1&access_token=${encodeURIComponent(config.mapboxToken)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (res.status === 429) throw new RateLimited();
  if (!res.ok) throw new Error(`Mapbox ${res.status}`);
  const p = (await res.json()).features?.[0]?.properties;
  if (!p) return null;
  const c = p.context ?? {};
  return {
    city: c.place?.name ?? c.locality?.name ?? c.district?.name ?? c.region?.name ?? null,
    country: c.country?.name ?? null,
  };
}

const isLatin = (w: Where | null) => !w || !NON_LATIN.test(`${w.city ?? ''}${w.country ?? ''}`);

// Výsledek vždy latinkou: nejdřív česky, při jiném písmu anglicky, zbytek transliterací
async function resolveLatin(lat: number, lng: number): Promise<Where | null> {
  let w = await geocode(lat, lng, 'cs');
  if (!isLatin(w)) w = (await geocode(lat, lng, 'en')) ?? w;
  if (!w) return null;
  return { city: w.city ? anyAscii2(w.city) : null, country: w.country ? anyAscii2(w.country) : null };
}

const anyAscii2 = (s: string) => (NON_LATIN.test(s) ? anyAscii(s) : s);

// Doplní město a zemi pro místa a poslední polohy členů, které ještě nejsou v databázi
export async function fillGeoCache(): Promise<void> {
  if (!config.mapboxToken) return;
  const missing = await query<{ lat: number; lng: number }>(
    `WITH pts AS (
       SELECT ST_Y(geom::geometry) AS lat, ST_X(geom::geometry) AS lng FROM places
       UNION ALL
       SELECT ST_Y(l.geom::geometry), ST_X(l.geom::geometry)
         FROM members m
         JOIN LATERAL (SELECT geom FROM locations WHERE member_id = m.id ORDER BY ts DESC LIMIT 1) l ON true
     ), r AS (
       SELECT DISTINCT round(lat::numeric, 2) AS la, round(lng::numeric, 2) AS ln FROM pts
     )
     SELECT r.la::float8 AS lat, r.ln::float8 AS lng
       FROM r LEFT JOIN geo_cache g ON g.lat_r = r.la AND g.lng_r = r.ln
      WHERE g.lat_r IS NULL
      LIMIT ${MAX_PER_CYCLE}`,
  );
  if (!missing.rows.length) return;

  let limited = false;
  const queue = [...missing.rows];
  const worker = async () => {
    for (let p = queue.shift(); p && !limited; p = queue.shift()) {
      try {
        const w = await resolveLatin(p.lat, p.lng);
        // Bez výsledku (např. oceán) se ukládá prázdný záznam, aby se dotaz neopakoval
        await query(
          `INSERT INTO geo_cache (lat_r, lng_r, city, country) VALUES ($1, $2, $3, $4)
           ON CONFLICT (lat_r, lng_r) DO UPDATE SET city = EXCLUDED.city, country = EXCLUDED.country, updated_at = now()`,
          [p.lat, p.lng, w?.city ?? null, w?.country ?? null],
        );
      } catch (err) {
        if (err instanceof RateLimited) limited = true;
        else console.error(`[geo] ${p.lat},${p.lng}: ${(err as Error).message}`);
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  console.log(`[geo] Doplněno ${missing.rows.length - queue.length} lokalit${limited ? ' (limit Mapboxu, pokračuje příště)' : ''}`);
}
