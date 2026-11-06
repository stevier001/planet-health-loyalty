
"use client";

import { useEffect, useState } from "react";

type Customer = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  stamps: number;
};

export default function StaffPage() {
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [addingStamp, setAddingStamp] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function checkSession() {
      try {
        const response = await fetch("/api/staff-session", {
          cache: "no-store",
        });
        setAuthenticated(response.ok);
      } catch {
        setAuthenticated(false);
      } finally {
        setChecking(false);
      }
    }

    checkSession();
  }, []);

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/staff-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setError(data.message || "Incorrect PIN. Please try again.");
        return;
      }

      setAuthenticated(true);
      setPin("");
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/staff-logout", { method: "POST" });
    setAuthenticated(false);
    setSelected(null);
    setCustomers([]);
    setSearch("");
  }

  async function handleSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (search.trim().length < 2) {
      setError("Enter at least 2 characters.");
      return;
    }

    setSearching(true);
    setError("");
    setMessage("");
    setSelected(null);

    try {
      const response = await fetch(
        `/api/customer-search?q=${encodeURIComponent(search.trim())}`,
        { cache: "no-store" }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Customer search failed.");
      }

      setCustomers(data.customers || []);

      if (!data.customers?.length) {
        setMessage("No customers found. Try another search.");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to search customers."
      );
      setCustomers([]);
    } finally {
      setSearching(false);
    }
  }

  async function handleAddStamp() {
    if (!selected || addingStamp || selected.stamps >= 6) return;

    const confirmed = window.confirm(
      `Add one loyalty stamp to ${selected.firstName} ${selected.lastName}?`
    );

    if (!confirmed) return;

    setAddingStamp(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch("/api/stamp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: selected.id }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to add stamp.");
      }

      const updatedCustomer = {
        ...selected,
        stamps: data.stamps,
      };

      setSelected(updatedCustomer);

      setCustomers((current) =>
        current.map((customer) =>
          customer.id === updatedCustomer.id
            ? updatedCustomer
            : customer
        )
      );

      setMessage(data.message);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to add stamp."
      );
    } finally {
      setAddingStamp(false);
    }
  }

  if (checking) {
    return <main style={styles.page}>LOADING STAFF PORTAL...</main>;
  }

  if (!authenticated) {
    return (
      <main style={styles.page}>
        <div style={styles.card}>
          <div style={styles.logo}>
            PLANET HEALTH<span style={styles.green}>.</span>
          </div>

          <div style={styles.eyebrow}>LOYALTY REWARDS</div>

          <h1 style={styles.heading}>
            STAFF
            <br />
            <span style={styles.green}>ACCESS.</span>
          </h1>

          <p style={styles.description}>
            Enter your staff PIN to access the loyalty control panel.
          </p>

          <form onSubmit={handleLogin}>
            <label style={styles.label}>STAFF PIN</label>

            <input
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="Enter your PIN"
              required
              style={styles.input}
            />

            {error && <p style={styles.error}>{error}</p>}

            <button
              type="submit"
              disabled={loading || !pin}
              style={styles.button}
            >
              {loading ? "CHECKING..." : "ACCESS STAFF PORTAL →"}
            </button>
          </form>

          <div style={styles.footer}>PLANET HEALTH · STAFF ONLY</div>
        </div>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <div style={styles.dashboard}>
        <header style={styles.header}>
          <div>
            <div style={styles.logo}>
              PLANET HEALTH<span style={styles.green}>.</span>
            </div>
            <div style={styles.eyebrow}>STAFF CONTROL PANEL</div>
          </div>

          <button onClick={handleLogout} style={styles.logout}>
            LOG OUT
          </button>
        </header>

        <h1 style={styles.heading}>
          GOOD FOOD.
          <br />
          <span style={styles.green}>GOOD REWARDS.</span>
        </h1>

        <p style={styles.description}>
          Find a customer and manage their loyalty stamps.
        </p>

        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>FIND A CUSTOMER</h2>

          <form onSubmit={handleSearch}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Customer name or email..."
              style={styles.input}
            />

            <button
              type="submit"
              disabled={searching || search.trim().length < 2}
              style={styles.button}
            >
              {searching ? "SEARCHING..." : "SEARCH CUSTOMERS →"}
            </button>
          </form>

          {error && <p style={styles.error}>{error}</p>}
          {message && <p style={styles.message}>{message}</p>}

          {customers.length > 0 && (
            <div style={styles.results}>
              <div style={styles.resultHeading}>
                SEARCH RESULTS ({customers.length})
              </div>

              {customers.map((customer) => (
                <button
                  key={customer.id}
                  onClick={() => {
                    setSelected(customer);
                    setMessage("");
                    setError("");
                  }}
                  style={{
                    ...styles.customer,
                    borderColor:
                      selected?.id === customer.id ? "#45e017" : "#ddd",
                  }}
                >
                  <span>
                    <strong>
                      {customer.firstName} {customer.lastName}
                    </strong>
                    <small>{customer.email}</small>
                  </span>

                  <span style={styles.customerStamps}>
                    {customer.stamps}/6 →
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        {selected && (
          <section style={styles.loyaltyCard}>
            <div style={styles.eyebrow}>CUSTOMER LOYALTY CARD</div>

            <h2 style={styles.customerName}>
              {selected.firstName} {selected.lastName}
            </h2>

            <p style={styles.customerEmail}>{selected.email}</p>

            <div style={styles.stampGrid}>
              {Array.from({ length: 6 }, (_, index) => {
                const earned = index < selected.stamps;

                return (
                  <div
                    key={index}
                    style={{
                      ...styles.stamp,
                      background: earned ? "#B4FF00" : "transparent",
                      color: earned ? "#111" : "#fff",
                    }}
                  >
                    {earned ? "✓" : index + 1}
                  </div>
                );
              })}
            </div>

            <div style={styles.stampCount}>
              {selected.stamps} / 6 STAMPS
            </div>

            {selected.stamps >= 6 ? (
              <div style={styles.reward}>
                🎉 REWARD UNLOCKED!
                <p>This customer has earned their reward.</p>
              </div>
            ) : (
              <button
                onClick={handleAddStamp}
                disabled={addingStamp}
                style={styles.button}
              >
                {addingStamp ? "SAVING STAMP..." : "ADD STAMP +"}
              </button>
            )}

            <p style={styles.cardNote}>
              Stamps are saved directly to Shopify.
            </p>
          </section>
        )}

        <footer style={styles.footer}>
          PLANET HEALTH · LOYALTY REWARDS
        </footer>
      </div>
    </main>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  page: {
    minHeight: "100vh",
    background: "#F0EBE6",
    color: "#111",
    fontFamily: "Arial, sans-serif",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    padding: "25px 18px",
    boxSizing: "border-box",
  },
  dashboard: {
    width: "100%",
    maxWidth: "650px",
    margin: "auto",
  },
  card: {
    width: "100%",
    maxWidth: "460px",
    background: "#fff",
    border: "2px solid #111",
    borderRadius: "22px",
    padding: "30px",
    boxSizing: "border-box",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "15px",
    marginBottom: "35px",
  },
  logo: {
    fontSize: "23px",
    fontWeight: 900,
    letterSpacing: "-1px",
  },
  green: {
    color: "#45e017",
  },
  eyebrow: {
    marginTop: "12px",
    fontSize: "11px",
    fontWeight: 800,
    letterSpacing: "2px",
  },
  heading: {
    fontSize: "clamp(36px, 8vw, 54px)",
    lineHeight: 1,
    margin: "15px 0",
    fontWeight: 900,
  },
  description: {
    color: "#666",
    fontSize: "15px",
    lineHeight: 1.6,
    marginBottom: "25px",
  },
  section: {
    background: "#fff",
    border: "2px solid #111",
    borderRadius: "18px",
    padding: "22px",
    marginBottom: "20px",
  },
  sectionTitle: {
    fontSize: "17px",
    marginTop: 0,
  },
  label: {
    display: "block",
    fontSize: "12px",
    fontWeight: 900,
    marginBottom: "9px",
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    padding: "17px",
    border: "2px solid #111",
    borderRadius: "10px",
    fontSize: "16px",
    marginBottom: "12px",
  },
  button: {
    width: "100%",
    padding: "17px",
    background: "#B4FF00",
    border: "2px solid #111",
    borderRadius: "10px",
    fontSize: "14px",
    fontWeight: 900,
    cursor: "pointer",
    color: "#111",
  },
  logout: {
    padding: "12px 16px",
    background: "#fff",
    border: "2px solid #111",
    borderRadius: "9px",
    fontWeight: 900,
    cursor: "pointer",
  },
  results: {
    marginTop: "22px",
  },
  resultHeading: {
    fontSize: "11px",
    fontWeight: 900,
    letterSpacing: "1.5px",
    marginBottom: "10px",
  },
  customer: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
    width: "100%",
    padding: "15px",
    background: "#fff",
    border: "2px solid #ddd",
    borderRadius: "10px",
    marginBottom: "9px",
    textAlign: "left",
    cursor: "pointer",
  },
  customerStamps: {
    fontWeight: 900,
    whiteSpace: "nowrap",
  },
  customerName: {
    fontSize: "25px",
    marginBottom: "5px",
  },
  customerEmail: {
    color: "#aaa",
    fontSize: "13px",
    overflowWrap: "anywhere",
  },
  customer: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
    width: "100%",
    padding: "15px",
    background: "#fff",
    border: "2px solid #ddd",
    borderRadius: "10px",
    marginBottom: "9px",
    textAlign: "left",
    cursor: "pointer",
  },
  stampGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: "14px",
    maxWidth: "270px",
    margin: "28px auto",
  },
  stamp: {
    width: "100%",
    aspectRatio: "1",
    border: "2px solid #B4FF00",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "23px",
    fontWeight: 900,
  },
  stampCount: {
    textAlign: "center",
    fontSize: "17px",
    fontWeight: 900,
    marginBottom: "22px",
  },
  loyaltyCard: {
    background: "#111",
    color: "#fff",
    borderRadius: "18px",
    padding: "25px",
    marginBottom: "20px",
  },
  reward: {
    background: "#B4FF00",
    color: "#111",
    padding: "20px",
    borderRadius: "12px",
    textAlign: "center",
    fontWeight: 900,
  },
  cardNote: {
    color: "#aaa",
    textAlign: "center",
    fontSize: "11px",
    marginTop: "18px",
  },
  message: {
    color: "#267a12",
    fontSize: "13px",
    fontWeight: 700,
  },
  error: {
    color: "#c22",
    fontSize: "13px",
    fontWeight: 700,
  },
  footer: {
    textAlign: "center",
    marginTop: "30px",
    fontSize: "10px",
    letterSpacing: "1.5px",
    color: "#888",
  },
};
