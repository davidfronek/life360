import { useEffect, useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { Member, Place } from '../api';
import { fetchRoute, routeKey, type LatLng, type Profile } from '../directions';
import { formatDistance, formatDuration, haversine } from '../geo';
import { NAV_APPS, isMobileDevice, navigationUrl, useNavApp } from '../navApps';
import { NavigationIcon } from './icons';

interface Props {
  member: Member;
  members: Member[];
  places: Place[];
  mapboxToken: string;
  meId: string | null;
  onRoute: (geometry: GeoJSON.LineString | null) => void;
}

const PROFILES: { id: Profile; label: string }[] = [
  { id: 'driving', label: 'Auto' },
  { id: 'walking', label: 'Pěšky' },
  { id: 'cycling', label: 'Kolo' },
];

export function RoutePanel({ member, members, places, mapboxToken, meId, onRoute }: Props) {
  const [originKey, setOriginKey] = useState('');
  const [profile, setProfile] = useState<Profile>('driving');
  const [reverse, setReverse] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  const navApp = useNavApp();
  const mobile = isMobileDevice();

  const memberPos: LatLng | null = member.lat !== null && member.lng !== null ? { lat: member.lat, lng: member.lng } : null;

  // "Moje poloha" = poloha člena Life360, kterému patří token (GPS telefonu v aplikaci Life360)
  const me = members.find((m) => m.id === meId && m.id !== member.id && m.lat !== null && m.lng !== null);

  const origin = useMemo<LatLng | null>(() => {
    if (originKey.startsWith('m:')) {
      const m = members.find((x) => x.id === originKey.slice(2));
      return m && m.lat !== null && m.lng !== null ? { lat: m.lat, lng: m.lng } : null;
    }
    if (originKey.startsWith('p:')) {
      const p = places.find((x) => x.id === originKey.slice(2));
      return p ? { lat: p.lat, lng: p.lng } : null;
    }
    return null;
  }, [originKey, members, places]);

  const chooseOrigin = setOriginKey;
  const from = reverse ? memberPos : origin;
  const to = reverse ? origin : memberPos;
  const straight = from && to ? haversine(from, to) : null;

  // Zaokrouhlení souřadnic omezuje počet dotazů na Directions API při drobných změnách polohy
  const route = useQuery({
    queryKey: routeKey(profile, from, to),
    queryFn: () => fetchRoute(mapboxToken, profile, from!, to!),
    enabled: !!from && !!to && !!mapboxToken && straight! > 5,
    staleTime: 60_000,
    // Při přepočtu trasy (pohyb výchozího bodu) zůstane do načtení nové zobrazena stará
    placeholderData: keepPreviousData,
  });

  const routeData = from && to ? route.data : undefined;

  useEffect(() => {
    onRoute(routeData?.geometry ?? null);
  }, [routeData, onRoute]);
  useEffect(() => () => onRoute(null), [onRoute]);

  const others = members.filter((m) => m.id !== member.id && m.id !== me?.id && m.lat !== null && m.lng !== null);
  const dest = to;

  return (
    <div className="route">
      <h4>{mobile ? 'Vzdálenost a navigace' : 'Vzdálenost a trasa'}</h4>
      <label>
        {reverse ? 'Cíl' : 'Výchozí bod'}
        <select value={originKey} onChange={(e) => chooseOrigin(e.target.value)}>
          <option value="">— vyberte —</option>
          {me && <option value={`m:${me.id}`}>Moje poloha ({me.name})</option>}
          {others.length > 0 && (
            <optgroup label="Členové">
              {others.map((m) => (
                <option key={m.id} value={`m:${m.id}`}>
                  {m.name}
                </option>
              ))}
            </optgroup>
          )}
          {places.length > 0 && (
            <optgroup label="Místa">
              {places.map((p) => (
                <option key={p.id} value={`p:${p.id}`}>
                  {p.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </label>

      {/* Na webu bez výchozího bodu nemá typ dopravy ani směr smysl; na mobilu určuje režim navigace */}
      {(originKey || mobile) && (
        <>
        <div className="row">
          <div className="seg">
            {PROFILES.map((p) => (
              <button key={p.id} className={p.id === profile ? 'active' : ''} onClick={() => setProfile(p.id)}>
                {p.label}
              </button>
            ))}
          </div>
          <button className="secondary small" title="Prohodit směr" onClick={() => setReverse((r) => !r)}>
            ⇄
          </button>
        </div>
        <p className="hint">
          Směr: {reverse ? `${member.name} → vybraný bod` : `vybraný bod → ${member.name}`}
        </p>
        </>
      )}

      {!meId && <p className="hint">Pro volbu „Moje poloha“ nastavte v Nastavení, který člen jste vy.</p>}
      {!memberPos && <p className="error">Poloha člena není známá.</p>}

      {straight !== null && (
        <div className="detail-row">
          <span>Vzdušně</span>
          <div>{formatDistance(straight)}</div>
        </div>
      )}
      {route.isFetching && <p className="hint">Počítám trasu…</p>}
      {route.error && <p className="error">{(route.error as Error).message}</p>}
      {routeData === null && <p className="hint">Mezi body nebyla nalezena trasa.</p>}
      {routeData && (
        <>
          <div className="detail-row">
            <span>Po trase</span>
            <div>
              {formatDistance(routeData.distance)} · {formatDuration(routeData.duration)}
            </div>
          </div>
          <button className="link" onClick={() => setShowSteps((s) => !s)}>
            {showSteps ? 'Skrýt pokyny' : 'Zobrazit pokyny k navigaci'}
          </button>
          {showSteps && (
            <ol className="steps">
              {routeData.steps.map((s, i) => (
                <li key={i}>
                  {s.instruction}
                  {s.distance > 0 && <small> · {formatDistance(s.distance)}</small>}
                </li>
              ))}
            </ol>
          )}
        </>
      )}

      {mobile && dest && (
        <a
          className="nav-btn"
          href={navigationUrl(navApp, profile, from, dest)}
          target="_blank"
          rel="noopener noreferrer"
          title={`Otevřít v aplikaci ${NAV_APPS.find((a) => a.id === navApp)!.label}`}
        >
          <NavigationIcon size={16} /> Navigovat
        </a>
      )}
    </div>
  );
}
