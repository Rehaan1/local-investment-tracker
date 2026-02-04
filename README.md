# Investment Atlas

A local-first investment tracker with Excel storage, a Node.js API, and a React dashboard with charts.

## Quick Start (One Click)

1. Double-click `start-app.bat` in the project root.
2. Your browser will open automatically at `http://localhost:5173`.

The app creates/uses the Excel ledger at `server/data/investments.xlsx`.

## Manual Start

1. Start the server

```bash
cd server
npm install
npm run dev
```

2. Start the client

```bash
cd client
npm install
npm run dev
```

The API runs on `http://localhost:4000` and the UI on `http://localhost:5173`.

## Autocomplete (Security Name)

We use the Alpha Vantage `SYMBOL_SEARCH` endpoint for security name suggestions.

1. Copy `server/.env.example` to `server/.env`
2. Add your key:

```
ALPHA_VANTAGE_KEY=your_key_here
```

If no key is configured, autocomplete will stay disabled but everything else works.
Results are cached for a few hours to reduce API calls. We also fall back to a
secondary free API for Indian mutual funds when Alpha Vantage is rate-limited
or returns no matches.

## Data File

Your ledger is stored locally at:

`server/data/investments.xlsx`

Use Export/Import in the UI for backups or recovery.

## Notes

- Excel import will replace the current ledger.
- Amounts are displayed in INR.
- Debit entries reduce totals and charts.
