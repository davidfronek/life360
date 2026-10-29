import { Life360Error, getCircles, getMe } from './life360.js';
import { getLife360Token, saveLife360Token, setMeMemberId } from './repo.js';
import { triggerPoll } from './worker.js';

// Přijme token v různých podobách, v jakých se běžně kopíruje (cookie LIFE360_AUTH_TOKEN z prohlížeče,
// hlavička Authorization, token z Home Assistantu): s prefixem "Bearer", URL-kódovaný, v uvozovkách
export function normalizeToken(raw: string): string {
  let t = raw.trim();
  t = t.replace(/^(?:set-)?cookie:\s*/i, '').replace(/^LIFE360_AUTH_TOKEN\s*=\s*/i, '');
  t = t.replace(/^authorization:\s*/i, '');
  t = t.replace(/^["']|["']$/g, '').replace(/;.*$/, '');
  if (t.includes('%')) {
    try {
      t = decodeURIComponent(t);
    } catch {
      /* ponechá původní hodnotu */
    }
  }
  return t.replace(/^(?:bearer\s+)+/i, '').trim();
}

export type ConnectResult = { ok: true } | { ok: false; status: number; error: string };

// Ověří Life360 token, uloží ho (šifrovaně), určí "kdo jsem" a spustí stahování dat
export async function connectLife360(raw: string): Promise<ConnectResult> {
  const token = normalizeToken(raw);
  if (token.length < 10 || token.length > 4096 || /\s/.test(token)) {
    return { ok: false, status: 400, error: 'Neplatný formát tokenu (token nesmí obsahovat mezery)' };
  }
  try {
    await getCircles(token);
  } catch (err) {
    if (err instanceof Life360Error && err.isAuth) {
      const why =
        err.status === 403
          ? 'HTTP 403 – Life360 odmítl požadavek (token, nebo blokace IP adresy serveru)'
          : `HTTP ${err.status}${err.reason ? `, ${err.reason}` : ''} – token je neplatný nebo expiroval`;
      return {
        ok: false,
        status: 400,
        error: `Life360 token byl odmítnut: ${why}. Délka zadaného tokenu: ${token.length} znaků.`,
      };
    }
    return { ok: false, status: 502, error: (err as Error).message };
  }
  await saveLife360Token(token);
  try {
    await setMeMemberId(await getMe(token));
  } catch {
    await setMeMemberId(null);
  }
  triggerPoll();
  return { ok: true };
}

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

// První spuštění: dokud není uložen žádný Life360 token, smí se z localhostu přihlásit přímo jím
export async function firstRunLoginAllowed(ip: string, trustProxy: boolean): Promise<boolean> {
  return !trustProxy && LOOPBACK.has(ip) && (await getLife360Token()) === null;
}
