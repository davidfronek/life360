-- Vyžaduje nainstalované PostGIS; CREATE EXTENSION musí provést uživatel s dostatečnými právy
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE settings (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE circles (
  id         text PRIMARY KEY,
  name       text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE members (
  id               text PRIMARY KEY,
  circle_id        text NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  first_name       text NOT NULL DEFAULT '',
  last_name        text NOT NULL DEFAULT '',
  avatar_url       text,
  current_place_id text,
  low_battery      boolean NOT NULL DEFAULT false,
  last_seen_ts     timestamptz,
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX members_circle_idx ON members (circle_id);

CREATE TABLE places (
  id        text PRIMARY KEY,
  circle_id text NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  name      text NOT NULL,
  geom      geography(Point, 4326) NOT NULL,
  radius_m  real NOT NULL
);
CREATE INDEX places_geom_idx ON places USING gist (geom);
CREATE INDEX places_circle_idx ON places (circle_id);

CREATE TABLE locations (
  id          bigserial PRIMARY KEY,
  member_id   text NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  ts          timestamptz NOT NULL,
  geom        geography(Point, 4326) NOT NULL,
  accuracy_m  real,
  speed       real,
  battery     smallint,
  charging    boolean,
  is_driving  boolean,
  place_name  text,
  UNIQUE (member_id, ts)
);
CREATE INDEX locations_member_ts_idx ON locations (member_id, ts DESC);
CREATE INDEX locations_ts_idx ON locations (ts);
CREATE INDEX locations_geom_idx ON locations USING gist (geom);

CREATE TABLE events (
  id         bigserial PRIMARY KEY,
  member_id  text NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  type       text NOT NULL CHECK (type IN ('arrive', 'leave', 'low_battery')),
  place_id   text,
  place_name text,
  ts         timestamptz NOT NULL
);
CREATE INDEX events_ts_idx ON events (ts DESC);
CREATE INDEX events_member_ts_idx ON events (member_id, ts DESC);
