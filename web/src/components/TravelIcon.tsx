import { TRAVEL_LABEL, type Travel, type TravelMode } from '../travel';
import { BikeIcon, CarIcon, PlaneIcon, TrainIcon, WalkIcon } from './icons';

const ICONS = { walking: WalkIcon, cycling: BikeIcon, driving: CarIcon, train: TrainIcon, plane: PlaneIcon };

export function TravelIcon({ mode, size = 14 }: { mode: TravelMode; size?: number }) {
  const Icon = ICONS[mode];
  return <Icon size={size} />;
}

export const travelTitle = (t: Travel) => `${TRAVEL_LABEL[t.mode]} · ${t.kmh} km/h`;