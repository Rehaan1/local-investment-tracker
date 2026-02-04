import { useEffect, useMemo, useState } from "react";

const PAGE_SIZE = 10;

function Ledger({
  investments,
  form,
  setForm,
  defaultTypes,
  categories,
  handleAdd,
  handleDelete,
  handleUpdate,
  handleExport,
  handleImport,
  importFile,
  setImportFile,
  currency,
  error,
  isLoading,
  driveStatus,
  driveMessage,
  isBackingUp,
  onConnectDrive,
  onDriveBackup,
}) {
  const [suggestions, setSuggestions] = useState([]);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState("");
  const [noResults, setNoResults] = useState(false);
  const [lastQuery, setLastQuery] = useState("");
  const [editingItem, setEditingItem] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [filters, setFilters] = useState({
    type: "",
    category: "",
    flow: "",
    text: "",
    from: "",
    to: "",
  });
  const [page, setPage] = useState(1);

  const sortedInvestments = useMemo(
    () => [...investments].sort((a, b) => b.date.localeCompare(a.date)),
    [investments]
  );

  const filteredInvestments = useMemo(() => {
    const text = filters.text.trim().toLowerCase();
    return sortedInvestments.filter((item) => {
      const matchesType = filters.type ? item.type === filters.type : true;
      const matchesCategory = filters.category
        ? item.category === filters.category
        : true;
      const matchesFlow = filters.flow
        ? String(item.direction || "credit").toLowerCase() === filters.flow
        : true;
      const matchesFrom = filters.from ? item.date >= filters.from : true;
      const matchesTo = filters.to ? item.date <= filters.to : true;
      const matchesText = text
        ? `${item.name || ""} ${item.notes || ""} ${item.type || ""} ${
            item.category || ""
          }`
            .toLowerCase()
            .includes(text)
        : true;
      return (
        matchesType &&
        matchesCategory &&
        matchesFlow &&
        matchesFrom &&
        matchesTo &&
        matchesText
      );
    });
  }, [sortedInvestments, filters]);

  const totalPages = Math.max(1, Math.ceil(filteredInvestments.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageSlice = filteredInvestments.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  useEffect(() => {
    setPage(1);
  }, [filters, investments.length]);

  // Debounced autocomplete requests to reduce API calls.
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

  // Clear server-side autocomplete cache.
  async function handleClearCache() {
    try {
      await fetch("/api/autocomplete/clear", { method: "POST" });
      setSuggestions([]);
      setNoResults(false);
    } catch (err) {
      setSuggestError("Unable to clear cache.");
    }
  }

  // Open the edit drawer with a copy of the entry.
  function openEdit(item) {
    setEditingItem(item);
    setEditForm({
      type: item.type || defaultTypes[0],
      category: item.category || "",
      name: item.name || "",
      direction: item.direction || "credit",
      amount: String(item.amount ?? ""),
      date: item.date || "",
      notes: item.notes || "",
    });
  }

  function closeEdit() {
    setEditingItem(null);
    setEditForm(null);
  }

  // Persist edit drawer changes.
  async function submitEdit(event) {
    event.preventDefault();
    if (!editingItem || !editForm) return;
    await handleUpdate(editingItem.id, {
      type: editForm.type,
      category: editForm.category,
      name: editForm.name,
      direction: editForm.direction,
      amount: Number(editForm.amount),
      date: editForm.date,
      notes: editForm.notes,
    });
    closeEdit();
  }

  const editTotal = useMemo(() => {
    if (!editingItem || !editForm) return 0;
    const amount = Number(editForm.amount || 0);
    const isDebit = String(editForm.direction || "credit").toLowerCase() === "debit";
    return isDebit ? -Math.abs(amount) : amount;
  }, [editingItem, editForm]);

  return (
    <main className="page">
      <section className="hero ledger-hero">
        <div className="hero-text">
          <h2>Ledger</h2>
          <p className="subtitle">
            Add transactions, export for backup, or import if you ever need to
            restore your data.
          </p>
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

      <section className="grid ledger-grid">
        <section className="panel action-panel">
          <h3>Quick Actions</h3>
          <div className="cta-row">
            <button className="button primary" onClick={handleExport}>
              Export Excel
            </button>
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
          <p className="muted">Use import only if you need to restore a backup.</p>
        </section>

        <section className="panel drive-panel">
          <div>
            <p className="eyebrow">Google Drive Backup</p>
            <p className="muted">
              {driveStatus.configured
                ? driveStatus.connected
                  ? "Connected"
                  : "Not connected"
                : "Not configured"}
            </p>
          </div>
          <div className="drive-actions">
            {!driveStatus.connected && driveStatus.configured && (
              <button className="button ghost tiny" onClick={onConnectDrive}>
                Connect Drive
              </button>
            )}
            <button
              className="button primary tiny"
              onClick={onDriveBackup}
              disabled={!driveStatus.connected || isBackingUp}
            >
              {isBackingUp ? "Backing Up..." : "Backup Now"}
            </button>
          </div>
          {driveMessage && <p className="hint">{driveMessage}</p>}
        </section>

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
                {defaultTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
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
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
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
              <label>Search</label>
              <input
                type="text"
                value={filters.text}
                onChange={(event) =>
                  setFilters((prev) => ({ ...prev, text: event.target.value }))
                }
                placeholder="Name or notes"
              />
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
            <div className="filter-actions">
              <button
                className="button ghost tiny"
                type="button"
                onClick={() =>
                  setFilters({ type: "", category: "", flow: "", text: "", from: "", to: "" })
                }
              >
                Clear Filters
              </button>
            </div>
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
            {pageSlice.length === 0 && (
              <div className="ledger-empty">No entries match your filters.</div>
            )}
            {pageSlice.map((item) => {
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
                  <span className="row-actions">
                    <button className="button ghost tiny" onClick={() => openEdit(item)}>
                      Edit
                    </button>
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
          <div className="pagination">
            <span className="muted">
              Page {currentPage} of {totalPages} • {filteredInvestments.length} items
            </span>
            <div className="pagination-controls">
              <button
                className="button ghost tiny"
                type="button"
                onClick={() => setPage(1)}
                disabled={currentPage === 1}
              >
                First
              </button>
              <button
                className="button ghost tiny"
                type="button"
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
              >
                Prev
              </button>
              <button
                className="button ghost tiny"
                type="button"
                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
              >
                Next
              </button>
              <button
                className="button ghost tiny"
                type="button"
                onClick={() => setPage(totalPages)}
                disabled={currentPage === totalPages}
              >
                Last
              </button>
            </div>
          </div>
        </section>
      </section>

      {editingItem && editForm && (
        <div className="drawer-overlay" onClick={closeEdit}>
          <aside className="drawer" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <p className="eyebrow">Edit Entry</p>
                <h3>{editForm.name || "Investment"}</h3>
              </div>
              <button className="button ghost tiny" onClick={closeEdit}>
                Close
              </button>
            </div>
            <div className="drawer-summary">
              <div>
                <span>Net Amount</span>
                <strong
                  className={editTotal < 0 ? "amount negative" : "amount positive"}
                >
                  {currency.format(editTotal)}
                </strong>
              </div>
              <div>
                <span>Date</span>
                <strong>{editForm.date || "—"}</strong>
              </div>
            </div>
            <form className="drawer-form" onSubmit={submitEdit}>
              <label>
                Type
                <select
                  value={editForm.type}
                  onChange={(event) =>
                    setEditForm((prev) => ({ ...prev, type: event.target.value }))
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
                  value={editForm.category}
                  onChange={(event) =>
                    setEditForm((prev) => ({ ...prev, category: event.target.value }))
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
              <label>
                Security Name
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(event) =>
                    setEditForm((prev) => ({ ...prev, name: event.target.value }))
                  }
                />
              </label>
              <label>
                Flow
                <select
                  value={editForm.direction}
                  onChange={(event) =>
                    setEditForm((prev) => ({ ...prev, direction: event.target.value }))
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
                  value={editForm.amount}
                  onChange={(event) =>
                    setEditForm((prev) => ({ ...prev, amount: event.target.value }))
                  }
                  required
                />
              </label>
              <label>
                Date Invested
                <input
                  type="date"
                  value={editForm.date}
                  onChange={(event) =>
                    setEditForm((prev) => ({ ...prev, date: event.target.value }))
                  }
                  required
                />
              </label>
              <label>
                Notes
                <input
                  type="text"
                  value={editForm.notes}
                  onChange={(event) =>
                    setEditForm((prev) => ({ ...prev, notes: event.target.value }))
                  }
                />
              </label>
              <div className="drawer-actions">
                <button className="button ghost" type="button" onClick={closeEdit}>
                  Cancel
                </button>
                <button className="button primary" type="submit">
                  Save Changes
                </button>
              </div>
            </form>
          </aside>
        </div>
      )}
    </main>
  );
}

export default Ledger;
