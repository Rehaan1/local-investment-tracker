# Architecture & Maintenance Notes

## Overview

Investment Atlas is a local-first investment tracker with a React UI and an Express API. It stores data in a local Excel file and can back it up to Google Drive.

```
client/   React + Vite UI
server/   Express API + Excel persistence
```

## Runtime Data Flow

1. UI loads and calls `/api/investments` and `/api/summary`.
2. Server reads `investments.xlsx` via ExcelJS and returns JSON.
3. UI renders charts and the ledger.

## Persistence

- Dev storage: `server/data/investments.xlsx`
- Packaged exe storage: `%APPDATA%\InvestmentAtlas\investments.xlsx`

Schema columns:

```
id, type, category, name, direction, amount, date, notes, createdAt
```

## API Surface

- `GET /api/investments`
- `POST /api/investments`
- `PUT /api/investments/:id`
- `DELETE /api/investments/:id`
- `GET /api/summary`
- `GET /api/export`
- `POST /api/import`
- `GET /api/autocomplete?q=`
- `POST /api/autocomplete/clear`
- `GET /api/drive/status`
- `GET /api/drive/auth-url`
- `GET /api/drive/oauth2callback`
- `POST /api/drive/backup`

## Autocomplete Providers

- Primary: MFAPI (`https://api.mfapi.in/mf/search`)
- Fallback: Alpha Vantage (`SYMBOL_SEARCH`)

Results are cached in memory to reduce API calls.

## Google Drive Backup

OAuth token is stored at:

```
server/.drive_token.json
```

The backup flow creates/uses a folder named `Investment Atlas` and uploads/updates `investments.xlsx`.

## Packaging (Option 5)

The `pkg` build bundles the server and built client into a single exe.

```
npm run build:exe
```

The server serves `client/dist` from within the packaged snapshot.

## Maintenance Tasks

- Add a new field:
  - Update `HEADERS` in `server/index.js`
  - Update `normalizeInvestment`
  - Update UI forms + tables
- Change dashboard metrics:
  - Update `GET /api/summary`
  - Update `client/src/pages/Dashboard.jsx`
- Add new provider:
  - Add a new fetch function in `server/index.js`
  - Integrate it into `/api/autocomplete`
