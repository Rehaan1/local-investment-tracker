const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");
const { randomUUID } = require("crypto");

const PORT = process.env.PORT || 4000;
const app = express();

app.use(cors());
app.use(express.json({ limit: "2mb" }));

const DATA_DIR = path.join(__dirname, "data");
const FILE_PATH = path.join(DATA_DIR, "investments.xlsx");
const UPLOAD_DIR = path.join(__dirname, "uploads");
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

app.listen(PORT, () => {
  ensureDataFile();
  console.log(`Server running on http://localhost:${PORT}`);
});
