# Life360 web

Webové rozhraní pro Life360: živá mapa (Mapbox GL), historie tras, místa, události. Bez Dockeru, data v PostgreSQL + PostGIS.

- **Frontend:** React + TypeScript + Vite, `react-map-gl` (Mapbox), TanStack Query
- **Backend:** Node.js (Fastify, TypeScript) – proxy k neoficiálnímu Life360 API, worker pro dotazování, SSE pro živé polohy
- **DB:** PostgreSQL s rozšířením PostGIS

## Požadavky

- Node.js 20+
- PostgreSQL 14+ s nainstalovaným **PostGIS** (balíček např. `postgresql-16-postgis-3`)
- Mapbox veřejný token (`pk.*`) – doporučeno omezit na vaši doménu (URL restrikce)
- Life360 access token (získává se mimo aplikaci)

## Instalace

```bash
# 1) databáze (jako superuživatel)
createuser life360 --pwprompt
createdb -O life360 life360
psql -d life360 -c "CREATE EXTENSION IF NOT EXISTS postgis;"

# 2) konfigurace
cp .env.example .env        # doplňte hodnoty, viz komentáře v souboru

# 3) závislosti
npm install
```

Migrace se aplikují automaticky při startu serveru (nebo ručně `npm run migrate`).
Pokud DB uživatel nemá právo vytvářet rozšíření, vytvořte PostGIS ručně jako superuživatel (viz výše).

## Spuštění

**Vývoj** (dva terminály):

```bash
npm run dev:server   # http://localhost:3000
npm run dev:web      # http://localhost:5173 (proxy /api -> 3000)
```

**Produkce** (jeden proces, server servíruje i frontend):

```bash
npm run build
npm start
```

Doporučeno provozovat za reverzní proxy s HTTPS (nginx/Caddy) a nastavit `SECURE_COOKIES=true`, `TRUST_PROXY=true`.
Proces lze spravovat např. přes systemd nebo pm2.

## Přihlášení a tokeny

1. Do aplikace se přihlašujete **přístupovým tokenem** (`APP_ACCESS_TOKEN`) → HttpOnly podepsaná cookie na 7 dní.
2. V **Nastavení** vložíte **Life360 token**. Server ho ověří, uloží **šifrovaně** (AES-256-GCM, klíč `TOKEN_ENCRYPTION_KEY`) a nikdy ho nevrací do prohlížeče.
3. Při `401/403` z Life360 se v UI zobrazí, že token expiroval; stačí vložit nový.

## Architektura

```
Prohlížeč ──HTTPS──► Fastify ──► Life360 API (Bearer token)
   ▲  SSE /api/stream   │
   └────────────────────┤ worker (každých POLL_INTERVAL_SECONDS)
                        └──► PostgreSQL + PostGIS
```

- `server/src/worker.ts` – periodicky stahuje kruhy, členy a místa; ukládá polohy (`locations`), generuje události příchod/odchod/slabá baterie (`events`) pomocí `ST_DWithin`, maže data starší než `RETENTION_DAYS`.
- `server/migrations/` – SQL migrace (tabulky `settings`, `circles`, `members`, `places`, `locations`, `events`).
- API: `/api/auth/*`, `/api/settings/life360`, `/api/circles`, `/api/members`, `/api/places`, `/api/members/:id/history`, `/api/events`, `/api/stream` (SSE).

## Přesun na internet (nasazení na server)

Skripty jsou ve složce [deploy/](deploy):

| Skript | Účel |
|---|---|
| `export-db.ps1` / `export-db.sh` | export struktury DB (výchozí) → `life360-schema.sql`; s `-WithData` / `--with-data` i data (bez tabulky `settings`) → `life360-data.sql` |
| `import-db.ps1` / `import-db.sh` | import SQL souboru do cílové databáze (v jedné transakci) |

`deploy/life360-schema.sql` je aktuální export struktury (tabulky, indexy, PostGIS, evidence migrací).
Data nejsou v něm obsažena. `life360-data.sql` obsahuje osobní údaje, proto je v `.gitignore`.

Postup na novém serveru:

```bash
# 1) PostgreSQL + PostGIS, databáze a rozšíření (jako superuživatel)
createuser life360 --pwprompt
createdb -O life360 life360
psql -d life360 -c "CREATE EXTENSION IF NOT EXISTS postgis;"

# 2) struktura (volitelně lze vynechat, migrace se aplikují samy při startu serveru)
./deploy/import-db.sh deploy/life360-schema.sql "postgres://life360:HESLO@localhost:5432/life360"

# 3) aplikace
git clone ... && cd life360 && npm install
cp .env.example .env        # nové APP_ACCESS_TOKEN, SESSION_SECRET, TOKEN_ENCRYPTION_KEY, MAPBOX_TOKEN; SECURE_COOKIES=true, TRUST_PROXY=true
npm run build && npm start
```

Poznámky:
- Export z novější verze PostgreSQL se importuje i do starších (14+), skript z dumpu odstraňuje řádky, kterým by starší klient nerozuměl.
- Přenášíte-li i data, ať je v `.env` na novém serveru **stejný `TOKEN_ENCRYPTION_KEY`**, jen pak jde použít uložený Life360 token (`--include-settings`). Jinak token zadejte znovu v Nastavení.
- U veřejného Mapbox tokenu přidejte v účtu Mapbox URL restrikci na novou doménu.
- Server nechte běžet za reverzní proxy s HTTPS (Caddy, nginx) a spravujte ho přes systemd nebo pm2.

## Poznámky

- Life360 nemá oficiální veřejné API; použité endpointy se mohou změnit a použití může být v rozporu s podmínkami služby. Komunikace je izolovaná v `server/src/life360.ts`.
- Polohy jsou citlivé osobní údaje (GDPR) – mějte souhlas sledovaných osob a nastavte retenci.
- Aplikace je navržena pro jednoho (self-hosted) uživatele s jedním Life360 tokenem.
