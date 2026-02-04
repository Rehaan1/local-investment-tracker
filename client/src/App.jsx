import { useEffect, useMemo, useState } from "react";
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
} from "chart.js";
import { Pie, Bar, Line } from "react-chartjs-2";
import "./App.css";

ChartJS.register(
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement
);

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

const emptyForm = {
  type: DEFAULT_TYPES[0],
  name: "",
  direction: "credit",
  amount: "",
  date: "",
  notes: "",
};

function App() {
  const [investments, setInvestments] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [summary, setSummary] = useState({ byType: {}, byMonth: {} });
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

  const sortedInvestments = [...investments].sort((a, b) =>
    b.date.localeCompare(a.date)
  );

  const typeLabels = Object.keys(summary.byType || {});
  const typeValuesRaw = typeLabels.map((key) => summary.byType[key]);
  const pieLabels = [];
  const pieValues = [];
  typeLabels.forEach((label, idx) => {
    const value = Math.max(typeValuesRaw[idx] || 0, 0);
    if (value > 0) {
      pieLabels.push(label);
      pieValues.push(value);
    }
  });

  const monthLabels = Object.keys(summary.byMonth || {}).sort();
  const monthValues = monthLabels.map((key) => summary.byMonth[key]);

  const pieData = {
    labels: pieLabels,
    datasets: [
      {
        data: pieValues,
        backgroundColor: [
          "#ffb703",
          "#8ecae6",
          "#219ebc",
          "#90be6d",
          "#f94144",
          "#f9c74f",
          "#577590",
          "#f8961e",
        ],
        borderWidth: 0,
      },
    ],
  };

  const barData = {
    labels: monthLabels,
    datasets: [
      {
        label: "Net Flow",
        data: monthValues,
        backgroundColor: "#4cc9f0",
        borderRadius: 8,
      },
    ],
  };

  const lineData = {
    labels: monthLabels,
    datasets: [
      {
        label: "Net Flow",
        data: monthValues,
        borderColor: "#f72585",
        backgroundColor: "rgba(247, 37, 133, 0.2)",
        fill: true,
        tension: 0.35,
      },
    ],
  };

  return (
    <div className="app">
      <header className="hero">
        <div className="hero-text">
          <p className="eyebrow">Local Excel Ledger</p>
          <h1>Investment Atlas</h1>
          <p className="subtitle">
            Track every contribution, visualize allocation, and keep a local
            Excel backup you can sync to Google Drive anytime.
          </p>
          <div className="cta-row">
            <button className="button primary" onClick={handleExport}>
              Export Excel
            </button>
            <div className="import-group">
              <label className="file-button">
                Import Excel
                <input
                  type="file"
                  accept=".xlsx"
                  onChange={(event) => setImportFile(event.target.files?.[0])}
                />
              </label>
              <button
                className="button ghost"
                onClick={handleImport}
                disabled={!importFile}
              >
                Apply Import
              </button>
            </div>
          </div>
        </div>
        <div className="hero-card">
          <div className="hero-metric">
            <span>Total Invested</span>
            <strong>{currency.format(total)}</strong>
          </div>
          <div className="hero-metric">
            <span>Entries</span>
            <strong>{investments.length}</strong>
          </div>
          <div className="hero-metric">
            <span>Asset Types</span>
            <strong>{typeLabels.length || 0}</strong>
          </div>
        </div>
      </header>

      <main className="grid">
        <section className="panel form-panel">
          <h2>Add Investment</h2>
          <form onSubmit={handleAdd}>
            <label>
              Type
              <select
                value={form.type}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, type: event.target.value }))
                }
              >
                {DEFAULT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Security Name
              <input
                type="text"
                value={form.name}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, name: event.target.value }))
                }
                placeholder="e.g. SBI Bluechip Fund"
              />
            </label>
            <label>
              Flow
              <select
                value={form.direction}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, direction: event.target.value }))
                }
              >
                <option value="credit">Credit (Invested)</option>
                <option value="debit">Debit (Withdrawn)</option>
              </select>
            </label>
            <label>
              Amount (INR)
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.amount}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, amount: event.target.value }))
                }
                placeholder="e.g. 5000"
                required
              />
            </label>
            <label>
              Date Invested
              <input
                type="date"
                value={form.date}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, date: event.target.value }))
                }
                required
              />
            </label>
            <label>
              Notes
              <input
                type="text"
                value={form.notes}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, notes: event.target.value }))
                }
                placeholder="Optional"
              />
            </label>
            <button className="button primary" type="submit">
              Add to Ledger
            </button>
          </form>
          {error && <p className="error">{error}</p>}
          {isLoading && <p className="muted">Syncing ledger...</p>}
        </section>

        <section className="panel chart-panel">
          <h2>Allocation by Type</h2>
          {pieLabels.length ? <Pie data={pieData} /> : <p>No data yet.</p>}
        </section>

        <section className="panel chart-panel">
          <h2>Monthly Flow</h2>
          {monthLabels.length ? (
            <Bar data={barData} />
          ) : (
            <p>No data yet.</p>
          )}
        </section>

        <section className="panel chart-panel">
          <h2>Growth Trend</h2>
          {monthLabels.length ? (
            <Line data={lineData} />
          ) : (
            <p>No data yet.</p>
          )}
        </section>

        <section className="panel ledger-panel">
          <div className="ledger-header">
            <h2>Ledger</h2>
            <p className="muted">Stored locally at `server/data/investments.xlsx`.</p>
          </div>
          <div className="ledger-table">
            <div className="ledger-row ledger-head">
              <span>Type</span>
              <span>Security</span>
              <span>Flow</span>
              <span>Date</span>
              <span>Amount</span>
              <span>Notes</span>
              <span></span>
            </div>
            {sortedInvestments.length === 0 && (
              <div className="ledger-empty">Add your first investment.</div>
            )}
            {sortedInvestments.map((item) => {
              const amount = Number(item.amount || 0);
              const isDebit = String(item.direction || "credit").toLowerCase() === "debit";
              const signedAmount = isDebit ? -Math.abs(amount) : amount;
              return (
                <div className="ledger-row" key={item.id}>
                  <span>{item.type}</span>
                  <span>{item.name || "—"}</span>
                  <span className={isDebit ? "chip debit" : "chip credit"}>
                    {isDebit ? "Debit" : "Credit"}
                  </span>
                  <span>{item.date}</span>
                  <span className={signedAmount < 0 ? "amount negative" : "amount positive"}>
                    {currency.format(signedAmount)}
                  </span>
                  <span>{item.notes || "—"}</span>
                  <span>
                    <button
                      className="button danger"
                      onClick={() => handleDelete(item.id)}
                    >
                      Remove
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
