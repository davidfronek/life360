export type MapboxProfile = 'driving' | 'walking' | 'cycling';
export type Profile = MapboxProfile | 'transit';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface RouteStep {
  instruction: string;
  distance: number;
}

export interface RouteResult {
  distance: number;
  duration: number;
  geometry: GeoJSON.LineString;
  steps: RouteStep[];
  // Jen u MHD: přehled linek a přestupů, např. "A → 22 · 1 přestup"
  summary?: string;
}

export interface RouteInfo {
  distance: number;
  duration: number;
  summary?: string;
}

// Zaokrouhlení souřadnic omezuje počet dotazů na Directions API při drobných změnách polohy
export const routeKey = (profile: Profile, from: LatLng | null, to: LatLng | null) =>
  from && to
    ? ['route', profile, from.lat.toFixed(4), from.lng.toFixed(4), to.lat.toFixed(4), to.lng.toFixed(4)]
    : ['route', profile, 'none'];

// Vrací null, pokud mezi body neexistuje trasa
export async function fetchRoute(
  token: string,
  profile: Profile,
  from: LatLng,
  to: LatLng,
): Promise<RouteResult | null> {
  if (profile === 'transit') return fetchTransit(from, to);
  const url =
    `https://api.mapbox.com/directions/v5/mapbox/${profile}/${from.lng},${from.lat};${to.lng},${to.lat}` +
    `?geometries=geojson&overview=full&steps=true&language=cs&access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (data.code === 'NoRoute' || data.code === 'NoSegment') return null;
  if (!res.ok || data.code !== 'Ok') throw new Error(data.message ?? `Výpočet trasy selhal (${res.status})`);
  const route = data.routes[0];
  return {
    distance: route.distance,
    duration: route.duration,
    geometry: route.geometry,
    steps: route.legs.flatMap((l: any) =>
      l.steps.map((s: any) => ({ instruction: s.maneuver.instruction as string, distance: s.distance as number })),
    ),
  };
}

// Dekóduje kódovanou polyline (Google algoritmus) s volitelnou přesností (Transitous používá 6 desetinných míst)
function decodePolyline(str: string, precision: number): [number, number][] {
  const factor = 10 ** precision;
  const out: [number, number][] = [];
  let i = 0, lat = 0, lng = 0;
  while (i < str.length) {
    for (const axis of [0, 1]) {
      let shift = 0, result = 0, b: number;
      do {
        b = str.charCodeAt(i++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const d = result & 1 ? ~(result >> 1) : result >> 1;
      if (axis === 0) lat += d;
      else lng += d;
    }
    out.push([lng / factor, lat / factor]);
  }
  return out;
}

const TRANSIT_API = 'https://api.transitous.org/api/v5/plan';

// MHD: veřejné API Transitous (MOTIS, otevřená jízdní řády GTFS) – bez klíče, CORS povolen.
// Hledá se spojení od aktuálního času; vrací null, pokud žádné není.
async function fetchTransit(from: LatLng, to: LatLng): Promise<RouteResult | null> {
  const url =
    `${TRANSIT_API}?fromPlace=${from.lat},${from.lng}&toPlace=${to.lat},${to.lng}` +
    `&numItineraries=1&language=cs`;
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`Hledání spojení MHD selhalo (${res.status})`);
  const it = (await res.json()).itineraries?.[0];
  if (!it) return null;

  const coords: [number, number][] = [];
  const steps: RouteStep[] = [];
  const lines: string[] = [];
  let distance = 0;
  for (const leg of it.legs ?? []) {
    if (leg.legGeometry?.points) coords.push(...decodePolyline(leg.legGeometry.points, leg.legGeometry.precision ?? 6));
    distance += leg.distance ?? 0;
    const mode = String(leg.mode);
    const walk = mode === 'WALK' || mode === 'BIKE';
    const line = leg.routeShortName || leg.displayName || mode;
    if (!walk) lines.push(String(line));
    steps.push({
      instruction: walk
        ? `Pěšky ${leg.to?.name ? `k ${leg.to.name}` : ''}`.trim()
        : `${line}: ${leg.from?.name ?? ''} → ${leg.to?.name ?? ''}`,
      distance: leg.distance ?? 0,
    });
  }
  if (coords.length < 2) return null;
  const transfers = Math.max(0, lines.length - 1);
  const summary = lines.length
    ? `${lines.join(' → ')}${transfers ? ` · ${transfers} přestup${transfers > 1 ? (transfers < 5 ? 'y' : 'ů') : ''}` : ''}`
    : 'pěšky';
  return {
    distance,
    duration: it.duration,
    geometry: { type: 'LineString', coordinates: coords },
    steps,
    summary,
  };
}