import { useQueries } from '@tanstack/react-query';
import type { Member } from './api';

export type TravelMode = 'walking' | 'cycling' | 'driving' | 'train' | 'plane';

export interface Travel {
  mode: TravelMode;
  kmh: number;
}

export const TRAVEL_LABEL: Record<TravelMode, string> = {
  walking: 'Chůze',
  cycling: 'Kolo',
  driving: 'Auto',
  train: 'Vlak / tramvaj',
  plane: 'Letadlo',
};

// Slovesné vyjádření pro řádek Stav
const TRAVEL_STATE: Record<TravelMode, string> = {
  walking: 'Jde pěšky',
  cycling: 'Jede na kole',
  driving: 'Jede autem',
  train: 'Jede vlakem / tramvají',
  plane: 'Letí',
};

// Poloha starší než tato doba už nic o aktuálním pohybu nevypovídá
const FRESH_MS = 10 * 60_000;
const MS_WALK = 0.8; // ≈ 3 km/h
const MS_CYCLE = 2.8; // ≈ 10 km/h
const MS_DRIVE = 8; // ≈ 29 km/h
const MS_RAIL_CHECK = 5; // ≈ 18 km/h: pod touto rychlostí se kolejnice neověřují
const MS_PLANE = 70; // ≈ 250 km/h

const RAIL_CLASSES = new Set(['major_rail', 'minor_rail', 'light_rail', 'tram', 'service_rail']);
const RAIL_MAX_DISTANCE_M = 8;
const ROAD_CLASSES = new Set([
  'motorway',
  'motorway_link',
  'trunk',
  'trunk_link',
  'primary',
  'primary_link',
  'secondary',
  'secondary_link',
  'tertiary',
  'tertiary_link',
  'street',
  'street_limited',
  'service',
]);

export const isFresh = (m: Member) => !!m.ts && Date.now() - new Date(m.ts).getTime() <= FRESH_MS;

// Co člen právě dělá: cestuje (podle způsobu), stojí (rychlost známá a nulová), nebo se neví
// (poloha je neaktuální, nebo Life360 rychlost neposlalo)
export function stateText(m: Member, travel?: Travel): string {
  if (m.lat === null) return 'Poloha není známá';
  if (travel) return `${TRAVEL_STATE[travel.mode]} · ${travel.kmh} km/h`;
  if (!isFresh(m)) return 'Poloha není aktuální';
  return m.speed === null ? 'Rychlost není známá' : 'Stojí';
}

// Základní určení z rychlosti a příznaku "řídí"; null = člen nikam necestuje
function baseMode(m: Member): TravelMode | null {
  if (!isFresh(m)) return null;
  const v = m.speed ?? 0;
  if (v >= MS_PLANE) return 'plane';
  if (v >= MS_DRIVE || m.isDriving) return 'driving';
  if (v >= MS_CYCLE) return 'cycling';
  if (v >= MS_WALK) return 'walking';
  return null;
}

// Zjistí, zda člen právě jede po kolejích (Mapbox Tilequery nad vrstvou silnic a železnic).
// Kolejnice musí být blíž než nejbližší silnice, aby se auto na přejezdu nebo podél trati nepletlo s vlakem.
async function onRail(token: string, lat: number, lng: number): Promise<boolean> {
  const url =
    `https://api.mapbox.com/v4/mapbox.mapbox-streets-v8/tilequery/${lng},${lat}.json` +
    `?radius=${RAIL_MAX_DISTANCE_M * 2}&layers=road&limit=20&access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url);
  if (!res.ok) return false;
  const features: { properties: { class?: string; tilequery: { distance: number } } }[] =
    (await res.json()).features ?? [];
  const nearest = (classes: Set<string>) =>
    Math.min(...features.filter((f) => classes.has(f.properties.class ?? '')).map((f) => f.properties.tilequery.distance));
  const rail = nearest(RAIL_CLASSES);
  return rail <= RAIL_MAX_DISTANCE_M && rail < nearest(ROAD_CLASSES);
}

// Způsob cestování každého člena, který se právě pohybuje: { memberId: { mode, kmh } }
export function useTravel(members: Member[], token: string): Record<string, Travel> {
  const bases = members.map((m) => ({ m, base: baseMode(m) }));
  const rail = useQueries({
    queries: bases.map(({ m, base }) => ({
      queryKey: ['rail', m.id, m.ts],
      queryFn: () => onRail(token, m.lat!, m.lng!),
      // Ověřuje se jen při rychlosti, kdy může jít o vlak, aby se zbytečně neplýtvalo dotazy
      enabled: !!token && base === 'driving' && (m.speed ?? 0) >= MS_RAIL_CHECK && m.lat !== null && m.lng !== null,
      staleTime: Infinity,
      retry: false,
    })),
  });

  const out: Record<string, Travel> = {};
  bases.forEach(({ m, base }, i) => {
    if (!base) return;
    const mode: TravelMode = base === 'driving' && rail[i]?.data ? 'train' : base;
    out[m.id] = { mode, kmh: Math.round((m.speed ?? 0) * 3.6) };
  });
  return out;
}
