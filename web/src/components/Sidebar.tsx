import type { AppEvent, History, Member, Place } from '../api';
import type { Distance } from '../distances';
import { formatDistance } from '../geo';
import { MemberList } from './MemberList';
import { PlaceList } from './PlaceList';
import { RoutePanel } from './RoutePanel';

export type Tab = 'members' | 'places' | 'history' | 'events';

interface Props {
  tab: Tab;
  onTab: (t: Tab) => void;
  members: Member[];
  distances: Record<string, Distance>;
  cities: Record<string, string>;
  countries: Record<string, string>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  selectedPlaceId: string | null;
  onSelectPlace: (id: string | null) => void;
  mapboxToken: string;
  meId: string | null;
  places: Place[];
  onRoute: (geometry: GeoJSON.LineString | null) => void;
  events: AppEvent[];
  history: History | undefined;
  historyLoading: boolean;
  historyError: string | null;
  date: string;
  onDate: (d: string) => void;
}

const EVENT_LABEL = { arrive: 'dorazil(a) na', leave: 'opustil(a)', low_battery: 'má slabou baterii' } as const;

export function Sidebar(p: Props) {
  const selected = p.members.find((m) => m.id === p.selectedId);

  return (
    <aside className="sidebar">
      <nav className="tabs">
        <button className={p.tab === 'members' ? 'active' : ''} onClick={() => p.onTab('members')}>
          Členové
        </button>
        <button className={p.tab === 'places' ? 'active' : ''} onClick={() => p.onTab('places')}>
          Místa
        </button>
        <button className={p.tab === 'history' ? 'active' : ''} onClick={() => p.onTab('history')}>
          Historie
        </button>
        <button className={p.tab === 'events' ? 'active' : ''} onClick={() => p.onTab('events')}>
          Události
        </button>
      </nav>

      {p.tab === 'members' && selected && (
        <section className="detail">
          <div className="detail-head">
            <h3>{selected.name}</h3>
            <button className="secondary small" onClick={() => p.onSelect(null)} aria-label="Zrušit výběr">
              ✕
            </button>
          </div>
          <RoutePanel
            key={selected.id}
            member={selected}
            members={p.members}
            places={p.places}
            mapboxToken={p.mapboxToken}
            meId={p.meId}
            onRoute={p.onRoute}
          />
        </section>
      )}

      {p.tab === 'members' && !p.meId && p.members.length > 0 && (
        <p className="hint pad">Pro zobrazení vzdáleností nastavte v Nastavení, který člen jste vy.</p>
      )}

      {p.tab === 'members' && (
        <MemberList
          members={p.members}
          places={p.places}
          distances={p.distances}
          cities={p.cities}
          countries={p.countries}
          meId={p.meId}
          selectedId={p.selectedId}
          onSelect={p.onSelect}
        />
      )}

      {p.tab === 'places' && (
        <PlaceList
          places={p.places}
          members={p.members}
          meId={p.meId}
          selectedPlaceId={p.selectedPlaceId}
          onSelectPlace={p.onSelectPlace}
        />
      )}

      {p.tab === 'history' && (
        <div className="panel">
          {!selected ? (
            <p className="hint">Vyberte člena v záložce Členové.</p>
          ) : (
            <>
              <h3>{selected.name}</h3>
              <label>
                Den
                <input type="date" value={p.date} onChange={(e) => p.onDate(e.target.value)} />
              </label>
              {p.historyLoading && <p className="hint">Načítám…</p>}
              {p.historyError && <p className="error">{p.historyError}</p>}
              {p.history && (
                <p>
                  {p.history.points.length > 1
                    ? `${p.history.points.length} bodů · ${formatDistance(p.history.distanceM)}`
                    : 'Pro tento den nejsou uložené žádné trasy.'}
                </p>
              )}
            </>
          )}
        </div>
      )}

      {p.tab === 'events' && (
        <ul className="list">
          {p.events.map((e) => (
            <li key={e.id}>
              <div className="grow">
                <strong>{e.memberName}</strong>{' '}
                {EVENT_LABEL[e.type]}
                {e.type !== 'low_battery' && e.placeName ? ` ${e.placeName}` : ''}
                <small>{new Date(e.ts).toLocaleString('cs-CZ')}</small>
              </div>
            </li>
          ))}
          {p.events.length === 0 && <li className="empty">Zatím žádné události.</li>}
        </ul>
      )}
    </aside>
  );
}
