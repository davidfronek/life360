import { useEffect, useMemo, useRef, useState } from 'react';
import MapGL, { Layer, Marker, Popup, Source, type MapRef } from 'react-map-gl/mapbox';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { AppEvent, HistoryPoint, Member, Place } from '../api';
import type { Distance, RouteKind } from '../distances';
import { circlePolygon, formatDistance, initials } from '../geo';
import type { LightPreset } from '../sun';
import { MemberDetail } from './MemberDetail';
import { CarIcon, UsersIcon } from './icons';

// Výchozí náklon mapy ve 3D režimu (stupně)
const RELIEF_PITCH = 65;
// Převýšení terénu (1 = skutečné); vyšší hodnota zvýrazní reliéf
const TERRAIN_EXAGGERATION = 2;

export type ColorTheme = 'vivid' | 'default' | 'faded' | 'monochrome';

// Barvy Mapbox Standard: výchozí hodnoty stylu a výraznější paleta
const DEFAULT_COLORS: Record<string, string> = {
  colorGreenspace: 'hsl(115, 60%, 84%)',
  colorWater: 'hsl(200, 100%, 80%)',
  colorLand: 'hsl(20, 20%, 95%)',
  colorBuildings: 'hsl(40, 43%, 93%)',
  colorMotorways: 'hsl(214, 23%, 70%)',
  colorTrunks: 'hsl(235, 20%, 70%)',
  colorRoads: 'hsl(224, 25%, 80%)',
  colorCommercial: 'hsla(24, 100%, 94%, 1)',
};
const VIVID_COLORS: Record<string, string> = {
  colorGreenspace: 'hsl(122, 50%, 66%)',
  colorWater: 'hsl(205, 85%, 62%)',
  colorLand: 'hsl(42, 35%, 95%)',
  colorBuildings: 'hsl(28, 30%, 86%)',
  colorMotorways: 'hsl(18, 90%, 62%)',
  colorTrunks: 'hsl(38, 92%, 58%)',
  colorRoads: 'hsl(0, 0%, 100%)',
  colorCommercial: 'hsl(35, 85%, 88%)',
};

export type MapStyle = 'standard' | 'streets-v12' | 'dark-v11' | 'satellite-streets-v12';

interface Props {
  token: string;
  style: MapStyle;
  relief: boolean;
  lightPreset: LightPreset;
  colorTheme: ColorTheme;
  onCenterChange: (lat: number, lng: number) => void;
  members: Member[];
  places: Place[];
  selectedId: string | null;
  selectedPlaceId: string | null;
  onSelect: (id: string | null) => void;
  history: HistoryPoint[] | null;
  route: GeoJSON.LineString | null;
  events: AppEvent[];
  distances: Record<string, Distance>;
  cities: Record<string, string>;
  routeKind: RouteKind | null;
  onRouteKind: (kind: RouteKind | null) => void;
}

export function MapView({ token, style, relief, lightPreset, colorTheme, onCenterChange, members, places, selectedId, selectedPlaceId, onSelect, history, route, events, distances, cities, routeKind, onRouteKind }: Props) {
  const mapRef = useRef<MapRef>(null);
  const fitted = useRef(false);
  const [loaded, setLoaded] = useState(false);

  const standard = style === 'standard';

  // Vrstvy reliéfu se vkládají pod popisky; první popisková vrstva se zjišťuje až po načtení stylu
  const [labelLayer, setLabelLayer] = useState<string | undefined>();
  useEffect(() => {
    const map = mapRef.current?.getMap();
    setLabelLayer(undefined);
    if (!map || standard) return;
    const update = () => {
      const layers = map.getStyle()?.layers ?? [];
      setLabelLayer(layers.find((l) => l.type === 'symbol' && (l.layout as Record<string, unknown> | undefined)?.['text-field'])?.id);
    };
    if (map.isStyleLoaded()) update();
    map.on('style.load', update);
    return () => {
      map.off('style.load', update);
    };
  }, [style, standard, loaded]);

  // Mapbox Standard: světelná předvolba (svítání, den, soumrak, noc) a 3D objekty se nastavují přes konfiguraci stylu
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !standard) return;
    const apply = () => {
      const set = (key: string, value: string | boolean | number) => {
        try {
          map.setConfigProperty('basemap', key, value);
        } catch {
          /* styl ještě není načtený nebo volba neexistuje */
        }
      };
      set('lightPreset', lightPreset);
      set('show3dObjects', relief);
      set('theme', colorTheme === 'faded' || colorTheme === 'monochrome' ? colorTheme : 'default');
      for (const [key, value] of Object.entries(colorTheme === 'vivid' ? VIVID_COLORS : DEFAULT_COLORS)) set(key, value);
      set('roadsBrightness', colorTheme === 'vivid' ? 1 : 0.4);
    };
    apply();
    map.on('style.load', apply);
    return () => {
      map.off('style.load', apply);
    };
  }, [standard, lightPreset, relief, colorTheme, loaded]);

  const located = useMemo(() => members.filter((m) => m.lat !== null && m.lng !== null), [members]);
  const selectedMember = located.find((m) => m.id === selectedId);

  const placesGeoJson = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: 'FeatureCollection',
      features: places.map((p) => ({
        ...circlePolygon(p.lat, p.lng, p.radius),
        properties: { id: p.id, selected: p.id === selectedPlaceId },
      })),
    }),
    [places, selectedPlaceId],
  );

  const placeLabelsGeoJson = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: 'FeatureCollection',
      features: places.map((p) => ({
        type: 'Feature',
        properties: { name: p.name },
        geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
      })),
    }),
    [places],
  );

  const historyGeoJson = useMemo<GeoJSON.Feature | null>(
    () =>
      history && history.length > 1
        ? {
            type: 'Feature',
            properties: {},
            geometry: { type: 'LineString', coordinates: history.map((p) => [p.lng, p.lat]) },
          }
        : null,
    [history],
  );

  // Přiblíží mapu tak, aby byli vidět všichni členové s polohou
  const fitAll = (animate: boolean) => {
    const map = mapRef.current;
    if (!map || located.length === 0) return;
    if (located.length === 1) {
      map.flyTo({ center: [located[0]!.lng!, located[0]!.lat!], zoom: 14 });
      return;
    }
    const lngs = located.map((m) => m.lng!);
    const lats = located.map((m) => m.lat!);
    map.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      { padding: 80, maxZoom: 15, duration: animate ? 1200 : 0, pitch: relief ? RELIEF_PITCH : 0, bearing: 0 },
    );
  };

  // První načtení: zobrazí všechny členy
  useEffect(() => {
    if (fitted.current || located.length === 0 || !mapRef.current) return;
    fitted.current = true;
    fitAll(false);
  }, [located, loaded]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const m = located.find((x) => x.id === selectedId);
    if (m) {
      mapRef.current?.flyTo({ center: [m.lng!, m.lat!], zoom: Math.max(mapRef.current.getZoom(), 14), offset: [0, 70] });
    }
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const p = places.find((x) => x.id === selectedPlaceId);
    if (!p) return;
    // Přiblíží tak, aby se celá oblast vešla na mapu
    const zoom = Math.max(12, Math.min(17, 16.5 - Math.log2(Math.max(p.radius, 50) / 100)));
    mapRef.current?.flyTo({ center: [p.lng, p.lat], zoom });
  }, [selectedPlaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!history || history.length < 2) return;
    const lngs = history.map((p) => p.lng);
    const lats = history.map((p) => p.lat);
    mapRef.current?.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      { padding: 80, maxZoom: 16, pitch: relief ? RELIEF_PITCH : 0 },
    );
  }, [history]);

  const first = history?.[0];
  const last = history?.[history.length - 1];

  useEffect(() => {
    mapRef.current?.easeTo({ pitch: relief ? RELIEF_PITCH : 0, duration: 800 });
  }, [relief]);

  useEffect(() => {
    if (!route || route.coordinates.length < 2) return;
    const lngs = route.coordinates.map((c) => c[0]!);
    const lats = route.coordinates.map((c) => c[1]!);
    mapRef.current?.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      { padding: 80, maxZoom: 16, pitch: relief ? RELIEF_PITCH : 0 },
    );
  }, [route]);

  const routeStart = route?.coordinates[0];
  const routeEnd = route?.coordinates[route.coordinates.length - 1];

  return (
    <>
    <button
      className="fit-all"
      onClick={() => {
        onSelect(null);
        fitAll(true);
      }}
      disabled={located.length === 0}
      title="Zobrazit všechny členy na mapě"
    >
      <UsersIcon size={16} />
      <span>Všichni</span>
    </button>
    <MapGL
      ref={mapRef}
      mapboxAccessToken={token}
      mapStyle={`mapbox://styles/mapbox/${style}`}
      initialViewState={{ longitude: 14.42, latitude: 50.08, zoom: 5, pitch: relief ? RELIEF_PITCH : 0 }}
      terrain={relief ? { source: 'terrain-dem', exaggeration: TERRAIN_EXAGGERATION } : undefined}
      maxPitch={75}
      style={{ width: '100%', height: '100%' }}
      onLoad={() => setLoaded(true)}
      onMoveEnd={(e) => onCenterChange(e.viewState.latitude, e.viewState.longitude)}
      onClick={() => onSelect(null)}
    >
      <Source id="terrain-dem" type="raster-dem" url="mapbox://mapbox.mapbox-terrain-dem-v1" tileSize={512} maxzoom={14} />
      {relief && !standard && labelLayer && (
        <Layer
          id="hillshade"
          type="hillshade"
          source="terrain-dem"
          beforeId={labelLayer}
          paint={{ 'hillshade-exaggeration': 0.6, 'hillshade-shadow-color': '#3b3b4f', 'hillshade-highlight-color': '#ffffff' }}
        />
      )}
      {relief && !standard && labelLayer && (
        <>
          <Layer
            id="sky"
            type="sky"
            paint={{ 'sky-type': 'atmosphere', 'sky-atmosphere-sun': [0, 0], 'sky-atmosphere-sun-intensity': 8 }}
          />
          <Layer
            id="3d-buildings"
            beforeId={labelLayer}
            source="composite"
            source-layer="building"
            type="fill-extrusion"
            minzoom={14}
            filter={['==', 'extrude', 'true']}
            paint={{
              'fill-extrusion-color': style === 'dark-v11' ? '#3b4252' : '#d6d3cf',
              'fill-extrusion-height': ['get', 'height'],
              'fill-extrusion-base': ['get', 'min_height'],
              'fill-extrusion-opacity': 0.85,
            }}
          />
        </>
      )}

      <Source id="places" type="geojson" data={placesGeoJson}>
        <Layer
          id="places-fill"
          type="fill"
          paint={{ 'fill-emissive-strength': 1, 'fill-color': '#2563eb', 'fill-opacity': ['case', ['get', 'selected'], 0.3, 0.12] }}
        />
        <Layer
          id="places-line"
          type="line"
          paint={{ 'line-emissive-strength': 1, 'line-color': '#2563eb', 'line-width': ['case', ['get', 'selected'], 3, 1.5] }}
        />
      </Source>
      <Source id="place-labels" type="geojson" data={placeLabelsGeoJson}>
        <Layer
          id="place-labels-text"
          type="symbol"
          layout={{
            'text-field': ['get', 'name'],
            'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
            'text-size': 12,
            'text-allow-overlap': false,
          }}
          paint={{ 'text-emissive-strength': 1, 'text-color': '#1d4ed8', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 }}
        />
      </Source>

      {historyGeoJson && (
        <Source id="history" type="geojson" data={historyGeoJson}>
          <Layer
            id="history-line"
            type="line"
            layout={{ 'line-join': 'round', 'line-cap': 'round' }}
            paint={{ 'line-emissive-strength': 1, 'line-color': '#ef4444', 'line-width': 4, 'line-opacity': 0.85 }}
          />
        </Source>
      )}
      {first && history!.length > 1 && (
        <Marker longitude={first.lng} latitude={first.lat}>
          <div className="dot dot-start" title="Začátek" />
        </Marker>
      )}
      {last && history!.length > 1 && (
        <Marker longitude={last.lng} latitude={last.lat}>
          <div className="dot dot-end" title="Konec" />
        </Marker>
      )}

      {route && (
        <Source id="route" type="geojson" data={{ type: 'Feature', properties: {}, geometry: route }}>
          <Layer
            id="route-casing"
            type="line"
            layout={{ 'line-join': 'round', 'line-cap': 'round' }}
            paint={{ 'line-emissive-strength': 1, 'line-color': '#ffffff', 'line-width': 9 }}
          />
          <Layer
            id="route-line"
            type="line"
            layout={{ 'line-join': 'round', 'line-cap': 'round' }}
            paint={{ 'line-emissive-strength': 1, 'line-color': '#2563eb', 'line-width': 5 }}
          />
        </Source>
      )}
      {routeStart && (
        <Marker longitude={routeStart[0]!} latitude={routeStart[1]!}>
          <div className="dot dot-start" title="Start trasy" />
        </Marker>
      )}
      {routeEnd && (
        <Marker longitude={routeEnd[0]!} latitude={routeEnd[1]!}>
          <div className="dot dot-end" title="Cíl trasy" />
        </Marker>
      )}

      {located.map((m) => (
        <Marker
          key={m.id}
          longitude={m.lng!}
          latitude={m.lat!}
          anchor="center"
          onClick={(e) => {
            e.originalEvent.stopPropagation();
            onSelect(m.id);
          }}
        >
          <div className="pin-wrap">
            <div className={`pin${m.id === selectedId ? ' selected' : ''}`}>
              {m.avatar ? <img src={m.avatar} alt={m.name} referrerPolicy="no-referrer" /> : <span>{initials(m.name)}</span>}
            </div>
            {!selectedId && distances[m.id] && (
              <div className="pin-label">
                {formatDistance(distances[m.id]!.straight)}
                {distances[m.id]!.driveDistance !== null && (
                  <>
                    {' · '}
                    <CarIcon size={12} />
                    {' '}
                    {formatDistance(distances[m.id]!.driveDistance!)}
                  </>
                )}
              </div>
            )}
          </div>
        </Marker>
      ))}

      {selectedMember && (
        <Popup
          key={selectedMember.id}
          longitude={selectedMember.lng!}
          latitude={selectedMember.lat!}
          anchor="bottom"
          offset={34}
          maxWidth="340px"
          closeOnClick={false}
          focusAfterOpen={false}
          onClose={() => onSelect(null)}
          className="member-popup"
        >
          <MemberDetail
            member={selectedMember}
            events={events}
            mapboxToken={token}
            distance={distances[selectedMember.id]}
            city={cities[selectedMember.id]}
            routeKind={routeKind}
            onRoute={onRouteKind}
          />
        </Popup>
      )}
    </MapGL>
    </>
  );
}
