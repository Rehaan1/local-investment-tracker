import { useEffect, useState } from "react";

function Ledger({
  investments,
  form,
  setForm,
  defaultTypes,
  categories,
  handleAdd,
  handleDelete,
  handleExport,
  handleImport,
  importFile,
  setImportFile,
  currency,
  error,
  isLoading,
}) {
  const [suggestions, setSuggestions] = useState([]);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState("");
  const [noResults, setNoResults] = useState(false);
  const [lastQuery, setLastQuery] = useState("");

  const sortedInvestments = [...investments].sort((a, b) =>
    b.date.localeCompare(a.date)
  );

  useEffect(() => {
    if (!form.name || form.name.trim().length < 2) {
      setSuggestions([]);
      setNoResults(false);
      return;
    }

    const controller = new AbortController();
    const handle = setTimeout(async () => {
      try {
        setIsSuggesting(true);
        setSuggestError("");
        setNoResults(false);
        const query = form.name.trim();
        setLastQuery(query);
        const res = await fetch(`/api/autocomplete?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          setSuggestions([]);
          setNoResults(true);
          return;
        }
        const data = await res.json();
        const list = Array.isArray(data.suggestions) ? data.suggestions : [];
        const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
        const filtered =
          tokens.length > 1
            ? list.filter((item) => {
                const haystack = `${item.name} ${item.symbol}`.toLowerCase();
                return tokens.every((token) => haystack.includes(token));
              })
            : list;
        setSuggestions(filtered);
        setNoResults(filtered.length === 0);
      } catch (err) {
        if (err.name !== "AbortError") {
          setSuggestError("Autocomplete unavailable.");
        }
      } finally {
        setIsSuggesting(false);
      }
    }, 400);

    return () => {
      controller.abort();
      clearTimeout(handle);
    };
  }, [form.name]);

  function handlePickSuggestion(item) {
    setForm((prev) => ({ ...prev, name: item.name || "" }));
    setSuggestions([]);
    setNoResults(false);
  }

  async function handleClearCache() {
    try {
      await fetch("/api/autocomplete/clear", { method: "POST" });
      setSuggestions([]);
      setNoResults(false);
    } catch (err) {
      setSuggestError("Unable to clear cache.");
    }
  }

  return (
    <main className="page">
      <section className="hero ledger-hero">
        <div className="hero-text">
          <h2>Ledger</h2>
          <p className="subtitle">
            Add transactions, export for backup, or import if you ever need to
            restore your data.
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
            <span>Entries</span>
            <strong>{investments.length}</strong>
          </div>
          <div className="hero-metric">
            <span>Storage</span>
            <strong>Excel</strong>
          </div>
          <div className="hero-metric">
            <span>Path</span>
            <strong>Local</strong>
          </div>
        </div>
      </section>

      <section className="grid">
        <section className="panel form-panel">
          <h3>Add Investment</h3>
          <form onSubmit={handleAdd}>
            <label>
              Type
              <select
                value={form.type}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, type: event.target.value }))
                }
              >
                {defaultTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Cap / Category (optional)
              <select
                value={form.category}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, category: event.target.value }))
                }
              >
                <option value="">Unspecified</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>
            <label className="autocomplete">
              Security Name
              <input
                type="text"
                value={form.name}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, name: event.target.value }))
                }
                placeholder="e.g. SBI Bluechip Fund"
                autoComplete="off"
              />
              {Boolean(suggestions.length) && (
                <div className="suggestions">
                  {suggestions.map((item, idx) => (
                    <button
                      type="button"
                      key={`${item.symbol}-${idx}`}
                      onClick={() => handlePickSuggestion(item)}
                    >
                      <span className="suggest-name">{item.name}</span>
                      <span className="suggest-meta">
                        {item.symbol} • {item.region} • {item.currency}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {!suggestions.length && isSuggesting && (
                <div className="suggestions empty">Searching...</div>
              )}
              {!suggestions.length && !isSuggesting && noResults && (
                <div className="suggestions empty">
                  No results found for "{lastQuery}"
                </div>
              )}
              {suggestError && <span className="hint">{suggestError}</span>}
            </label>
            <div className="cache-row">
              <button className="button ghost tiny" type="button" onClick={handleClearCache}>
                Clear Autocomplete Cache
              </button>
            </div>
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

        <section className="panel ledger-panel">
          <div className="ledger-header">
            <h3>Ledger</h3>
            <p className="muted">Stored locally at `server/data/investments.xlsx`.</p>
          </div>
          <div className="ledger-table">
            <div className="ledger-row ledger-head">
              <span>Type</span>
              <span>Category</span>
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
                  <span>{item.category || "—"}</span>
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
      </section>
    </main>
  );
}

export default Ledger;
