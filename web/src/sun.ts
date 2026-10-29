import { useEffect, useState } from 'react';

export type LightPreset = 'dawn' | 'day' | 'dusk' | 'night';
export type LightMode = 'auto' | LightPreset;

const RAD = Math.PI / 180;

// Výška Slunce nad obzorem (°) a informace, zda je před polednem (zjednodušený astronomický výpočet)
export function sunPosition(date: Date, lat: number, lng: number): { altitude: number; morning: boolean } {
  const d = date.valueOf() / 86_400_000 - 0.5 + 2440588 - 2451545;
  const M = RAD * (357.5291 + 0.98560028 * d);
  const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const L = M + C + RAD * 102.9372 + Math.PI;
  const e = RAD * 23.4397;
  const dec = Math.asin(Math.sin(L) * Math.sin(e));
  const ra = Math.atan2(Math.sin(L) * Math.cos(e), Math.cos(L));
  const H = RAD * (280.16 + 360.9856235 * d) + RAD * lng - ra;
  const phi = lat * RAD;
  const altitude = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H)) / RAD;
  return { altitude, morning: Math.sin(H) < 0 };
}

export function presetFor(date: Date, lat: number, lng: number): LightPreset {
  const { altitude, morning } = sunPosition(date, lat, lng);
  if (altitude > 8) return 'day';
  if (altitude < -8) return 'night';
  return morning ? 'dawn' : 'dusk';
}

// Světelná předvolba mapy podle skutečné polohy Slunce; průběžně se přepočítává
export function useLightPreset(mode: LightMode, lat: number, lng: number): LightPreset {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (mode !== 'auto') return;
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, [mode]);
  return mode === 'auto' ? presetFor(now, lat, lng) : mode;
}
