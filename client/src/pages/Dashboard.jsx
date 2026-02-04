import { useMemo, useState } from "react";
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

const TOP_OPTIONS = [1, 3, 5, 7, 10];

function Dashboard({ investments, summary, total, currency, isLoading }) {
  const [filters, setFilters] = useState({
    type: "",
    category: "",
    flow: "",
    from: "",
    to: "",
  });
  const [topN, setTopN] = useState(1);

  const filteredInvestments = useMemo(() => {
    return investments.filter((item) => {
      const matchesType = filters.type ? item.type === filters.type : true;
      const matchesCategory = filters.category
        ? item.category === filters.category
        : true;
      const matchesFlow = filters.flow
        ? String(item.direction || "credit").toLowerCase() === filters.flow
        : true;
      const matchesFrom = filters.from ? item.date >= filters.from : true;
      const matchesTo = filters.to ? item.date <= filters.to : true;
      return matchesType && matchesCategory && matchesFlow && matchesFrom && matchesTo;
    });
  }, [investments, filters]);

  const derivedSummary = useMemo(() => {
    const byType = {};
    const byCategory = {};
    const byMonth = {};
    const byFlow = { credit: 0, debit: 0 };

    filteredInvestments.forEach((item) => {
      const amount = Number(item.amount || 0);
      const isDebit = String(item.direction || "credit").toLowerCase() === "debit";
      const signed = isDebit ? -Math.abs(amount) : amount;
      const typeKey = item.type || "Uncategorized";
      const categoryKey = item.category || "Unspecified";
      const monthKey = item.date ? item.date.slice(0, 7) : "Unknown";

      byType[typeKey] = (byType[typeKey] || 0) + signed;
      byCategory[categoryKey] = (byCategory[categoryKey] || 0) + signed;
      byMonth[monthKey] = (byMonth[monthKey] || 0) + signed;

      if (isDebit) {
        byFlow.debit += Math.abs(amount);
      } else {
        byFlow.credit += amount;
      }
    });

    return { byType, byCategory, byMonth, byFlow };
  }, [filteredInvestments]);

  const stats = useMemo(() => {
    const credits = filteredInvestments.reduce((sum, item) => {
      const amount = Number(item.amount || 0);
      return String(item.direction || "credit").toLowerCase() === "debit"
        ? sum
        : sum + amount;
    }, 0);
    const debits = filteredInvestments.reduce((sum, item) => {
      const amount = Number(item.amount || 0);
      return String(item.direction || "credit").toLowerCase() === "debit"
        ? sum + amount
        : sum;
    }, 0);
    const months = new Set(
      filteredInvestments.map((item) => (item.date ? item.date.slice(0, 7) : "Unknown"))
    );
    const avgMonthly = months.size ? (credits - debits) / months.size : 0;

    const byType = new Map();
    const byCategory = new Map();
    const bySecurity = new Map();

    filteredInvestments.forEach((item) => {
      const signed =
        String(item.direction || "credit").toLowerCase() === "debit"
          ? -Math.abs(Number(item.amount || 0))
          : Number(item.amount || 0);
      const typeKey = item.type || "Uncategorized";
      const categoryKey = item.category || "Unspecified";
      const securityKey = item.name || "Unnamed";
      byType.set(typeKey, (byType.get(typeKey) || 0) + signed);
      byCategory.set(categoryKey, (byCategory.get(categoryKey) || 0) + signed);
      bySecurity.set(securityKey, (bySecurity.get(securityKey) || 0) + signed);
    });

    const sortedTypes = [...byType.entries()].sort((a, b) => b[1] - a[1]);
    const sortedCategories = [...byCategory.entries()].sort((a, b) => b[1] - a[1]);
    const sortedSecurities = [...bySecurity.entries()].sort((a, b) => b[1] - a[1]);

    return {
      credits,
      debits,
      avgMonthly,
      topTypes: sortedTypes.slice(0, topN),
      topCategories: sortedCategories.slice(0, topN),
      topSecurities: sortedSecurities.slice(0, topN),
    };
  }, [filteredInvestments, topN]);

  const typeLabels = Object.keys(derivedSummary.byType || {});
  const typeValuesRaw = typeLabels.map((key) => derivedSummary.byType[key]);
  const typeLabelsFiltered = [];
  const typeValues = [];
  typeLabels.forEach((label, idx) => {
    const value = Math.max(typeValuesRaw[idx] || 0, 0);
    if (value > 0) {
      typeLabelsFiltered.push(label);
      typeValues.push(value);
    }
  });

  const categoryLabels = Object.keys(derivedSummary.byCategory || {});
  const categoryValuesRaw = categoryLabels.map((key) => derivedSummary.byCategory[key]);
  const categoryLabelsFiltered = [];
  const categoryValues = [];
  categoryLabels.forEach((label, idx) => {
    const value = Math.max(categoryValuesRaw[idx] || 0, 0);
    if (value > 0) {
      categoryLabelsFiltered.push(label);
      categoryValues.push(value);
    }
  });

  const monthLabels = Object.keys(derivedSummary.byMonth || {}).sort();
  const monthValues = monthLabels.map((key) => derivedSummary.byMonth[key]);

  const pieData = {
    labels: typeLabelsFiltered,
    datasets: [
      {
        data: typeValues,
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

  const categoryData = {
    labels: categoryLabelsFiltered,
    datasets: [
      {
        data: categoryValues,
        backgroundColor: [
          "#4361ee",
          "#4cc9f0",
          "#f72585",
          "#b5179e",
          "#4895ef",
          "#f8961e",
          "#43aa8b",
          "#ffb703",
          "#9b5de5",
          "#f94144",
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

  const flowData = {
    labels: ["Credit", "Debit"],
    datasets: [
      {
        data: [derivedSummary.byFlow.credit, derivedSummary.byFlow.debit],
        backgroundColor: ["#4cc9f0", "#f94144"],
        borderWidth: 0,
      },
    ],
  };

  const stackedData = {
    labels: monthLabels,
    datasets: [
      {
        label: "Credit",
        data: monthLabels.map((label) => {
          const monthItems = filteredInvestments.filter((item) =>
            item.date ? item.date.startsWith(label) : false
          );
          return monthItems
            .filter((item) => String(item.direction || "credit").toLowerCase() !== "debit")
            .reduce((sum, item) => sum + Number(item.amount || 0), 0);
        }),
        backgroundColor: "#4cc9f0",
      },
      {
        label: "Debit",
        data: monthLabels.map((label) => {
          const monthItems = filteredInvestments.filter((item) =>
            item.date ? item.date.startsWith(label) : false
          );
          return monthItems
            .filter((item) => String(item.direction || "credit").toLowerCase() === "debit")
            .reduce((sum, item) => sum + Number(item.amount || 0), 0);
        }),
        backgroundColor: "#f94144",
      },
    ],
  };

  return (
    <main className="page">
      <section className="hero">
        <div className="hero-text">
          <h2>Dashboard</h2>
          <p className="subtitle">
            Snapshot of your portfolio flow, allocation splits, and top exposures.
          </p>
        </div>
        <div className="hero-card">
          <div className="hero-metric">
            <span>Net Invested</span>
            <strong>{currency.format(stats.credits - stats.debits)}</strong>
          </div>
          <div className="hero-metric">
            <span>Total Credits</span>
            <strong>{currency.format(stats.credits)}</strong>
          </div>
          <div className="hero-metric">
            <span>Total Debits</span>
            <strong>{currency.format(stats.debits)}</strong>
          </div>
          <div className="hero-metric">
            <span>Avg Monthly</span>
            <strong>{currency.format(stats.avgMonthly)}</strong>
          </div>
        </div>
      </section>

      <section className="panel filter-panel">
        <div className="filter-bar">
          <div>
            <label>Type</label>
            <select
              value={filters.type}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, type: event.target.value }))
              }
            >
              <option value="">All</option>
              {Array.from(new Set(investments.map((i) => i.type).filter(Boolean))).map(
                (type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                )
              )}
            </select>
          </div>
          <div>
            <label>Category</label>
            <select
              value={filters.category}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, category: event.target.value }))
              }
            >
              <option value="">All</option>
              {Array.from(new Set(investments.map((i) => i.category).filter(Boolean))).map(
                (category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                )
              )}
            </select>
          </div>
          <div>
            <label>Flow</label>
            <select
              value={filters.flow}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, flow: event.target.value }))
              }
            >
              <option value="">All</option>
              <option value="credit">Credit</option>
              <option value="debit">Debit</option>
            </select>
          </div>
          <div>
            <label>From</label>
            <input
              type="date"
              value={filters.from}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, from: event.target.value }))
              }
            />
          </div>
          <div>
            <label>To</label>
            <input
              type="date"
              value={filters.to}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, to: event.target.value }))
              }
            />
          </div>
          <button
            className="button ghost tiny"
            type="button"
            onClick={() => setFilters({ type: "", category: "", flow: "", from: "", to: "" })}
          >
            Clear Filters
          </button>
        </div>
      </section>

      <section className="grid dashboard-grid">
        <div className="panel insight-panel">
          <div className="panel-header">
            <div>
              <h3>Top Exposures</h3>
              <p className="muted">Showing top {topN} across categories.</p>
            </div>
            <div className="top-select">
              <span>Top N</span>
              <div className="pill-select">
                {TOP_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className={option === topN ? "pill active" : "pill"}
                    onClick={() => setTopN(option)}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="insight-row">
            <div>
              <p>Top Types</p>
              {stats.topTypes.length ? (
                <ul className="exposure-list">
                  {stats.topTypes.map(([label, value]) => (
                    <li key={label}>
                      <span>{label}</span>
                      <strong>{currency.format(value)}</strong>
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="muted">—</span>
              )}
            </div>
            <div>
              <p>Top Categories</p>
              {stats.topCategories.length ? (
                <ul className="exposure-list">
                  {stats.topCategories.map(([label, value]) => (
                    <li key={label}>
                      <span>{label}</span>
                      <strong>{currency.format(value)}</strong>
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="muted">—</span>
              )}
            </div>
            <div>
              <p>Top Securities</p>
              {stats.topSecurities.length ? (
                <ul className="exposure-list">
                  {stats.topSecurities.map(([label, value]) => (
                    <li key={label}>
                      <span>{label}</span>
                      <strong>{currency.format(value)}</strong>
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="muted">—</span>
              )}
            </div>
          </div>
          {isLoading && <p className="muted">Updating insights...</p>}
        </div>

        <section className="panel chart-panel chart-card">
          <h3>Allocation by Type</h3>
          {typeLabelsFiltered.length ? <Pie data={pieData} /> : <p>No data yet.</p>}
        </section>

        <section className="panel chart-panel chart-card">
          <h3>Category Split</h3>
          {categoryLabelsFiltered.length ? (
            <Pie data={categoryData} />
          ) : (
            <p>No data yet.</p>
          )}
        </section>

        <section className="panel chart-panel chart-card">
          <h3>Credit vs Debit</h3>
          {derivedSummary.byFlow.credit || derivedSummary.byFlow.debit ? (
            <Pie data={flowData} />
          ) : (
            <p>No data yet.</p>
          )}
        </section>

        <section className="panel chart-panel chart-card">
          <h3>Credits vs Debits (Monthly)</h3>
          {monthLabels.length ? (
            <Bar
              data={stackedData}
              options={{
                responsive: true,
                plugins: { legend: { position: "bottom" } },
                scales: { x: { stacked: true }, y: { stacked: true } },
              }}
            />
          ) : (
            <p>No data yet.</p>
          )}
        </section>

        <section className="panel chart-panel chart-card">
          <h3>Monthly Trend</h3>
          {monthLabels.length ? <Line data={lineData} /> : <p>No data yet.</p>}
        </section>

        <section className="panel chart-panel chart-card">
          <h3>Monthly Net Flow</h3>
          {monthLabels.length ? <Bar data={barData} /> : <p>No data yet.</p>}
        </section>
      </section>
    </main>
  );
}

export default Dashboard;
