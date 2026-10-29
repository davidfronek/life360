import { useQueries } from '@tanstack/react-query';
import type { Member } from './api';
import { fetchRoute, routeKey, type LatLng } from './directions';
import { formatDistance, formatDuration, haversine } from './geo';

export interface Distance {
  straight: number;
  driveDistance: number | null;
  driveDuration: number | null;
  loading: boolean;
}

const pos = (m: Member): LatLng | null => (m.lat !== null && m.lng !== null ? { lat: m.lat, lng: m.lng } : null);

// Vzdálenost každého člena od "mé" polohy (člen Life360 s ID meId): vzdušná čára a trasa autem
export function useDistancesFromMe(members: Member[], meId: string | null, token: string): Record<string, Distance> {
  const me = members.find((m) => m.id === meId);
  const from = me ? pos(me) : null;
  const targets = from
    ? members.filter((m) => m.id !== me!.id && pos(m)).map((m) => ({ id: m.id, to: pos(m)! }))
    : [];

  const routes = useQueries({
    queries: targets.map((t) => ({
      queryKey: routeKey('driving', from, t.to),
      queryFn: () => fetchRoute(token, 'driving', from!, t.to),
      enabled: !!token && haversine(from!, t.to) > 5,
      staleTime: 60_000,
    })),
  });

  const result: Record<string, Distance> = {};
  targets.forEach((t, i) => {
    const r = routes[i]!;
    result[t.id] = {
      straight: haversine(from!, t.to),
      driveDistance: r.data?.distance ?? null,
      driveDuration: r.data?.duration ?? null,
      loading: r.isFetching,
    };
  });
  return result;
}

export function distanceText(d: Distance): string {
  const car =
    d.driveDistance !== null
      ? `${formatDistance(d.driveDistance)} autem (${formatDuration(d.driveDuration!)})`
      : d.loading
        ? 'trasa se počítá…'
        : '';
  return [`${formatDistance(d.straight)} vzdušně`, car].filter(Boolean).join(' · ');
}
