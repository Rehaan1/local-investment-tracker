import { BrowserRouter, NavLink, Route, Routes } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import Dashboard from "./pages/Dashboard";
import Ledger from "./pages/Ledger";
import "./App.css";

const DEFAULT_TYPES = [
  "Equity Mutual Fund",
  "Debt Mutual Fund",
  "Bonds",
  "Stocks",
  "REITs",
  "Gold",
  "Crypto",
  "Other",
];

const CATEGORY_OPTIONS = [
  "Large Cap",
  "Mid Cap",
  "Small Cap",
  "Flexi Cap",
  "Multi Cap",
  "Debt",
  "Hybrid",
  "International",
  "ETF",
  "Gold",
  "Real Estate",
  "Other",
];

const emptyForm = {
  type: DEFAULT_TYPES[0],
  category: "",
  name: "",
  direction: "credit",
  amount: "",
  date: "",
  notes: "",
};

function App() {
  const [investments, setInvestments] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [summary, setSummary] = useState({ byType: {}, byCategory: {}, byMonth: {} });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [importFile, setImportFile] = useState(null);

  const currency = useMemo(
    () => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }),
    []
  );

  const total = useMemo(
    () =>
      investments.reduce((sum, item) => {
        const amount = Number(item.amount || 0);
        const signed =
          String(item.direction || "credit").toLowerCase() === "debit"
            ? -Math.abs(amount)
            : amount;
        return sum + signed;
      }, 0),
    [investments]
  );

  async function fetchAll() {
    try {
      setIsLoading(true);
      setError("");
      const [listRes, summaryRes] = await Promise.all([
        fetch("/api/investments"),
        fetch("/api/summary"),
      ]);
      if (!listRes.ok) throw new Error("Failed to load investments.");
      if (!summaryRes.ok) throw new Error("Failed to load summary.");
      const listData = await listRes.json();
      const summaryData = await summaryRes.json();
      setInvestments(listData);
      setSummary(summaryData);
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    fetchAll();
  }, []);

  async function handleAdd(event) {
    event.preventDefault();
    try {
      setError("");
      const payload = {
        type: form.type,
        category: form.category,
        name: form.name,
        direction: form.direction,
        amount: Number(form.amount),
        date: form.date,
        notes: form.notes,
      };
      const res = await fetch("/api/investments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const msg = await res.json();
        throw new Error(msg.error || "Unable to add investment.");
      }
      setForm(emptyForm);
      await fetchAll();
    } catch (err) {
      setError(err.message || "Unable to add investment.");
    }
  }

  async function handleDelete(id) {
    try {
      setError("");
      const res = await fetch(`/api/investments/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Unable to delete.");
      await fetchAll();
    } catch (err) {
      setError(err.message || "Unable to delete.");
    }
  }

  async function handleUpdate(id, updates) {
    try {
      setError("");
      const res = await fetch(`/api/investments/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const msg = await res.json();
        throw new Error(msg.error || "Unable to update investment.");
      }
      await fetchAll();
    } catch (err) {
      setError(err.message || "Unable to update investment.");
    }
  }

  async function handleImport() {
    if (!importFile) return;
    try {
      setError("");
      const formData = new FormData();
      formData.append("file", importFile);
      const res = await fetch("/api/import", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Import failed.");
      setImportFile(null);
      await fetchAll();
    } catch (err) {
      setError(err.message || "Import failed.");
    }
  }

  function handleExport() {
    window.location.href = "/api/export";
  }

  return (
    <BrowserRouter>
      <div className="app">
        <header className="app-header">
          <div className="brand">
            <span className="brand-mark">IA</span>
            <div>
              <p className="eyebrow">Local Excel Ledger</p>
              <h1>Investment Atlas</h1>
            </div>
          </div>
          <nav className="nav">
            <NavLink to="/" end className={({ isActive }) => (isActive ? "active" : "")}>
              Dashboard
            </NavLink>
            <NavLink
              to="/ledger"
              className={({ isActive }) => (isActive ? "active" : "")}
            >
              Ledger
            </NavLink>
          </nav>
        </header>

        <Routes>
          <Route
            path="/"
            element={
              <Dashboard
                investments={investments}
                summary={summary}
                total={total}
                currency={currency}
                isLoading={isLoading}
              />
            }
          />
          <Route
            path="/ledger"
            element={
              <Ledger
                investments={investments}
                form={form}
                setForm={setForm}
                defaultTypes={DEFAULT_TYPES}
                categories={CATEGORY_OPTIONS}
                handleAdd={handleAdd}
                handleDelete={handleDelete}
                handleUpdate={handleUpdate}
                handleExport={handleExport}
                handleImport={handleImport}
                importFile={importFile}
                setImportFile={setImportFile}
                currency={currency}
                error={error}
                isLoading={isLoading}
              />
            }
          />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
