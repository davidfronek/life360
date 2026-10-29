// Povolené jsou latinské znaky včetně rozšířené latiny (české diakritiky) a obecná interpunkce
const NON_LATIN = /[^\u0000-\u024F\u1E00-\u1EFF\u2000-\u206F]/;

interface GeoProps {
  full_address?: string;
  name?: string;
  place_formatted?: string;
}

async function geocode(token: string, lat: number, lng: number, language: string): Promise<GeoProps | null> {
  const url =
    `https://api.mapbox.com/search/geocode/v6/reverse?longitude=${lng}&latitude=${lat}` +
    `&language=${language}&limit=1&access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Geokódování selhalo (${res.status})`);
  return (await res.json()).features?.[0]?.properties ?? null;
}

async function toLatin(text: string): Promise<string> {
  if (!NON_LATIN.test(text)) return text;
  const { default: anyAscii } = await import('any-ascii');
  return anyAscii(text);
}

// Výsledek vždy latinkou: nejdřív česky, při jiném písmu anglicky, zbytek se přepíše transliterací
async function latinResult(
  token: string,
  lat: number,
  lng: number,
  pick: (p: GeoProps) => string | null,
): Promise<string | null> {
  const cs = await geocode(token, lat, lng, 'cs');
  let text = cs ? pick(cs) : null;
  if (text && NON_LATIN.test(text)) {
    const en = await geocode(token, lat, lng, 'en');
    text = (en ? pick(en) : null) ?? text;
  }
  return text ? toLatin(text) : null;
}

export function reverseAddress(token: string, lat: number, lng: number): Promise<string | null> {
  return latinResult(token, lat, lng, (p) => p.full_address ?? [p.name, p.place_formatted].filter(Boolean).join(', '));
}

// Město a země určuje server (tabulka geo_cache); tady se jen skládají texty a mapy pro seznamy
export interface Located {
  id: string;
  city: string | null;
  country: string | null;
}

export function whereMaps(items: Located[]): { cities: Record<string, string>; countries: Record<string, string> } {
  const cities: Record<string, string> = {};
  const countries: Record<string, string> = {};
  for (const it of items) {
    const text = [it.city, it.country].filter(Boolean).join(', ');
    if (text) cities[it.id] = text;
    if (it.country) countries[it.id] = it.country;
  }
  return { cities, countries };
}
