import { useSyncExternalStore } from 'react';
import type { LatLng, Profile } from './directions';

export type NavApp = 'google' | 'mapy' | 'waze' | 'apple';

export const NAV_APPS: { id: NavApp; label: string }[] = [
  { id: 'google', label: 'Google Maps' },
  { id: 'mapy', label: 'Mapy.com' },
  { id: 'waze', label: 'Waze' },
  { id: 'apple', label: 'Apple Maps' },
];

const KEY = 'navApp';
const EVENT = 'navapp-change';
const DEFAULT: NavApp = 'google';

// Navigace se nabízí jen na mobilních zařízeních (včetně tabletů)
export function isMobileDevice(): boolean {
  const ua = navigator.userAgent;
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return true;
  // iPadOS se hlásí jako Mac, liší se dotykovým ovládáním
  return /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
}

export function getNavApp(): NavApp {
  const v = localStorage.getItem(KEY);
  return NAV_APPS.some((a) => a.id === v) ? (v as NavApp) : DEFAULT;
}

export function setNavApp(app: NavApp): void {
  localStorage.setItem(KEY, app);
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void): () => void {
  window.addEventListener(EVENT, cb);
  window.addEventListener('storage', cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener('storage', cb);
  };
}

// Volba navigační aplikace se ukládá v prohlížeči, protože závisí na zařízení
export function useNavApp(): NavApp {
  return useSyncExternalStore(subscribe, getNavApp, () => DEFAULT);
}

export function navigationUrl(app: NavApp, profile: Profile, from: LatLng | null, to: LatLng): string {
  const dest = `${to.lat},${to.lng}`;
  switch (app) {
    case 'google': {
      const mode = { driving: 'driving', walking: 'walking', cycling: 'bicycling', transit: 'transit' }[profile];
      return (
        `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=${mode}` +
        (from ? `&origin=${from.lat},${from.lng}` : '')
      );
    }
    case 'mapy': {
      // Mapy.com v URL nemá režim MHD; použije se pěší trasa a v aplikaci lze přepnout
      const type = { driving: 'car_fast_traffic', walking: 'foot_fast', cycling: 'bike_road', transit: 'foot_fast' }[profile];
      return (
        `https://mapy.com/fnc/v1/route?mapset=traffic&routeType=${type}&navigate=true` +
        (from ? `&start=${from.lng},${from.lat}` : '') +
        `&end=${to.lng},${to.lat}`
      );
    }
    case 'waze':
      return `https://waze.com/ul?ll=${dest}&navigate=yes`;
    case 'apple': {
      const flag = { driving: 'd', walking: 'w', cycling: 'w', transit: 'r' }[profile];
      return `https://maps.apple.com/?daddr=${dest}&dirflg=${flag}` + (from ? `&saddr=${from.lat},${from.lng}` : '');
    }
  }
}
