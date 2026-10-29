import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type Member } from './api';
import { Login } from './components/Login';
import { MapView, type ColorTheme, type MapStyle } from './components/MapView';
import { PanelIcon } from './components/icons';
import { Settings } from './components/Settings';
import { Sidebar, type Tab } from './components/Sidebar';
import { todayLocal } from './geo';
import { useLightPreset, type LightMode } from './sun';
import { useDistancesFromMe, type RouteKind } from './distances';
import { fetchRoute, routeKey, type RouteInfo } from './directions';
import { whereMaps } from './geocode';

export function App() {
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ['me'], queryFn: api.me });

  if (me.isPending) return <div className="center">Načítám…</div>;
  if (!me.data?.authenticated) {
    return <Login firstRun={me.data?.firstRun ?? false} onSuccess={() => void qc.invalidateQueries({ queryKey: ['me'] })} />;
  }
  return (
    <Main
      onLogout={async () => {
        await api.logout();
        qc.clear();
        void qc.invalidateQueries({ queryKey: ['me'] });
      }}
    />
  );
}

function Main({ onLogout }: { onLogout: () => void }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('members');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);

  // Výběr člena a místa se vzájemně vylučuje
  const selectMember = (id: string | null) => {
    setSelectedId(id);
    setRouteKind(null);
    if (id) setSelectedPlaceId(null);
  };
  const selectPlace = (id: string | null) => {
    setSelectedPlaceId(id);
    if (id) setSelectedId(null);
  };
  const [showSettings, setShowSettings] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebarCollapsed') === '1');
  const toggleSidebar = () => {
    setCollapsed((c) => {
      localStorage.setItem('sidebarCollapsed', c ? '0' : '1');
      return !c;
    });
    // Mapa si po změně šířky přepočítá velikost
    setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
  };
  const [mapStyle, setMapStyle] = useState<MapStyle>('standard');
  const [relief, setRelief] = useState(true);
  const [lightMode, setLightMode] = useState<LightMode>('auto');
  const [colorTheme, setColorTheme] = useState<ColorTheme>(() => (localStorage.getItem('mapTheme') as ColorTheme) || 'vivid');
  const [date, setDate] = useState(todayLocal());
  const [routeKind, setRouteKind] = useState<RouteKind | null>(null);

  const config = useQuery({ queryKey: ['config'], queryFn: api.config });
  const settings = useQuery({ queryKey: ['settings'], queryFn: api.life360Settings });
  const members = useQuery({ queryKey: ['members'], queryFn: api.members });
  const places = useQuery({ queryKey: ['places'], queryFn: api.places, refetchInterval: 5 * 60_000 });
  const events = useQuery({ queryKey: ['events'], queryFn: api.events, refetchInterval: 60_000 });

  // Živé aktualizace ze serveru (SSE); EventSource se po výpadku připojí sám
  useEffect(() => {
    const es = new EventSource('/api/stream');
    es.addEventListener('snapshot', (e) => {
      qc.setQueryData<Member[]>(['members'], JSON.parse((e as MessageEvent).data));
      void qc.invalidateQueries({ queryKey: ['events'] });
    });
    return () => es.close();
  }, [qc]);

  const range = useMemo(() => {
    const from = new Date(`${date}T00:00:00`);
    const to = new Date(from);
    to.setDate(to.getDate() + 1);
    return { from, to };
  }, [date]);

  const historyEnabled = tab === 'history' && selectedId !== null && !Number.isNaN(range.from.getTime());
  const history = useQuery({
    queryKey: ['history', selectedId, date],
    queryFn: () => api.history(selectedId!, range.from, range.to),
    enabled: historyEnabled,
  });

  const ready = config.data?.mapboxToken;
  const { cities, countries } = useMemo(() => whereMaps(members.data ?? []), [members.data]);
  const distances = useDistancesFromMe(members.data ?? [], settings.data?.meMemberId ?? null, ready ?? '');
  // Trasa na mapě: zobrazí se po výběru způsobu dopravy v tooltipu vybraného člena
  const sel = selectedId ? distances[selectedId] : undefined;
  const profile = routeKind && routeKind !== 'straight' ? routeKind : null;
  const routeQ = useQuery({
    queryKey: routeKey(profile ?? 'driving', sel?.from ?? null, sel?.to ?? null),
    queryFn: () => fetchRoute(ready!, profile!, sel!.from, sel!.to),
    enabled: !!profile && !!sel && !!ready,
    staleTime: 60_000,
  });
  const routeData = profile && sel ? routeQ.data : null;
  const geometry = routeData?.geometry ?? null;
  const fromLat = sel?.from.lat, fromLng = sel?.from.lng, toLat = sel?.to.lat, toLng = sel?.to.lng;
  const route = useMemo<GeoJSON.LineString | null>(() => {
    if (!routeKind || fromLat === undefined) return null;
    if (routeKind === 'straight') return { type: 'LineString', coordinates: [[fromLng!, fromLat], [toLng!, toLat!]] };
    return geometry;
  }, [routeKind, geometry, fromLat, fromLng, toLat, toLng]);
  const routeInfo: RouteInfo | null = routeData
    ? { distance: routeData.distance, duration: routeData.duration, summary: routeData.summary }
    : null;
  // Osvětlení mapy se řídí tím, kam se uživatel dívá (střed mapy), takže funguje i pro členy v různých časových pásmech
  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(null);
  const sunSpot = (members.data ?? []).find((m) => m.lat !== null && m.lng !== null);
  const lightPreset = useLightPreset(lightMode, center?.lat ?? sunSpot?.lat ?? 50.08, center?.lng ?? sunSpot?.lng ?? 14.42);
  const onCenterChange = useCallback((lat: number, lng: number) => {
    // Drobné posuny mapy preset nemění, proto se ukládá jen výrazná změna
    setCenter((c) => (c && Math.abs(c.lat - lat) < 0.5 && Math.abs(c.lng - lng) < 0.5 ? c : { lat, lng }));
  }, []);

  return (
    <div className={"layout" + (collapsed ? ' collapsed' : '')}>
      <header className="topbar">
        <strong>Life360</strong>
        <div className="grow" />
        {mapStyle === 'standard' && (
          <select
            value={colorTheme}
            onChange={(e) => {
              setColorTheme(e.target.value as ColorTheme);
              localStorage.setItem('mapTheme', e.target.value);
            }}
            title="Barevné schéma mapy"
          >
            <option value="vivid">Barvy: výrazné</option>
            <option value="default">Barvy: výchozí</option>
            <option value="faded">Barvy: tlumené</option>
            <option value="monochrome">Barvy: černobílé</option>
          </select>
        )}
        {mapStyle === 'standard' && (
          <select value={lightMode} onChange={(e) => setLightMode(e.target.value as LightMode)} title="Denní doba">
            <option value="auto">Čas: automaticky</option>
            <option value="dawn">Svítání</option>
            <option value="day">Den</option>
            <option value="dusk">Soumrak</option>
            <option value="night">Noc</option>
          </select>
        )}
        <select value={mapStyle} onChange={(e) => setMapStyle(e.target.value as MapStyle)}>
          <option value="standard">Standard (den/noc)</option>
          <option value="streets-v12">Ulice</option>
          <option value="dark-v11">Tmavá</option>
          <option value="satellite-streets-v12">Satelit</option>
        </select>
        <button className={relief ? '' : 'secondary'} onClick={() => setRelief((r) => !r)} title="Plastická mapa (3D terén a budovy)">
          3D
        </button>
        <button className="secondary" onClick={() => setShowSettings(true)}>
          Nastavení
        </button>
      </header>

      <Sidebar
        tab={tab}
        onTab={setTab}
        members={members.data ?? []}
        distances={distances}
        cities={cities}
        countries={countries}
        selectedId={selectedId}
        onSelect={selectMember}
        selectedPlaceId={selectedPlaceId}
        onSelectPlace={selectPlace}
        mapboxToken={config.data?.mapboxToken ?? ''}
        meId={settings.data?.meMemberId ?? null}
        places={places.data ?? []}
        events={events.data ?? []}
        history={history.data}
        historyLoading={history.isFetching}
        historyError={history.error ? (history.error as Error).message : null}
        date={date}
        onDate={setDate}
      />

      <main className="map">
        <button
          className="sidebar-toggle"
          onClick={toggleSidebar}
          title={collapsed ? 'Zobrazit seznam' : 'Skrýt seznam'}
          aria-label={collapsed ? 'Zobrazit seznam' : 'Skrýt seznam'}
          aria-expanded={!collapsed}
        >
          <PanelIcon open={!collapsed} size={18} />
          {collapsed && <span>Seznam</span>}
        </button>
        {ready ? (
          <MapView
            token={config.data!.mapboxToken}
            style={mapStyle}
            relief={relief}
            lightPreset={lightPreset}
            colorTheme={colorTheme}
            onCenterChange={onCenterChange}
            members={members.data ?? []}
            places={places.data ?? []}
            selectedId={selectedId}
            onSelect={selectMember}
            selectedPlaceId={selectedPlaceId}
            history={tab === 'history' && history.data ? history.data.points : null}
            route={route}
            routeKind={routeKind}
            routeInfo={routeInfo}
            routeLoading={routeQ.isFetching}
            onRouteKind={setRouteKind}
            events={events.data ?? []}
            distances={distances}
            cities={cities}
          />
        ) : (
          <div className="center">
            {config.isPending ? 'Načítám…' : 'Chybí MAPBOX_TOKEN v konfiguraci serveru.'}
          </div>
        )}
      </main>

      {showSettings && <Settings onClose={() => setShowSettings(false)} onLogout={onLogout} />}
    </div>
  );
}
