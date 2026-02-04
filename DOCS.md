# Investment Atlas - Developer Notes

This document is a short, practical guide for maintaining and extending the codebase.

## Architecture

- `client/` is a React + Vite UI.
- `server/` is an Express API that reads/writes an Excel ledger.
- Data is stored locally at `server/data/investments.xlsx`.

## Key Flows

- **Ledger CRUD**
  - `GET /api/investments` loads entries.
  - `POST /api/investments` adds an entry.
  - `PUT /api/investments/:id` edits an entry.
  - `DELETE /api/investments/:id` removes an entry.

- **Summary for charts**
  - `GET /api/summary` computes totals by type/category/month.

- **Excel import/export**
  - `GET /api/export` downloads the ledger.
  - `POST /api/import` replaces the ledger.

- **Autocomplete**
  - `GET /api/autocomplete?q=` for suggestions.
  - `POST /api/autocomplete/clear` clears server cache.

## Environment

- `server/.env` should include:

```
ALPHA_VANTAGE_KEY=your_key_here
```

Autocomplete also falls back to MFAPI for Indian mutual funds.

## How data is stored

Rows are normalized before write. The current schema is:

```
id, type, category, name, direction, amount, date, notes, createdAt
```

## Common maintenance tasks

- **Add a new field**
  - Update `HEADERS` in `server/index.js`.
  - Update normalization in `normalizeInvestment`.
  - Update UI forms + tables.

- **Change chart metrics**
  - Update `GET /api/summary` in `server/index.js`.
  - Update charts in `client/src/pages/Dashboard.jsx`.

- **Autocomplete providers**
  - `fetchAlphaSuggestions` and `fetchMfapiSuggestions` live in `server/index.js`.

## Dev commands

From repo root:

```
npm run dev
```

Starts both server and client.
