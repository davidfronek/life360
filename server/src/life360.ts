import https from 'node:https';
import type { IncomingHttpHeaders } from 'node:http';

const BASE_URL = 'https://api-cloudfront.life360.com';
const USER_AGENT = 'com.life360.android.safetymapd/KOKO/23.50.0 android/13';

export class Life360Error extends Error {
  constructor(
    public status: number,
    message: string,
    public retryAfterSec?: number,
    public reason?: string,
  ) {
    super(message);
  }
  get isAuth() {
    return this.status === 401 || this.status === 403;
  }
}

export interface L360Circle {
  id: string;
  name: string;
}

export interface L360Location {
  lat: number;
  lng: number;
  ts: number; // epoch sekundy
  accuracy: number | null;
  speed: number | null;
  battery: number | null;
  charging: boolean | null;
  isDriving: boolean | null;
  placeName: string | null;
}

export interface L360Member {
  id: string;
  firstName: string;
  lastName: string;
  avatar: string | null;
  location: L360Location | null;
}

export interface L360Place {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radius: number;
}

// Life360 vrací čísla i pravdivostní hodnoty často jako řetězce
function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function bool(v: unknown): boolean | null {
  if (v === null || v === undefined || v === '') return null;
  return v === true || v === 1 || v === '1' || v === 'true';
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

interface RawResponse {
  status: number;
  headers: IncomingHttpHeaders;
  body: string;
}

// Používá node:https místo fetch (undici): Cloudflare před Life360 požadavky z fetch blokuje (HTTP 403)
function httpsGet(token: string, path: string): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      BASE_URL + path,
      {
        method: 'GET',
        timeout: 15_000,
        headers: {
          authorization: `Bearer ${token}`,
          accept: 'application/json',
          'user-agent': USER_AGENT,
          'cache-control': 'no-cache',
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (d: Buffer) => chunks.push(d));
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }),
        );
      },
    );
    req.on('timeout', () => req.destroy(new Error('časový limit')));
    req.on('error', reject);
    req.end();
  });
}

async function call(token: string, path: string): Promise<any> {
  let res: RawResponse;
  try {
    res = await httpsGet(token, path);
  } catch (err) {
    throw new Life360Error(0, `Life360 není dostupné: ${(err as Error).message}`);
  }
  if (res.status < 200 || res.status >= 300) {
    const retry = num(res.headers['retry-after']) ?? undefined;
    const reason = /error="([^"]+)"/.exec(String(res.headers['www-authenticate'] ?? ''))?.[1];
    throw new Life360Error(res.status, `Life360 API vrátilo ${res.status}`, retry, reason);
  }
  try {
    return JSON.parse(res.body);
  } catch {
    throw new Life360Error(502, 'Life360 vrátilo neplatnou odpověď');
  }
}
export async function getCircles(token: string): Promise<L360Circle[]> {
  const data = await call(token, '/v4/circles');
  return (data.circles ?? []).map((c: any) => ({ id: String(c.id), name: str(c.name) }));
}

// ID přihlášeného uživatele (shoduje se s ID jeho záznamu mezi členy kruhu)
export async function getMe(token: string): Promise<string | null> {
  const data = await call(token, '/v3/users/me');
  return data?.id ? String(data.id) : null;
}

export async function getMembers(token: string, circleId: string): Promise<L360Member[]> {
  const data = await call(token, `/v3/circles/${encodeURIComponent(circleId)}/members`);
  return (data.members ?? []).map((m: any): L360Member => {
    const l = m.location;
    const lat = num(l?.latitude);
    const lng = num(l?.longitude);
    const ts = num(l?.timestamp);
    return {
      id: String(m.id),
      firstName: str(m.firstName),
      lastName: str(m.lastName),
      avatar: typeof m.avatar === 'string' && m.avatar.startsWith('https://') ? m.avatar : null,
      location:
        lat !== null && lng !== null && ts !== null
          ? {
              lat,
              lng,
              ts,
              accuracy: num(l.accuracy),
              speed: num(l.speed),
              battery: num(l.battery),
              charging: bool(l.charge),
              isDriving: bool(l.isDriving),
              placeName: typeof l.name === 'string' && l.name ? l.name : null,
            }
          : null,
    };
  });
}

export async function getPlaces(token: string, circleId: string): Promise<L360Place[]> {
  const data = await call(token, `/v3/circles/${encodeURIComponent(circleId)}/allplaces`);
  const places: L360Place[] = [];
  for (const p of data.places ?? []) {
    const lat = num(p.latitude);
    const lng = num(p.longitude);
    const radius = num(p.radius);
    if (lat === null || lng === null || radius === null) continue;
    places.push({ id: String(p.id), name: str(p.name), lat, lng, radius });
  }
  return places;
}
