import { useState } from 'react';
import type { Member, Place } from '../api';
import { whereMaps } from '../geocode';
import { formatDistance, haversine } from '../geo';
import { hasPosition, placeOfMember, plural } from '../groups';
import { Avatar } from './MemberList';
import { GlobeIcon, HomeIcon } from './icons';

interface Props {
  places: Place[];
  members: Member[];
  meId: string | null;
  selectedPlaceId: string | null;
  onSelectPlace: (id: string | null) => void;
}

type Mode = 'list' | 'countries';

export function PlaceList({ places, members, meId, selectedPlaceId, onSelectPlace }: Props) {
  const [mode, setMode] = useState<Mode>(() => (localStorage.getItem('placeGroupMode') === 'countries' ? 'countries' : 'list'));
  const changeMode = (m: Mode) => {
    setMode(m);
    localStorage.setItem('placeGroupMode', m);
  };
  const { cities, countries } = whereMaps(places);

  if (places.length === 0) {
    return <p className="empty-note">Zatím žádná místa. Načtou se z Life360 spolu s kruhem.</p>;
  }

  const me = members.find((m) => m.id === meId);
  const inside = new Map<string, Member[]>();
  for (const m of members) {
    const p = placeOfMember(m, places);
    if (p) inside.set(p.id, [...(inside.get(p.id) ?? []), m]);
  }

  const groups: { key: string; title: string; places: Place[] }[] =
    mode === 'countries'
      ? (() => {
          const by = new Map<string, Place[]>();
          const unknown: Place[] = [];
          for (const p of places) {
            const c = countries[p.id];
            if (c) by.set(c, [...(by.get(c) ?? []), p]);
            else unknown.push(p);
          }
          const g = [...by.entries()]
            .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'cs'))
            .map(([country, list]) => ({ key: country, title: country, places: list }));
          if (unknown.length) g.push({ key: '?', title: 'Země neznámá', places: unknown });
          return g;
        })()
      : [{ key: 'all', title: '', places: places }];

  const countryCount = new Set(Object.values(countries)).size;

  const renderPlace = (p: Place) => {
    const here = inside.get(p.id) ?? [];
    return (
      <li
        key={p.id}
        className={p.id === selectedPlaceId ? 'active' : ''}
        onClick={() => onSelectPlace(p.id === selectedPlaceId ? null : p.id)}
      >
        <span className="place-icon">
          <HomeIcon size={20} />
        </span>
        <div className="grow">
          <strong>{p.name}</strong>
          {cities[p.id] && <small className="sub city">{cities[p.id]}</small>}
          <small className="sub">
            poloměr {formatDistance(p.radius)}
            {me && hasPosition(me) && ` · od vás ${formatDistance(haversine(me, p))}`}
          </small>
          <div className="here">
            {here.length === 0 ? (
              <small className="sub">nikdo uvnitř</small>
            ) : (
              <>
                <div className="avatar-stack">
                  {here.map((m) => (
                    <Avatar key={m.id} m={m} size={22} />
                  ))}
                </div>
                <small className="sub">{here.map((m) => m.name.split(' ')[0]).join(', ')}</small>
              </>
            )}
          </div>
        </div>
      </li>
    );
  };

  return (
    <div>
      <div className="summary">
        <span>
          {plural(places.length, 'místo', 'místa', 'míst')}
          {countryCount > 0 && ` · ${plural(countryCount, 'země', 'země', 'zemí')}`}
        </span>
        <div className="seg mini">
          <button className={mode === 'list' ? 'active' : ''} onClick={() => changeMode('list')}>
            Seznam
          </button>
          <button className={mode === 'countries' ? 'active' : ''} onClick={() => changeMode('countries')}>
            Země
          </button>
        </div>
      </div>
      {groups.map((g) => (
        <section key={g.key} className="group">
          {mode === 'countries' && (
            <h4 className="group-title">
              <GlobeIcon size={14} />
              <span>{g.title}</span>
              <em>{g.places.length}</em>
            </h4>
          )}
          <ul className="list">{g.places.map(renderPlace)}</ul>
        </section>
      ))}
    </div>
  );
}