import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AppEvent, Member } from '../api';
import type { Distance } from '../distances';
import { formatDistance, formatDuration, timeAgo } from '../geo';
import { reverseAddress } from '../geocode';
import { localTimeAt } from '../localTime';
import { NAV_APPS, isMobileDevice, navigationUrl, useNavApp } from '../navApps';
import type { RouteKind } from '../distances';
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
  onRoute: (kind: RouteKind | null) => void;
}

// Obsah tooltipu u vybraného člena na mapě
export function MemberDetail({ member: m, events, mapboxToken, distance, city, routeKind, onRoute }: Props) {
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
        <p className="tip-line dist">
          <button
            className={`chip${routeKind === 'straight' ? ' active' : ''}`}
            onClick={() => onRoute(routeKind === 'straight' ? null : 'straight')}
            title="Zobrazit vzdušnou čáru na mapě"
          >
            <StraightLineIcon />
            {formatDistance(distance.straight)} vzdušně
          </button>
          {distance.driveDistance !== null && (
            <button
              className={`chip${routeKind === 'drive' ? ' active' : ''}`}
              onClick={() => onRoute(routeKind === 'drive' ? null : 'drive')}
              title="Zobrazit trasu autem na mapě"
            >
              <CarIcon />
              {formatDistance(distance.driveDistance)} · {formatDuration(distance.driveDuration!)}
            </button>
          )}
        </p>
      )}
      {mobile && distance && (
        <a
          className="nav-btn"
          href={navigationUrl(navApp, 'driving', distance.from, distance.to)}
          target="_blank"
          rel="noopener noreferrer"
          title={`Otevřít v aplikaci ${NAV_APPS.find((a) => a.id === navApp)!.label}`}
        >
          <NavigationIcon size={16} /> Navigovat
        </a>
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
