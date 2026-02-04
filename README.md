# Investment Atlas

A local-first investment tracker with Excel storage, a Node.js API, and a React dashboard with charts.

## Run

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

## Data file

The ledger is stored at `server/data/investments.xlsx`. Export and import from the UI as needed.
