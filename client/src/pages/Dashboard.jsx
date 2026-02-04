import { useMemo } from "react";
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

function Dashboard({ investments, summary, total, currency, isLoading }) {
  const stats = useMemo(() => {
    const credits = investments.reduce((sum, item) => {
      const amount = Number(item.amount || 0);
      return String(item.direction || "credit").toLowerCase() === "debit"
        ? sum
        : sum + amount;
    }, 0);
    const debits = investments.reduce((sum, item) => {
      const amount = Number(item.amount || 0);
      return String(item.direction || "credit").toLowerCase() === "debit"
        ? sum + amount
        : sum;
    }, 0);
    const months = new Set(
      investments.map((item) => (item.date ? item.date.slice(0, 7) : "Unknown"))
    );
    const avgMonthly = months.size ? total / months.size : 0;

    const byType = new Map();
    const byCategory = new Map();
    const bySecurity = new Map();

    investments.forEach((item) => {
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

    const topType = [...byType.entries()].sort((a, b) => b[1] - a[1])[0];
    const topCategory = [...byCategory.entries()].sort((a, b) => b[1] - a[1])[0];
    const topSecurity = [...bySecurity.entries()].sort((a, b) => b[1] - a[1])[0];

    return {
      credits,
      debits,
      avgMonthly,
      topType,
      topCategory,
      topSecurity,
    };
  }, [investments, total]);

  const typeLabels = Object.keys(summary.byType || {});
  const typeValuesRaw = typeLabels.map((key) => summary.byType[key]);
  const typeLabelsFiltered = [];
  const typeValues = [];
  typeLabels.forEach((label, idx) => {
    const value = Math.max(typeValuesRaw[idx] || 0, 0);
    if (value > 0) {
      typeLabelsFiltered.push(label);
      typeValues.push(value);
    }
  });

  const categoryLabels = Object.keys(summary.byCategory || {});
  const categoryValuesRaw = categoryLabels.map((key) => summary.byCategory[key]);
  const categoryLabelsFiltered = [];
  const categoryValues = [];
  categoryLabels.forEach((label, idx) => {
    const value = Math.max(categoryValuesRaw[idx] || 0, 0);
    if (value > 0) {
      categoryLabelsFiltered.push(label);
      categoryValues.push(value);
    }
  });

  const monthLabels = Object.keys(summary.byMonth || {}).sort();
  const monthValues = monthLabels.map((key) => summary.byMonth[key]);

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
            <span>Total Invested</span>
            <strong>{currency.format(total)}</strong>
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

      <section className="grid">
        <div className="panel insight-panel">
          <h3>Top Exposures</h3>
          <div className="insight-row">
            <div>
              <p>Top Type</p>
              <strong>{stats.topType ? stats.topType[0] : "—"}</strong>
              <span>{stats.topType ? currency.format(stats.topType[1]) : ""}</span>
            </div>
            <div>
              <p>Top Category</p>
              <strong>{stats.topCategory ? stats.topCategory[0] : "—"}</strong>
              <span>
                {stats.topCategory ? currency.format(stats.topCategory[1]) : ""}
              </span>
            </div>
            <div>
              <p>Top Security</p>
              <strong>{stats.topSecurity ? stats.topSecurity[0] : "—"}</strong>
              <span>
                {stats.topSecurity ? currency.format(stats.topSecurity[1]) : ""}
              </span>
            </div>
          </div>
          {isLoading && <p className="muted">Updating insights...</p>}
        </div>

        <section className="panel chart-panel">
          <h3>Allocation by Type</h3>
          {typeLabelsFiltered.length ? <Pie data={pieData} /> : <p>No data yet.</p>}
        </section>

        <section className="panel chart-panel">
          <h3>Category Split</h3>
          {categoryLabelsFiltered.length ? (
            <Pie data={categoryData} />
          ) : (
            <p>No data yet.</p>
          )}
        </section>

        <section className="panel chart-panel">
          <h3>Monthly Flow</h3>
          {monthLabels.length ? <Bar data={barData} /> : <p>No data yet.</p>}
        </section>

        <section className="panel chart-panel">
          <h3>Growth Trend</h3>
          {monthLabels.length ? <Line data={lineData} /> : <p>No data yet.</p>}
        </section>
      </section>
    </main>
  );
}

export default Dashboard;
