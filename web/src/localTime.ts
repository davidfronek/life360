import tzlookup from 'tz-lookup';
import { sunPosition } from './sun';

export interface LocalTime {
  zone: string;
  time: string;
  day: boolean;
  differs: boolean;
}

const hm = (d: Date, zone?: string) =>
  new Intl.DateTimeFormat('cs-CZ', { hour: '2-digit', minute: '2-digit', timeZone: zone }).format(d);

// Místní čas v místě člena (offline určení časového pásma z GPS) a zda je tam právě den
export function localTimeAt(lat: number, lng: number, now = new Date()): LocalTime | null {
  try {
    const zone = tzlookup(lat, lng);
    const time = hm(now, zone);
    return { zone, time, day: sunPosition(now, lat, lng).altitude > 0, differs: time !== hm(now) };
  } catch {
    return null;
  }
}
