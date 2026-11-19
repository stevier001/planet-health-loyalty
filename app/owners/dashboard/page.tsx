
"use client";

import { useEffect, useState } from "react";

type Customer = {
  id: string;
  name: string;
  email: string;
  stamps: number;
};

type Activity = {
  customer_id: string;
  event_type: string;
  created_at: string;
  metadata?: {
    stamps?: number;
  };
  customer_name?: string;
  customer_email?: string;
};

type DashboardData = {
  customers: Customer[];
  activity: Activity[];
};

export default function OwnersDashboard() {
  const [data, setData] = useState<DashboardData>({
    customers: [],
    activity: [],
  }); 
  
  const [totalStampsAwarded, setTotalStampsAwarded] = useState(0);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadDashboard() {
    try {
      setLoading(true);
      setError("");

      const response = await fetch("/api/owners-data", {
        cache: "no-store",
      });

      if (response.status === 401) {
        window.location.href = "/owners";
        return;
      }

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Unable to load dashboard");
      }

      setData({
        customers: result.customers || [],
        activity: result.activity || [],
      });
      setTotalStampsAwarded(Number(result.totalStampsAwarded ?? 0));
    } catch {
      setError("Unable to load business data. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await fetch("/api/owners-logout", { method: "POST" });
    window.location.href = "/owners";
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  const totalCustomers = data.customers.length;
  const totalStamps = data.customers.reduce(
    (total, customer) => total + customer.stamps,
    0
  );
  const rewardsUnlocked = data.customers.filter(
    (customer) => customer.stamps >= 6
  ).length;

  const recentStamps = data.activity.filter(
    (item) => item.event_type === "stamp_awarded"
  ).length;

  function formatDate(date: string) {
    return new Date(date).toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <main style={styles.page}>
      <div style={styles.container}>
        <header style={styles.header}>
          <div>
            <div style={styles.logo}>
              PLANET HEALTH<span style={{ color: "#B4FF00" }}>.</span>
            </div>
            <div style={styles.subtitle}>BUSINESS OWNER DASHBOARD</div>
          </div>
          <button style={styles.logout} onClick={logout}>
            LOG OUT
          </button>
        </header>

        <section style={styles.intro}>
          <p style={{ ...styles.eyebrow, color: "#111111" }}>THE BIG PICTURE</p>
          <h1 style={styles.heading}>
            YOUR BUSINESS.
            <br />
            <span style={{ color: "#45e017" }}>YOUR LOYALTY.</span>
          </h1>
          <p style={styles.description}>
            Your live overview of the Planet Health loyalty programme.
          </p>
        </section>

        {loading ? (
          <div style={styles.message}>LOADING BUSINESS DATA...</div>
        ) : error ? (
          <div style={styles.error}>
            {error}
            <button style={styles.retry} onClick={loadDashboard}>
              TRY AGAIN
            </button>
          </div>
        ) : (
          <>
            <section style={styles.stats}>
              <StatCard label="LOYALTY CUSTOMERS" value={totalCustomers} />
              <StatCard label="STAMPS CURRENTLY HELD" value={totalStamps} />
              <StatCard label="REWARDS UNLOCKED" value={rewardsUnlocked} />
              <StatCard label="RECENT STAMPS" value={recentStamps} />
            </section>

            <section style={styles.section}>
              <div style={styles.sectionHeader}>
                <h2 style={styles.sectionTitle}>CUSTOMER OVERVIEW</h2>
                <span style={styles.count}>
                  {totalCustomers} CUSTOMERS
                </span>
              </div>

              <div style={styles.tableWrap}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>CUSTOMER</th>
                      <th style={styles.th}>EMAIL</th>
                      <th style={styles.th}>STAMPS</th>
                      <th style={styles.th}>STATUS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.customers.map((customer) => (
                      <tr key={customer.id}>
                        <td style={styles.td}>{customer.name}</td>
                        <td style={styles.td}>{customer.email || "—"}</td>
                        <td style={styles.td}>
                          {customer.stamps} / 6
                        </td>
                        <td style={styles.td}>
                          <span
                            style={
                              customer.stamps >= 6
                                ? styles.reward
                                : styles.active
                            }
                          >
                            {customer.stamps >= 6
                              ? "REWARD UNLOCKED"
                              : "ACTIVE"}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {data.customers.length === 0 && (
                      <tr>
                        <td style={styles.empty} colSpan={4}>
                          No loyalty customers found yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section style={styles.section}>
              <div style={styles.sectionHeader}>
                <h2 style={styles.sectionTitle}>RECENT LOYALTY ACTIVITY</h2>
                <span style={styles.count}>LATEST EVENTS</span>
              </div>

              <div style={styles.activityList}>
                {data.activity.map((item, index) => (
                  <div
                    key={`${item.customer_id}-${item.created_at}-${index}`}
                    style={styles.activityItem}
                  >
                    <div>
                      <strong style={styles.activityName}>
                        {item.customer_name || item.customer_id}
                      </strong>
                      <div style={styles.activityEmail}>
                        {item.customer_email || ""}
                      </div>
                      <div style={styles.activityDate}>
                        {formatDate(item.created_at)}
                      </div>
                    </div>
                    <span
                      style={
                        item.event_type === "reward_unlocked"
                          ? styles.reward
                          : styles.active
                      }
                    >
                      {item.event_type === "reward_unlocked"
                        ? "REWARD UNLOCKED"
                        : "STAMP AWARDED"}
                    </span>
                  </div>
                ))}
                {data.activity.length === 0 && (
                  <div style={styles.empty}>No activity recorded yet.</div>
                )}
              </div>
            </section>

            <button style={styles.refresh} onClick={loadDashboard}>
              REFRESH DASHBOARD ↻
            </button>
          </>
        )}

        <footer style={styles.footer}>
          PLANET HEALTH · BUSINESS CONTROL PANEL
        </footer>
      </div>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div style={styles.statCard}>
      <div style={styles.statLabel}>{label}</div>
      <div style={styles.statValue}>{value.toLocaleString("en-GB")}</div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#eeeae6",
    color: "#111",
    padding: "35px 20px",
    fontFamily: "Arial, sans-serif",
  },
  container: {
    maxWidth: "1100px",
    margin: "0 auto",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: "25px",
    borderBottom: "2px solid #111",
  },
  logo: {
    fontSize: "23px",
    fontWeight: 950,
    letterSpacing: "-1px",
  },
  subtitle: {
    fontSize: "10px",
    letterSpacing: "2px",
    marginTop: "6px",
    fontWeight: 800,
  },
  logout: {
    background: "#111",
    color: "#B4FF00",
    border: "2px solid #111",
    borderRadius: "7px",
    padding: "12px 18px",
    fontWeight: 900,
    cursor: "pointer",
  },
  intro: {
    padding: "55px 0 35px",
  },
  eyebrow: {
    color: "#398900",
    fontWeight: 900,
    fontSize: "12px",
    letterSpacing: "3px",
  },
  heading: {
    fontSize: "clamp(38px, 7vw, 70px)",
    lineHeight: 0.98,
    letterSpacing: "-3px",
    margin: "15px 0",
    fontWeight: 950,
  },
  description: {
    color: "#555",
    fontSize: "15px",
  },
  stats: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
    gap: "14px",
    marginBottom: "45px",
  },
  statCard: {
    background: "#111",
    color: "#fff",
    borderRadius: "12px",
    padding: "25px 20px",
    borderBottom: "5px solid #B4FF00",
  },
  statLabel: {
    fontSize: "11px",
    color: "#B4FF00",
    fontWeight: 900,
    letterSpacing: "1px",
  },
  statValue: {
    fontSize: "38px",
    fontWeight: 950,
    marginTop: "15px",
  },
  section: {
    marginBottom: "40px",
  },
  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
    marginBottom: "15px",
    flexWrap: "wrap",
  },
  sectionTitle: {
    fontSize: "17px",
    fontWeight: 950,
  },
  count: {
    fontSize: "10px",
    fontWeight: 900,
    letterSpacing: "1px",
    color: "#555",
  },
  tableWrap: {
    overflowX: "auto",
    background: "#fff",
    border: "2px solid #111",
    borderRadius: "10px",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: "650px",
    textAlign: "left",
  },
  th: {
    padding: "16px 14px",
    background: "#111",
    color: "#B4FF00",
    fontSize: "10px",
    letterSpacing: "1px",
  },
  td: {
    padding: "17px 14px",
    borderBottom: "1px solid #ddd",
    fontSize: "13px",
    fontWeight: 600,
  },
  active: {
    display: "inline-block",
    background: "#e5ffd0",
    color: "#277400",
    padding: "7px 9px",
    borderRadius: "5px",
    fontSize: "9px",
    fontWeight: 950,
    whiteSpace: "nowrap",
  },
  reward: {
    display: "inline-block",
    background: "#B4FF00",
    color: "#111",
    padding: "7px 9px",
    borderRadius: "5px",
    fontSize: "9px",
    fontWeight: 950,
    whiteSpace: "nowrap",
  },
  activityList: {
    background: "#fff",
    border: "2px solid #111",
    borderRadius: "10px",
    overflow: "hidden",
  },
  activityItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "15px",
    padding: "18px",
    borderBottom: "1px solid #ddd",
    flexWrap: "wrap",
  },
  activityName: {
    fontSize: "14px",
  },
  activityEmail: {
    fontSize: "12px",
    color: "#666",
    marginTop: "4px",
  },
  activityDate: {
    fontSize: "11px",
    color: "#888",
    marginTop: "5px",
  },
  empty: {
    padding: "25px",
    color: "#777",
    fontSize: "13px",
  },
  message: {
    padding: "40px",
    background: "#111",
    color: "#B4FF00",
    textAlign: "center",
    borderRadius: "10px",
    fontWeight: 900,
  },
  error: {
    padding: "25px",
    background: "#fff",
    border: "2px solid #c22",
    borderRadius: "10px",
    color: "#c22",
  },
  retry: {
    display: "block",
    marginTop: "15px",
    padding: "12px 18px",
    background: "#111",
    color: "#B4FF00",
    border: 0,
    borderRadius: "6px",
    cursor: "pointer",
    fontWeight: 900,
  },
  refresh: {
    width: "100%",
    padding: "18px",
    background: "#B4FF00",
    color: "#111",
    border: "2px solid #111",
    borderRadius: "9px",
    fontWeight: 950,
    cursor: "pointer",
  },
  footer: {
    textAlign: "center",
    marginTop: "55px",
    color: "#888",
    fontSize: "10px",
    letterSpacing: "2px",
  },
};
