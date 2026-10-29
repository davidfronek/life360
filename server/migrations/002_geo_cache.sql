-- Mezipaměť reverzního geokódování: město a země pro souřadnice zaokrouhlené na 0,01° (~1 km)
CREATE TABLE geo_cache (
  lat_r      numeric(5, 2) NOT NULL,
  lng_r      numeric(5, 2) NOT NULL,
  city       text,
  country    text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (lat_r, lng_r)
);
