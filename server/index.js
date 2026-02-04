const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const { randomUUID } = require("crypto");

const PORT = process.env.PORT || 4000;
const app = express();

app.use(cors());
app.use(express.json({ limit: "2mb" }));

const DATA_DIR = path.join(__dirname, "data");
const FILE_PATH = path.join(DATA_DIR, "investments.xlsx");
const SHEET_NAME = "Investments";
const HEADERS = ["id", "type", "name", "direction", "amount", "date", "notes", "createdAt"];

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(FILE_PATH)) {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([HEADERS]);
    XLSX.utils.book_append_sheet(workbook, sheet, SHEET_NAME);
    XLSX.writeFile(workbook, FILE_PATH);
  }
}

function readInvestments() {
  ensureDataFile();
  const workbook = XLSX.readFile(FILE_PATH);
  const sheet = workbook.Sheets[SHEET_NAME] || workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  return rows.map((row) => ({
    id: String(row.id || "").trim(),
    type: String(row.type || "").trim(),
    name: String(row.name || "").trim(),
    direction: String(row.direction || "credit").trim() || "credit",
    amount: Number(row.amount || 0),
    date: String(row.date || "").trim(),
    notes: String(row.notes || "").trim(),
    createdAt: String(row.createdAt || "").trim(),
  })).filter((row) => row.id);
}

function writeInvestments(investments) {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(investments, { header: HEADERS });
  XLSX.utils.book_append_sheet(workbook, sheet, SHEET_NAME);
  XLSX.writeFile(workbook, FILE_PATH);
}

function normalizeInvestment(input) {
  return {
    id: input.id || randomUUID(),
    type: String(input.type || "").trim(),
    name: String(input.name || "").trim(),
    direction: String(input.direction || "credit").trim() || "credit",
    amount: Number(input.amount || 0),
    date: String(input.date || "").trim(),
    notes: String(input.notes || "").trim(),
    createdAt: input.createdAt || new Date().toISOString(),
  };
}

app.get("/api/investments", (req, res) => {
  const investments = readInvestments();
  res.json(investments);
});

app.post("/api/investments", (req, res) => {
  const { type, name, direction, amount, date, notes } = req.body || {};
  if (!type || !date || Number.isNaN(Number(amount))) {
    return res.status(400).json({ error: "type, amount, and date are required." });
  }
  const investments = readInvestments();
  const newItem = normalizeInvestment({ type, name, direction, amount, date, notes });
  investments.push(newItem);
  writeInvestments(investments);
  res.status(201).json(newItem);
});

app.put("/api/investments/:id", (req, res) => {
  const investments = readInvestments();
  const idx = investments.findIndex((i) => i.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: "Not found." });
  }
  const updated = {
    ...investments[idx],
      ...normalizeInvestment({
        id: investments[idx].id,
        type: req.body?.type ?? investments[idx].type,
        name: req.body?.name ?? investments[idx].name,
        direction: req.body?.direction ?? investments[idx].direction,
        amount: req.body?.amount ?? investments[idx].amount,
        date: req.body?.date ?? investments[idx].date,
        notes: req.body?.notes ?? investments[idx].notes,
        createdAt: investments[idx].createdAt,
    }),
  };
  investments[idx] = updated;
  writeInvestments(investments);
  res.json(updated);
});

app.delete("/api/investments/:id", (req, res) => {
  const investments = readInvestments();
  const next = investments.filter((i) => i.id !== req.params.id);
  if (next.length === investments.length) {
    return res.status(404).json({ error: "Not found." });
  }
  writeInvestments(next);
  res.json({ ok: true });
});

app.get("/api/summary", (req, res) => {
  const investments = readInvestments();
  const byType = {};
  const byMonth = {};

  investments.forEach((item) => {
    const signedAmount =
      String(item.direction || "credit").toLowerCase() === "debit"
        ? -Math.abs(Number(item.amount || 0))
        : Number(item.amount || 0);
    const typeKey = item.type || "Uncategorized";
    byType[typeKey] = (byType[typeKey] || 0) + signedAmount;

    const monthKey = item.date ? item.date.slice(0, 7) : "Unknown";
    byMonth[monthKey] = (byMonth[monthKey] || 0) + signedAmount;
  });

  res.json({ byType, byMonth });
});

app.get("/api/export", (req, res) => {
  ensureDataFile();
  res.download(FILE_PATH, "investments.xlsx");
});

const upload = multer({ dest: path.join(__dirname, "uploads") });

app.post("/api/import", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "File is required." });
  }
  const workbook = XLSX.readFile(req.file.path);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  const normalized = rows.map((row) => normalizeInvestment(row)).filter((row) => row.id);

  writeInvestments(normalized);
  fs.unlinkSync(req.file.path);
  res.json({ ok: true, count: normalized.length });
});

app.listen(PORT, () => {
  ensureDataFile();
  console.log(`Server running on http://localhost:${PORT}`);
});
