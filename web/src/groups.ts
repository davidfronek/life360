import type { Member, Place } from './api';
import { haversine } from './geo';

export type GroupMode = 'places' | 'countries';

export interface Group {
  key: string;
  kind: 'place' | 'country' | 'elsewhere' | 'unknown';
  title: string;
  place?: Place;
  members: Member[];
}

export function hasPosition(m: Member): m is Member & { lat: number; lng: number } {
  return m.lat !== null && m.lng !== null;
}

// Místo člena: podle údaje z Life360 (placeName), jinak nejmenší uložené místo, ve kterém leží
export function placeOfMember(m: Member, places: Place[]): Place | null {
  if (!hasPosition(m)) return null;
  const byName = m.placeName ? places.find((p) => p.name === m.placeName) : undefined;
  if (byName) return byName;
  let best: Place | null = null;
  for (const p of places) {
    if (haversine(m, p) <= p.radius && (!best || p.radius < best.radius)) best = p;
  }
  return best;
}

export function groupMembers(members: Member[], places: Place[]): Group[] {
  const byPlace = new Map<string, Member[]>();
  const elsewhere: Member[] = [];
  const unknown: Member[] = [];
  for (const m of members) {
    if (!hasPosition(m)) {
      unknown.push(m);
      continue;
    }
    const p = placeOfMember(m, places);
    if (p) byPlace.set(p.id, [...(byPlace.get(p.id) ?? []), m]);
    else elsewhere.push(m);
  }
  const groups: Group[] = places
    .filter((p) => byPlace.has(p.id))
    .map((p) => ({ key: p.id, kind: 'place' as const, title: p.name, place: p, members: byPlace.get(p.id)! }));
  if (elsewhere.length) groups.push({ key: 'elsewhere', kind: 'elsewhere', title: 'Mimo uložená místa', members: elsewhere });
  if (unknown.length) groups.push({ key: 'unknown', kind: 'unknown', title: 'Poloha neznámá', members: unknown });
  return groups;
}

export type Freshness = 'driving' | 'fresh' | 'stale';

export function freshness(m: Member): Freshness {
  if (m.isDriving) return 'driving';
  if (m.ts && Date.now() - new Date(m.ts).getTime() < 30 * 60_000) return 'fresh';
  return 'stale';
}

export function plural(n: number, one: string, few: string, many: string): string {
  if (n === 1) return `${n} ${one}`;
  if (n >= 2 && n <= 4) return `${n} ${few}`;
  return `${n} ${many}`;
}

// Seskupení podle zemí (od nejlidnatějších); členové bez určené země jsou na konci
export function groupByCountry(members: Member[], countries: Record<string, string>): Group[] {
  const by = new Map<string, Member[]>();
  const unknown: Member[] = [];
  for (const m of members) {
    const c = countries[m.id];
    if (!c) unknown.push(m);
    else by.set(c, [...(by.get(c) ?? []), m]);
  }
  const groups: Group[] = [...by.entries()]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'cs'))
    .map(([country, list]) => ({ key: `country:${country}`, kind: 'country' as const, title: country, members: list }));
  if (unknown.length) groups.push({ key: 'unknown', kind: 'unknown', title: 'Poloha neznámá', members: unknown });
  return groups;
}
