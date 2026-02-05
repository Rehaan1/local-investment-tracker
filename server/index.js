const express = require("express");
require("dotenv").config();
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");
const { randomUUID } = require("crypto");
const { google } = require("googleapis");

const PORT = process.env.PORT || 4000;
const ALPHA_VANTAGE_KEY = process.env.ALPHA_VANTAGE_KEY || "";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const GOOGLE_REDIRECT_URI =
  process.env.GOOGLE_REDIRECT_URI || "http://localhost:4000/api/drive/oauth2callback";
const AUTO_CACHE_TTL_MS = 1000 * 60 * 60 * 6;
const autoCache = new Map();
const inflight = new Map();

const app = express();

app.use(cors());
app.use(express.json({ limit: "2mb" }));

const DATA_DIR = path.join(__dirname, "data");
const FILE_PATH = path.join(DATA_DIR, "investments.xlsx");
const UPLOAD_DIR = path.join(__dirname, "uploads");
const DRIVE_TOKEN_PATH = path.join(__dirname, ".drive_token.json");
const DRIVE_FOLDER_NAME = "Investment Atlas";
const DRIVE_FILE_NAME = "investments.xlsx";
const DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive.file"];
const SHEET_NAME = "Investments";
const HEADERS = [
  "id",
  "type",
  "category",
  "name",
  "direction",
  "amount",
  "date",
  "notes",
  "createdAt",
];

// Normalize query strings to improve cache hits and filtering.
function normalizeQuery(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function getCachedSuggestions(queryKey) {
  const entry = autoCache.get(queryKey);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > AUTO_CACHE_TTL_MS) {
    autoCache.delete(queryKey);
    return null;
  }
  return entry.suggestions;
}

function setCachedSuggestions(queryKey, suggestions) {
  autoCache.set(queryKey, { suggestions, timestamp: Date.now() });
}

function isDriveConfigured() {
  return Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET && GOOGLE_REDIRECT_URI);
}

function getOAuthClient() {
  return new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI
  );
}

function loadDriveToken(oAuth2Client) {
  if (!fs.existsSync(DRIVE_TOKEN_PATH)) {
    return false;
  }
  try {
    const token = JSON.parse(fs.readFileSync(DRIVE_TOKEN_PATH, "utf-8"));
    oAuth2Client.setCredentials(token);
    return true;
  } catch (error) {
    return false;
  }
}

function saveDriveToken(token) {
  fs.writeFileSync(DRIVE_TOKEN_PATH, JSON.stringify(token, null, 2));
}

async function getDriveClient() {
  if (!isDriveConfigured()) {
    const error = new Error("Google Drive not configured.");
    error.code = "drive_not_configured";
    throw error;
  }
  const oAuth2Client = getOAuthClient();
  const hasToken = loadDriveToken(oAuth2Client);
  if (!hasToken) {
    const error = new Error("Google Drive not connected.");
    error.code = "drive_not_connected";
    throw error;
  }
  return google.drive({ version: "v3", auth: oAuth2Client });
}

async function ensureDriveFolder(drive) {
  const query = [
    "mimeType='application/vnd.google-apps.folder'",
    `name='${DRIVE_FOLDER_NAME.replace(/'/g, "\\'")}'`,
    "trashed=false",
    "'root' in parents",
  ].join(" and ");

  const list = await drive.files.list({
    q: query,
    fields: "files(id, name)",
    spaces: "drive",
    pageSize: 1,
  });

  if (list.data.files && list.data.files.length) {
    return list.data.files[0].id;
  }

  const created = await drive.files.create({
    requestBody: {
      name: DRIVE_FOLDER_NAME,
      mimeType: "application/vnd.google-apps.folder",
      parents: ["root"],
    },
    fields: "id",
  });

  return created.data.id;
}

async function findDriveFile(drive, folderId) {
  const query = [
    `name='${DRIVE_FILE_NAME.replace(/'/g, "\\'")}'`,
    `'${folderId}' in parents`,
    "trashed=false",
  ].join(" and ");

  const list = await drive.files.list({
    q: query,
    fields: "files(id, name, modifiedTime)",
    spaces: "drive",
    pageSize: 1,
  });

  if (list.data.files && list.data.files.length) {
    return list.data.files[0];
  }
  return null;
}

async function downloadDriveFile(drive, fileId, destinationPath) {
  const response = await drive.files.get(
    { fileId, alt: "media" },
    { responseType: "stream" }
  );

  await new Promise((resolve, reject) => {
    const tempPath = `${destinationPath}.tmp`;
    const dest = fs.createWriteStream(tempPath);

    const cleanup = (err) => {
      try {
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
      } catch (cleanupError) {
        // ignore cleanup errors
      }
      reject(err);
    };

    response.data.on("error", cleanup);
    dest.on("error", cleanup);
    dest.on("finish", () => {
      try {
        fs.renameSync(tempPath, destinationPath);
        resolve();
      } catch (err) {
        cleanup(err);
      }
    });

    response.data.pipe(dest);
  });
}

// Alpha Vantage search (global equities).
async function fetchAlphaSuggestions(query) {
  const url = new URL("https://www.alphavantage.co/query");
  url.searchParams.set("function", "SYMBOL_SEARCH");
  url.searchParams.set("keywords", query);
  url.searchParams.set("apikey", ALPHA_VANTAGE_KEY);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Provider error");
  }
  const data = await response.json();
  if (data.Note || data["Information"]) {
    return { suggestions: [], rateLimited: true };
  }
  const matches = Array.isArray(data.bestMatches) ? data.bestMatches : [];
  const suggestions = matches
    .map((match) => ({
      symbol: match["1. symbol"] || "",
      name: match["2. name"] || "",
      region: match["4. region"] || "",
      currency: match["8. currency"] || "",
      source: "AlphaVantage",
    }))
    .filter((item) => item.name || item.symbol);
  return { suggestions, rateLimited: false };
}

// MFAPI search (India mutual funds).
async function fetchMfapiSuggestions(query) {
  const url = new URL("https://api.mfapi.in/mf/search");
  url.searchParams.set("q", query);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Provider error");
  }
  const data = await response.json();
  const list = Array.isArray(data) ? data : [];
  const suggestions = list
    .map((item) => ({
      symbol: item.schemeCode ? String(item.schemeCode) : "",
      name: item.schemeName || "",
      region: "India",
      currency: "INR",
      source: "MFAPI",
    }))
    .filter((item) => item.name || item.symbol);
  return { suggestions };
}

// Ensure the data and upload directories exist and the Excel ledger is initialized.
async function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
  if (!fs.existsSync(FILE_PATH)) {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(SHEET_NAME);
    sheet.addRow(HEADERS);
    await workbook.xlsx.writeFile(FILE_PATH);
  }
}

// Normalize ExcelJS cell values to strings.
function cellToString(value) {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if (value.text) return String(value.text);
    if (value.richText) return value.richText.map((item) => item.text).join("");
    if (value.result != null) return String(value.result);
  }
  return String(value);
}

// Normalize ExcelJS cell values to numbers.
function cellToNumber(value) {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "object" && value.result != null) {
    const num = Number(value.result);
    return Number.isFinite(num) ? num : 0;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

// Convert a worksheet to an array of objects using the header row.
function sheetToRows(sheet) {
  if (!sheet) return [];
  const headerRow = sheet.getRow(1);
  const headerValues = headerRow.values
    .slice(1)
    .map((value) => String(value || "").trim());
  const headers = headerValues.length >= 2 ? headerValues : HEADERS;

  const rows = [];
  for (let rowIndex = 2; rowIndex <= sheet.rowCount; rowIndex += 1) {
    const row = sheet.getRow(rowIndex);
    const record = {};
    HEADERS.forEach((header) => {
      const headerIndex = headers.findIndex(
        (h) => h.toLowerCase() === header.toLowerCase()
      );
      if (headerIndex === -1) {
        record[header] = header === "amount" ? 0 : "";
        return;
      }
      const cellValue = row.getCell(headerIndex + 1).value;
      if (header === "amount") {
        record[header] = cellToNumber(cellValue);
      } else {
        record[header] = cellToString(cellValue);
      }
    });
    rows.push(record);
  }
  return rows;
}

async function readInvestments() {
  await ensureDataFile();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(FILE_PATH);
  const sheet = workbook.getWorksheet(SHEET_NAME) || workbook.worksheets[0];
  if (!sheet) return [];
  const rows = sheetToRows(sheet);
  return rows
    .map((row) => ({
      id: String(row.id || "").trim(),
      type: String(row.type || "").trim(),
      category: String(row.category || "").trim(),
      name: String(row.name || "").trim(),
      direction: String(row.direction || "credit").trim() || "credit",
      amount: Number(row.amount || 0),
      date: String(row.date || "").trim(),
      notes: String(row.notes || "").trim(),
      createdAt: String(row.createdAt || "").trim(),
    }))
    .filter((row) => row.id);
}

async function writeInvestments(investments) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(SHEET_NAME);
  sheet.addRow(HEADERS);
  investments.forEach((item) => {
    sheet.addRow(HEADERS.map((header) => item[header] ?? ""));
  });
  await workbook.xlsx.writeFile(FILE_PATH);
}

// Normalize incoming entries to the persisted schema.
function normalizeInvestment(input) {
  const direction = String(input.direction || "credit").trim().toLowerCase();
  return {
    id: input.id || randomUUID(),
    type: String(input.type || "").trim(),
    category: String(input.category || "").trim(),
    name: String(input.name || "").trim(),
    direction: direction === "debit" ? "debit" : "credit",
    amount: Number(input.amount || 0),
    date: String(input.date || "").trim(),
    notes: String(input.notes || "").trim(),
    createdAt: input.createdAt || new Date().toISOString(),
  };
}

app.get("/api/investments", async (req, res) => {
  try {
    const investments = await readInvestments();
    res.json(investments);
  } catch (error) {
    res.status(500).json({ error: "Failed to load investments." });
  }
});

app.post("/api/investments", async (req, res) => {
  try {
    const { type, category, name, direction, amount, date, notes } = req.body || {};
    const numericAmount = Number(amount);
    if (!type || !date || !Number.isFinite(numericAmount)) {
      return res.status(400).json({ error: "type, amount, and date are required." });
    }
    const investments = await readInvestments();
    const newItem = normalizeInvestment({
      type,
      category,
      name,
      direction,
      amount: numericAmount,
      date,
      notes,
    });
    investments.push(newItem);
    await writeInvestments(investments);
    res.status(201).json(newItem);
  } catch (error) {
    res.status(500).json({ error: "Unable to add investment." });
  }
});

app.put("/api/investments/:id", async (req, res) => {
  try {
    const investments = await readInvestments();
    const idx = investments.findIndex((i) => i.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ error: "Not found." });
    }
    const updated = {
      ...investments[idx],
      ...normalizeInvestment({
        id: investments[idx].id,
        type: req.body?.type ?? investments[idx].type,
        category: req.body?.category ?? investments[idx].category,
        name: req.body?.name ?? investments[idx].name,
        direction: req.body?.direction ?? investments[idx].direction,
        amount: req.body?.amount ?? investments[idx].amount,
        date: req.body?.date ?? investments[idx].date,
        notes: req.body?.notes ?? investments[idx].notes,
        createdAt: investments[idx].createdAt,
      }),
    };
    investments[idx] = updated;
    await writeInvestments(investments);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: "Unable to update investment." });
  }
});

app.delete("/api/investments/:id", async (req, res) => {
  try {
    const investments = await readInvestments();
    const next = investments.filter((i) => i.id !== req.params.id);
    if (next.length === investments.length) {
      return res.status(404).json({ error: "Not found." });
    }
    await writeInvestments(next);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: "Unable to delete investment." });
  }
});

// Summary used by dashboard charts.
app.get("/api/summary", async (req, res) => {
  try {
    const investments = await readInvestments();
    const byType = {};
    const byCategory = {};
    const byMonth = {};

    investments.forEach((item) => {
      const signedAmount =
        String(item.direction || "credit").toLowerCase() === "debit"
          ? -Math.abs(Number(item.amount || 0))
          : Number(item.amount || 0);
      const typeKey = item.type || "Uncategorized";
      byType[typeKey] = (byType[typeKey] || 0) + signedAmount;

      const categoryKey = item.category || "Unspecified";
      byCategory[categoryKey] = (byCategory[categoryKey] || 0) + signedAmount;

      const monthKey = item.date ? item.date.slice(0, 7) : "Unknown";
      byMonth[monthKey] = (byMonth[monthKey] || 0) + signedAmount;
    });

    res.json({ byType, byCategory, byMonth });
  } catch (error) {
    res.status(500).json({ error: "Failed to load summary." });
  }
});

app.get("/api/export", (req, res) => {
  ensureDataFile()
    .then(() => res.download(FILE_PATH, "investments.xlsx"))
    .catch(() => res.status(500).json({ error: "Export failed." }));
});

const upload = multer({ dest: UPLOAD_DIR });

app.post("/api/import", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "File is required." });
  }
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(req.file.path);
    const sheet = workbook.worksheets[0];
    const rows = sheetToRows(sheet);
    const filtered = rows.filter((row) => {
      const hasData =
        String(row.type || "").trim() ||
        String(row.category || "").trim() ||
        String(row.name || "").trim() ||
        String(row.amount || "").trim() ||
        String(row.date || "").trim() ||
        String(row.notes || "").trim();
      return Boolean(hasData);
    });
    const normalized = filtered.map((row) => normalizeInvestment(row));

    await writeInvestments(normalized);
    fs.unlinkSync(req.file.path);
    res.json({ ok: true, count: normalized.length });
  } catch (error) {
    res.status(500).json({ error: "Import failed." });
  }
});

app.get("/api/autocomplete", async (req, res) => {
  const rawQuery = String(req.query.q || "");
  const query = normalizeQuery(rawQuery);
  if (!query) {
    return res.json({ suggestions: [] });
  }
  if (!ALPHA_VANTAGE_KEY) {
    return res.status(400).json({ error: "ALPHA_VANTAGE_KEY not configured." });
  }

  const cached = getCachedSuggestions(query);
  if (cached) {
    return res.json({ suggestions: cached, cached: true });
  }

  if (inflight.has(query)) {
    return inflight
      .get(query)
      .then((result) => res.json({ suggestions: result.suggestions, cached: true }))
      .catch(() => res.status(500).json({ error: "Autocomplete failed." }));
  }

  const fetchPromise = (async () => {
    let combined = [];
    let rateLimited = false;

    try {
      const mfapi = await fetchMfapiSuggestions(query);
      combined = mfapi.suggestions;
    } catch (error) {
      // ignore and fall back
    }

    if (!combined.length) {
      try {
        const alpha = await fetchAlphaSuggestions(query);
        rateLimited = alpha.rateLimited;
        combined = alpha.suggestions;
      } catch (error) {
        // ignore
      }
    }

    setCachedSuggestions(query, combined);
    return { suggestions: combined, rateLimited };
  })();

  inflight.set(query, fetchPromise);
  try {
    const { suggestions, rateLimited } = await fetchPromise;
    const tokens = query.split(" ");
    const filtered =
      tokens.length > 1
        ? suggestions.filter((item) => {
            const haystack = `${item.name} ${item.symbol}`.toLowerCase();
            return tokens.every((token) => haystack.includes(token));
          })
        : suggestions;

    const trimmed = filtered.slice(0, 8);
    res.json({ suggestions: trimmed, cached: false, rateLimited });
  } catch (error) {
    res.status(500).json({ error: "Autocomplete failed." });
  } finally {
    inflight.delete(query);
  }
});

app.post("/api/autocomplete/clear", (req, res) => {
  autoCache.clear();
  inflight.clear();
  res.json({ ok: true });
});

app.get("/api/drive/status", (req, res) => {
  const configured = isDriveConfigured();
  const connected = configured && fs.existsSync(DRIVE_TOKEN_PATH);
  res.json({ configured, connected });
});

app.get("/api/drive/auth-url", (req, res) => {
  if (!isDriveConfigured()) {
    return res.status(400).json({ error: "Google Drive not configured." });
  }
  const oAuth2Client = getOAuthClient();
  const url = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: DRIVE_SCOPES,
  });
  res.json({ url });
});

app.get("/api/drive/oauth2callback", async (req, res) => {
  if (!isDriveConfigured()) {
    return res.status(400).send("Google Drive not configured.");
  }
  const code = req.query.code;
  if (!code) {
    return res.status(400).send("Missing code.");
  }
  try {
    const oAuth2Client = getOAuthClient();
    const { tokens } = await oAuth2Client.getToken(code);
    saveDriveToken(tokens);
    res.send(
      "<html><body style='font-family:Arial; padding:40px;'>" +
        "<h2>Google Drive connected.</h2>" +
        "<p>You can close this tab and return to Investment Atlas.</p>" +
        "</body></html>"
    );
  } catch (error) {
    res.status(500).send("Failed to authenticate with Google Drive.");
  }
});

app.post("/api/drive/backup", async (req, res) => {
  try {
    await ensureDataFile();
    const drive = await getDriveClient();
    const folderId = await ensureDriveFolder(drive);
    const existing = await findDriveFile(drive, folderId);
    const media = {
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      body: fs.createReadStream(FILE_PATH),
    };

    let result;
    if (existing) {
      result = await drive.files.update({
        fileId: existing.id,
        media,
        requestBody: { name: DRIVE_FILE_NAME },
        fields: "id, modifiedTime, webViewLink",
      });
    } else {
      result = await drive.files.create({
        requestBody: {
          name: DRIVE_FILE_NAME,
          parents: [folderId],
        },
        media,
        fields: "id, webViewLink",
      });
    }

    res.json({
      ok: true,
      fileId: result.data.id,
      webViewLink: result.data.webViewLink || null,
    });
  } catch (error) {
    if (error.code === "drive_not_configured") {
      return res.status(400).json({ error: "Google Drive not configured." });
    }
    if (error.code === "drive_not_connected") {
      return res.status(401).json({ error: "Google Drive not connected." });
    }
    res.status(500).json({ error: "Backup failed." });
  }
});

app.post("/api/drive/import", async (req, res) => {
  try {
    const drive = await getDriveClient();
    const folderId = await ensureDriveFolder(drive);
    const existing = await findDriveFile(drive, folderId);
    if (!existing) {
      return res.status(404).json({ error: "No backup found in Google Drive." });
    }

    await ensureDataFile();
    await downloadDriveFile(drive, existing.id, FILE_PATH);

    res.json({ ok: true, modifiedTime: existing.modifiedTime || null });
  } catch (error) {
    if (error.code === "drive_not_configured") {
      return res.status(400).json({ error: "Google Drive not configured." });
    }
    if (error.code === "drive_not_connected") {
      return res.status(401).json({ error: "Google Drive not connected." });
    }
    res.status(500).json({ error: "Import failed." });
  }
});

app.listen(PORT, () => {
  ensureDataFile();
  console.log(`Server running on http://localhost:${PORT}`);
});
