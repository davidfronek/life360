import { useState } from 'react';
import type { Member, Place } from '../api';
import { distanceText, type Distance } from '../distances';
import { initials, timeAgo } from '../geo';
import { freshness, groupByCountry, groupMembers, plural, type GroupMode } from '../groups';
import { Section, useCollapsed } from './Section';
import { BatteryIcon, CarIcon, GlobeIcon, HomeIcon, MapPinIcon } from './icons';

const STATUS_TITLE = { driving: 'Řídí', fresh: 'Aktuální poloha', stale: 'Poloha není aktuální' } as const;

export function Avatar({ m, size = 40 }: { m: Member; size?: number }) {
  const style = { width: size, height: size, fontSize: size * 0.36 };
  return m.avatar ? (
    <img className="avatar" style={style} src={m.avatar} alt="" referrerPolicy="no-referrer" />
  ) : (
    <span className="avatar" style={style}>
      {initials(m.name)}
    </span>
  );
}

interface Props {
  members: Member[];
  places: Place[];
  distances: Record<string, Distance>;
  cities: Record<string, string>;
  countries: Record<string, string>;
  meId: string | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function MemberList({ members, places, distances, cities, countries, meId, selectedId, onSelect }: Props) {
  const [mode, setMode] = useState<GroupMode>(() => (localStorage.getItem('groupMode') === 'countries' ? 'countries' : 'places'));
  const changeMode = (m: GroupMode) => {
    setMode(m);
    localStorage.setItem('groupMode', m);
  };
  const { collapsed, toggle, setAll } = useCollapsed(`members:${mode}`);
  const groups = mode === 'countries' ? groupByCountry(members, countries) : groupMembers(members, places);
  const inPlaces = groupMembers(members, places)
    .filter((g) => g.kind === 'place')
    .reduce((n, g) => n + g.members.length, 0);
  const countryCount = new Set(Object.values(countries)).size;

  if (members.length === 0) {
    return <p className="empty-note">Zatím žádní členové. Nastavte Life360 token.</p>;
  }

  return (
    <div>
      <div className="summary">
        <span>
          {plural(members.length, 'člen', 'členové', 'členů')} ·{' '}
          {mode === 'countries'
            ? plural(countryCount, 'země', 'země', 'zemí')
            : `${inPlaces} na uložených místech`}
        </span>
        <button
          className="link"
          onClick={() => setAll(groups.map((g) => g.key), collapsed.size < groups.length)}
          title="Sbalit nebo rozbalit všechny skupiny"
        >
          {collapsed.size < groups.length ? 'Sbalit vše' : 'Rozbalit vše'}
        </button>
        <div className="seg mini">
          <button className={mode === 'places' ? 'active' : ''} onClick={() => changeMode('places')}>
            Místa
          </button>
          <button className={mode === 'countries' ? 'active' : ''} onClick={() => changeMode('countries')}>
            Země
          </button>
        </div>
      </div>
      {groups.map((g) => (
        <Section
          key={g.key}
          title={g.title}
          count={g.members.length}
          icon={g.kind === 'place' ? <HomeIcon size={14} /> : g.kind === 'country' ? <GlobeIcon size={14} /> : <MapPinIcon size={14} />}
          collapsed={collapsed.has(g.key)}
          onToggle={() => toggle(g.key)}
        >
          <ul className="list">
            {g.members.map((m) => {
              const d = distances[m.id];
              const fr = freshness(m);
              return (
                <li key={m.id} className={m.id === selectedId ? 'active' : ''} onClick={() => onSelect(m.id)}>
                  <div className="avatar-wrap" title={STATUS_TITLE[fr]}>
                    <Avatar m={m} />
                    <span className={`status-dot ${fr}`} />
                  </div>
                  <div className="grow">
                    <div className="name-line">
                      <strong>{m.name}</strong>
                      {m.id === meId && <span className="badge">Já</span>}
                    </div>
                    {cities[m.id] && (
                      <small className="sub city">
                        <MapPinIcon size={12} />
                        {cities[m.id]}
                      </small>
                    )}
                    <small className="sub">
                      {m.isDriving && (
                        <span className="chip driving">
                          <CarIcon size={12} /> Řídí
                        </span>
                      )}
                      {timeAgo(m.ts)}
                    </small>
                    {d && <small className="dist">{distanceText(d)}</small>}
                  </div>
                  {m.battery !== null && (
                    <span className={`battery${m.battery <= 15 ? ' low' : ''}`}>
                      <BatteryIcon level={m.battery} charging={m.charging} size={16} />
                      {m.battery}%
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </Section>
      ))}
    </div>
  );
}
