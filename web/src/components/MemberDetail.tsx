import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AppEvent, Member } from '../api';
import type { Distance } from '../distances';
import { formatDistance, formatDuration, timeAgo } from '../geo';
import { reverseAddress } from '../geocode';
import { localTimeAt } from '../localTime';
import { NAV_APPS, isMobileDevice, navigationUrl, useNavApp } from '../navApps';
import type { RouteKind } from '../distances';
import type { RouteInfo } from '../directions';
import {
  BatteryIcon,
  MoonIcon,
  SunIcon,
  CarIcon,
  ChevronIcon,
  CopyIcon,
  CrosshairIcon,
  ExternalLinkIcon,
  HomeIcon,
  MapPinIcon,
  NavigationIcon,
  StraightLineIcon,
  WalkIcon,
  BusIcon,
  BikeIcon,
} from './icons';

const EVENT_LABEL = { arrive: 'Příchod', leave: 'Odchod', low_battery: 'Slabá baterie' } as const;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="detail-row">
      <span>{label}</span>
      <div>{children}</div>
    </div>
  );
}

interface Props {
  member: Member;
  events: AppEvent[];
  mapboxToken: string;
  distance?: Distance;
  city?: string;
  routeKind: RouteKind | null;
  routeInfo: RouteInfo | null;
  routeLoading: boolean;
  onRoute: (kind: RouteKind | null) => void;
}

const MODES = [
  { kind: 'straight', label: 'Vzdušnou čarou', Icon: StraightLineIcon },
  { kind: 'driving', label: 'Autem', Icon: CarIcon },
  { kind: 'walking', label: 'Pěšky', Icon: WalkIcon },
  { kind: 'cycling', label: 'Na kole', Icon: BikeIcon },
  { kind: 'transit', label: 'MHD', Icon: BusIcon },
] as const;

// Obsah tooltipu u vybraného člena na mapě
export function MemberDetail({ member: m, events, mapboxToken, distance, city, routeKind, routeInfo, routeLoading, onRoute }: Props) {
  const navApp = useNavApp();
  const mobile = isMobileDevice();
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const hasPos = m.lat !== null && m.lng !== null;

  // Zaokrouhlení souřadnic omezuje počet dotazů na geokódování při drobných změnách polohy
  const address = useQuery({
    queryKey: ['address', m.lat?.toFixed(4), m.lng?.toFixed(4)],
    queryFn: () => reverseAddress(mapboxToken, m.lat!, m.lng!),
    enabled: hasPos && !!mapboxToken,
    staleTime: Infinity,
  });

  const lt = hasPos ? localTimeAt(m.lat!, m.lng!) : null;
  const coords = hasPos ? `${m.lat!.toFixed(6)}, ${m.lng!.toFixed(6)}` : null;

  async function copy() {
    if (!coords) return;
    await navigator.clipboard.writeText(coords);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const recent = events.filter((e) => e.memberId === m.id).slice(0, 3);

  return (
    <section className="tip">
      <div className="tip-head">
        <h3>{m.name}</h3>
        {m.battery !== null && (
          <span className={`battery${m.battery <= 15 ? ' low' : ''}`} title={m.charging ? 'Nabíjí se' : 'Baterie'}>
            <BatteryIcon level={m.battery} charging={m.charging} />
            {m.battery}%
          </span>
        )}
      </div>

      {city && <p className="tip-line city-line">{city}</p>}
      {hasPos && (
        <p className="tip-line">
          <MapPinIcon />
          <span>
            {address.isPending && address.fetchStatus !== 'idle' && 'Zjišťuji adresu…'}
            {address.data}
            {address.data === null && 'Adresa nenalezena'}
            {address.error && <span className="error">{(address.error as Error).message}</span>}
          </span>
        </p>
      )}
      {distance && (
        <div className="mode-row">
          <div className="modes" role="group" aria-label="Způsob dopravy">
            {MODES.map(({ kind, label, Icon }) => (
              <button
                key={kind}
                className={routeKind === kind ? 'active' : ''}
                onClick={() => onRoute(routeKind === kind ? null : kind)}
                title={`${label} – zobrazit na mapě`}
                aria-pressed={routeKind === kind}
              >
                <Icon size={15} />
              </button>
            ))}
          </div>
          <span className="mode-text">
            {routeKind && routeKind !== 'straight'
              ? routeInfo
                ? routeInfo.summary
                  ? `${formatDuration(routeInfo.duration)} · ${routeInfo.summary}`
                  : `${formatDistance(routeInfo.distance)} · ${formatDuration(routeInfo.duration)}`
                : routeLoading
                  ? 'Hledám…'
                  : 'Trasa nenalezena'
              : `${formatDistance(distance.straight)} vzdušně`}
          </span>
          {mobile && (
            <a
              className="nav-link"
              href={navigationUrl(navApp, routeKind && routeKind !== 'straight' ? routeKind : 'driving', distance.from, distance.to)}
              target="_blank"
              rel="noopener noreferrer"
              title={`Navigovat v aplikaci ${NAV_APPS.find((a) => a.id === navApp)!.label}`}
              aria-label="Navigovat"
            >
              <NavigationIcon size={15} />
            </a>
          )}
        </div>
      )}      <p className="tip-line muted">
        {m.placeName ? <HomeIcon /> : <CrosshairIcon />}
        <span>
          {m.placeName ?? 'Mimo uložená místa'} · {timeAgo(m.ts)}
        </span>
      </p>

      {lt?.differs && (
        <p className="tip-line muted">
          {lt.day ? <SunIcon /> : <MoonIcon />}
          <span>
            Místní čas {lt.time} ({lt.zone})
          </span>
        </p>
      )}

      <button className="link" onClick={() => setOpen((o) => !o)}>
        Podrobnosti
        <ChevronIcon up={open} size={14} />
      </button>

      {open && (
        <>
      {hasPos ? (
        <>
          <Row label="Souřadnice">
            <code>{coords}</code>
            <div className="links">
              <button className="link" onClick={() => void copy()}>
                <CopyIcon size={13} />
                {copied ? 'Zkopírováno' : 'Kopírovat'}
              </button>
              <a href={`https://www.google.com/maps?q=${m.lat},${m.lng}`} target="_blank" rel="noopener noreferrer">
                <ExternalLinkIcon size={13} />
                Google Maps
              </a>
            </div>
          </Row>
          {m.accuracy !== null && <Row label="Přesnost">± {Math.round(m.accuracy)} m</Row>}
        </>
      ) : (
        <p className="hint">Poloha není známá.</p>
      )}

      <Row label="Místo">{m.placeName ?? 'Mimo uložená místa'}</Row>
      <Row label="Stav">{m.isDriving ? 'Řídí' : 'Stojí / pěšky'}</Row>
      {m.battery !== null && m.charging && <Row label="Baterie">{m.battery} % (nabíjí se)</Row>}
      {lt && (
        <Row label="Časové pásmo">
          {lt.zone}, {lt.time}
        </Row>
      )}
      <Row label="Aktualizace">
        {m.ts ? `${new Date(m.ts).toLocaleString('cs-CZ')} (${timeAgo(m.ts)})` : 'neznámo'}
      </Row>

      {recent.length > 0 && (
        <Row label="Poslední události">
          {recent.map((e) => (
            <div key={e.id}>
              {EVENT_LABEL[e.type]}
              {e.type !== 'low_battery' && e.placeName ? ` – ${e.placeName}` : ''}{' '}
              <small>{new Date(e.ts).toLocaleString('cs-CZ')}</small>
            </div>
          ))}
        </Row>
      )}
        </>
      )}
    </section>
  );
}
