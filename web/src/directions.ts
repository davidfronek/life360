export type Profile = 'driving' | 'walking' | 'cycling';

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
