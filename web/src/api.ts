export interface Member {
  id: string;
  circleId: string;
  name: string;
  avatar: string | null;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  battery: number | null;
  charging: boolean | null;
  isDriving: boolean | null;
  placeName: string | null;
  city: string | null;
  country: string | null;
  ts: string | null;
}

export interface Circle {
  id: string;
  name: string;
}

export interface Place {
  id: string;
  circleId: string;
  name: string;
  radius: number;
  lat: number;
  lng: number;
  city: string | null;
  country: string | null;
}

export interface HistoryPoint {
  ts: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  battery: number | null;
  isDriving: boolean | null;
  placeName: string | null;
}

export interface History {
  points: HistoryPoint[];
  distanceM: number;
}

export interface AppEvent {
  id: string;
  type: 'arrive' | 'leave' | 'low_battery';
  ts: string;
  memberId: string;
  memberName: string;
  placeName: string | null;
}

export interface Life360Settings {
  configured: boolean;
  state: 'unconfigured' | 'ok' | 'invalid' | 'error';
  message: string;
  lastOkAt: string | null;
  pollIntervalSec: number;
  meMemberId: string | null;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: init?.body ? { 'content-type': 'application/json' } : undefined,
    credentials: 'same-origin',
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      msg = (await res.json()).error ?? msg;
    } catch {
      /* odpověď bez JSON */
    }
    throw new ApiError(res.status, msg);
  }
  return res.json() as Promise<T>;
}

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

export const api = {
  me: () => request<{ authenticated: boolean }>('/api/auth/me'),
  login: (accessToken: string) => request('/api/auth/login', json('POST', { accessToken })),
  logout: () => request('/api/auth/logout', { method: 'POST' }),
  config: () => request<{ mapboxToken: string }>('/api/config'),
  circles: () => request<Circle[]>('/api/circles'),
  members: () => request<Member[]>('/api/members'),
  places: () => request<Place[]>('/api/places'),
  events: () => request<AppEvent[]>('/api/events?limit=50'),
  history: (memberId: string, from: Date, to: Date) =>
    request<History>(
      `/api/members/${encodeURIComponent(memberId)}/history?from=${from.toISOString()}&to=${to.toISOString()}`,
    ),
  life360Settings: () => request<Life360Settings>('/api/settings/life360'),
  saveLife360Token: (token: string) => request('/api/settings/life360', json('PUT', { token })),
  deleteLife360Token: () => request('/api/settings/life360', { method: 'DELETE' }),
  setMe: (memberId: string | null) => request('/api/settings/me', json('PUT', { memberId })),
};
