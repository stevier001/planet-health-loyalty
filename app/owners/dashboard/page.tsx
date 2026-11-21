
"use client";

import { useEffect, useState } from "react";

type Customer = {
  id: string;
  name: string;
  email: string;
  stamps: number;
  loyaltyMember: boolean;
};

type EventType =
  | "qr_scan"
  | "stamp_awarded"
  | "reward_unlocked"
  | "reward_redeemed";

type Activity = {
  customer_id: string;
  event_type: string;
  created_at: string;
  metadata?: {
    stamps?: number;
    stamps_before?: number;
    stamps_after?: number;
  };
  customer_name?: string;
  customer_email?: string;
};

type ActivityBucket = {
  label: string;
  qr_scan: number;
  stamp_awarded: number;
  reward_unlocked: number;
  reward_redeemed: number;
};

type ActivitySummary = {
  daily: ActivityBucket[];
  weekly: ActivityBucket[];
  monthly: ActivityBucket[];
};

type DashboardData = {
  customers: Customer[];
  activity: Activity[];
  totalLoyaltyMembers: number;
};

type Period = "daily" | "weekly" | "monthly";

const EVENT_LABELS: Record<string, string> = {
  qr_scan: "QR CODE SCANNED",
  stamp_awarded: "STAMP AWARDED",
  reward_unlocked: "REWARD UNLOCKED",
  reward_redeemed: "REWARD REDEEMED",
};

const METRICS: {
  key: EventType;
  label: string;
  description: string;
}[] = [
  {
    key: "qr_scan",
    label: "QR CODE SCANS",
    description: "Customer QR codes scanned by staff",
  },
  {
    key: "stamp_awarded",
    label: "STAMPS AWARDED",
    description: "Loyalty stamps issued to customers",
  },
  {
    key: "reward_unlocked",
    label: "REWARDS UNLOCKED",
    description: "Customers reaching six stamps",
  },
  {
    key: "reward_redeemed",
    label: "REWARDS REDEEMED",
    description: "Rewards confirmed as redeemed by staff",
  },
];

export default function OwnersDashboard() {
  const [data, setData] = useState<DashboardData>({
    customers: [],
    activity: [],
    totalLoyaltyMembers: 0,
  });

  const [activitySummary, setActivitySummary] =
    useState<ActivitySummary>({
      daily: [],
      weekly: [],
      monthly: [],
    });

  const [period, setPeriod] = useState<Period>("weekly");

  const [totalStampsAwarded, setTotalStampsAwarded] = useState(0);
  const [totalQrScans, setTotalQrScans] = useState(0);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadDashboard() {
    try {
      setLoading(true);
      setError("");

      const response = await fetch("/api/owners-data", {
        method: "GET",
        cache: "no-store",
      });

      if (response.status === 401) {
        window.location.href = "/owners";
        return;
      }

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(
          result.message || "Unable to load dashboard"
        );
      }

      setData({
        customers: result.customers || [],
        activity: result.activity || [],
        totalLoyaltyMembers: Number(
          result.totalLoyaltyMembers ?? 0
        ),
      });

      setActivitySummary({
        daily: result.activitySummary?.daily || [],
        weekly: result.activitySummary?.weekly || [],
        monthly: result.activitySummary?.monthly || [],
      });

      setTotalStampsAwarded(
        Number(result.totalStampsAwarded ?? 0)
      );

      setTotalQrScans(
        Number(result.totalQrScans ?? 0)
      );
    } catch (err) {
      console.error("Dashboard loading error:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Unable to load dashboard"
      );
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await fetch("/api/owners-logout", {
      method: "POST",
    });

    window.location.href = "/owners";
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  // Only count customers who have actually registered
  // through the loyalty programme.
  const totalCustomers = data.totalLoyaltyMembers;

  const loyaltyCustomers = data.customers.filter(
    (customer) => customer.loyaltyMember
  );

  const totalStamps = loyaltyCustomers.reduce(
    (total, customer) => total + customer.stamps,
    0
  );

  const rewardsUnlocked = loyaltyCustomers.filter(
    (customer) => customer.stamps >= 6
  ).length;

  const recentStamps = data.activity.filter(
    (item) => item.event_type === "stamp_awarded"
  ).length;

  const selectedActivity = activitySummary[period];

  return (
    <main style={styles.page}>
      <div style={styles.container}>
        <header style={styles.header}>
          <div>
            <p style={styles.eyebrow}>PLANET HEALTH</p>

            <h1 style={styles.heading}>
              BUSINESS CONTROL PANEL.
            </h1>

            <p style={styles.subheading}>
              Loyalty programme performance and customer engagement.
            </p>
          </div>

          <div style={styles.headerActions}>
            <button
              style={styles.logout}
              onClick={logout}
            >
              LOG OUT
            </button>
          </div>
        </header>

        {loading ? (
          <div style={styles.message}>
            LOADING BUSINESS DATA...
          </div>
        ) : error ? (
          <div style={styles.error}>
            <strong>UNABLE TO LOAD DASHBOARD</strong>

            <p>{error}</p>

            <button
              style={styles.retry}
              onClick={loadDashboard}
            >
              TRY AGAIN
            </button>
          </div>
        ) : (
          <>
            {/* BUSINESS STATISTICS */}
            <section style={styles.stats}>
              <StatCard
                label="LOYALTY CUSTOMERS"
                value={totalCustomers}
              />

              <StatCard
                label="STAMPS CURRENTLY HELD"
                value={totalStamps}
              />

              <StatCard
                label="TOTAL STAMPS AWARDED"
                value={totalStampsAwarded}
              />

              <StatCard
                label="TOTAL QR SCANS"
                value={totalQrScans}
              />

              <StatCard
                label="REWARDS UNLOCKED"
                value={rewardsUnlocked}
              />

              <StatCard
                label="RECENT STAMPS"
                value={recentStamps}
              />
            </section>

            {/* CUSTOMER ENGAGEMENT REPORTING */}
            <section style={styles.reportingSection}>
              <div style={styles.reportingHeader}>
                <div>
                  <p style={styles.reportingEyebrow}>
                    UNDERSTAND YOUR CUSTOMERS
                  </p>

                  <h2 style={styles.reportingTitle}>
                    CUSTOMER ENGAGEMENT.
                  </h2>

                  <p style={styles.reportingDescription}>
                    Track how customers interact with your loyalty programme.
                  </p>
                </div>
              </div>

              {/* PERIOD SELECTOR */}
              <div style={styles.periodSelector}>
                {(["daily", "weekly", "monthly"] as Period[]).map(
                  (item) => (
                    <button
                      key={item}
                      onClick={() => setPeriod(item)}
                      style={{
                        ...styles.periodButton,
                        ...(period === item
                          ? styles.periodButtonActive
                          : {}),
                      }}
                    >
                      {item.toUpperCase()}
                    </button>
                  )
                )}
              </div>

              {/* ACTIVITY CHARTS */}
              <div style={styles.chartGrid}>
                {METRICS.map((metric) => (
                  <ActivityChart
                    key={metric.key}
                    title={metric.label}
                    description={metric.description}
                    data={selectedActivity}
                    dataKey={metric.key}
                  />
                ))}
              </div>
            </section>

            {/* CUSTOMER OVERVIEW */}
            <section style={styles.section}>
              <div style={styles.sectionHeader}>
                <h2 style={styles.sectionTitle}>
                  CUSTOMER OVERVIEW
                </h2>

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
                    {loyaltyCustomers.map((customer) => (
                      <tr key={customer.id}>
                        <td style={styles.td}>
                          {customer.name}
                        </td>

                        <td style={styles.td}>
                          {customer.email || "—"}
                        </td>

                        <td style={styles.td}>
                          {customer.stamps} / 6
                        </td>

                        <td style={styles.td}>
                          <span
                            style={{
                              ...styles.status,
                              ...(customer.stamps >= 6
                                ? styles.statusReward
                                : styles.statusActive),
                            }}
                          >
                            {customer.stamps >= 6
                              ? "REWARD UNLOCKED"
                              : "ACTIVE"}
                          </span>
                        </td>
                      </tr>
                    ))}

                    {loyaltyCustomers.length === 0 && (
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

            {/* RECENT ACTIVITY */}
            <section style={styles.section}>
              <div style={styles.sectionHeader}>
                <h2 style={styles.sectionTitle}>
                  RECENT ACTIVITY
                </h2>

                <span style={styles.count}>
                  LATEST 100 EVENTS
                </span>
              </div>

              <div style={styles.activityList}>
                {data.activity.map((item, index) => (
                  <div
                    key={`${item.customer_id}-${item.created_at}-${index}`}
                    style={styles.activityItem}
                  >
                    <div>
                      <strong style={styles.activityName}>
                        {item.customer_name || "Customer"}
                      </strong>

                      <p style={styles.activityDescription}>
                        {EVENT_LABELS[item.event_type] ||
                          item.event_type.toUpperCase()}
                      </p>
                    </div>

                    <div style={styles.activityDate}>
                      {new Date(item.created_at).toLocaleString(
                        "en-GB",
                        {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        }
                      )}
                    </div>
                  </div>
                ))}

                {data.activity.length === 0 && (
                  <div style={styles.empty}>
                    No recent activity recorded yet.
                  </div>
                )}
              </div>
            </section>
          </>
        )}

        <button
          style={styles.refresh}
          onClick={loadDashboard}
          disabled={loading}
        >
          {loading ? "REFRESHING..." : "REFRESH DASHBOARD"}
        </button>

        <footer style={styles.footer}>
          PLANET HEALTH · BUSINESS CONTROL PANEL
        </footer>
      </div>
    </main>
  );
}

// INDIVIDUAL STATISTIC CARD
function StatCard({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div style={styles.statCard}>
      <div style={styles.statLabel}>{label}</div>

      <div style={styles.statValue}>
        {value.toLocaleString("en-GB")}
      </div>
    </div>
  );
}

// ACTIVITY BAR CHART
function ActivityChart({
  title,
  description,
  data,
  dataKey,
}: {
  title: string;
  description: string;
  data: ActivityBucket[];
  dataKey: EventType;
}) {
  const maximum = Math.max(
    1,
    ...data.map((item) => item[dataKey])
  );

  return (
    <div style={styles.chartCard}>
      <h3 style={styles.chartTitle}>{title}</h3>

      <p style={styles.chartDescription}>
        {description}
      </p>

      <div style={styles.chart}>
        {data.map((item, index) => {
          const value = item[dataKey];
          const height = Math.max(
            value > 0 ? 4 : 0,
            (value / maximum) * 120
          );

          return (
            <div
              key={`${item.label}-${index}`}
              style={styles.barColumn}
              title={`${item.label}: ${value}`}
            >
              <span style={styles.barValue}>
                {value > 0 ? value : ""}
              </span>

              <div style={styles.barTrack}>
                <div
                  style={{
                    ...styles.bar,
                    height: `${height}px`,
                  }}
                />
              </div>

              <span style={styles.barLabel}>
                {item.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// DASHBOARD STYLES
const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#080808",
    color: "#fff",
    padding: "30px 20px",
    fontFamily: "Arial, Helvetica, sans-serif",
  },
  container: {
    maxWidth: "1400px",
    margin: "0 auto",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "20px",
    marginBottom: "35px",
    paddingBottom: "25px",
    borderBottom: "1px solid #292929",
  },
  eyebrow: {
    color: "#B4FF00",
    fontSize: "11px",
    fontWeight: 900,
    letterSpacing: "3px",
    margin: "0 0 10px",
  },
  heading: {
    fontSize: "clamp(25px, 5vw, 42px)",
    fontWeight: 950,
    letterSpacing: "-1.5px",
    margin: 0,
  },
  subheading: {
    color: "#999",
    fontSize: "13px",
    marginTop: "10px",
  },
  headerActions: {
    display: "flex",
    gap: "10px",
  },
  logout: {
    padding: "12px 18px",
    background: "transparent",
    color: "#fff",
    border: "1px solid #555",
    borderRadius: "6px",
    cursor: "pointer",
    fontWeight: 900,
  },
  stats: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "14px",
    marginBottom: "35px",
  },
  statCard: {
    background: "#151515",
    border: "1px solid #292929",
    borderRadius: "10px",
    padding: "22px",
  },
  statLabel: {
    fontSize: "10px",
    fontWeight: 900,
    letterSpacing: "1.5px",
    color: "#999",
  },
  statValue: {
    fontSize: "34px",
    fontWeight: 950,
    color: "#B4FF00",
    marginTop: "12px",
  },
  reportingSection: {
    background: "#111",
    border: "1px solid #292929",
    borderRadius: "12px",
    padding: "25px",
    marginBottom: "30px",
  },
  reportingHeader: {
    display: "flex",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: "15px",
  },
  reportingEyebrow: {
    color: "#B4FF00",
    fontSize: "10px",
    fontWeight: 900,
    letterSpacing: "2px",
  },
  reportingTitle: {
    fontSize: "25px",
    fontWeight: 950,
    margin: "10px 0",
  },
  reportingDescription: {
    color: "#999",
    fontSize: "13px",
  },
  periodSelector: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
    margin: "25px 0",
  },
  periodButton: {
    background: "#222",
    color: "#aaa",
    border: "1px solid #444",
    borderRadius: "5px",
    padding: "10px 18px",
    cursor: "pointer",
    fontSize: "11px",
    fontWeight: 900,
  },
  periodButtonActive: {
    background: "#B4FF00",
    color: "#111",
    borderColor: "#B4FF00",
  },
  chartGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: "15px",
  },
  chartCard: {
    background: "#181818",
    border: "1px solid #303030",
    borderRadius: "9px",
    padding: "18px",
    minWidth: 0,
  },
  chartTitle: {
    fontSize: "12px",
    fontWeight: 950,
    letterSpacing: "1px",
    margin: "0 0 7px",
  },
  chartDescription: {
    fontSize: "11px",
    color: "#888",
    margin: "0 0 20px",
  },
  chart: {
    display: "flex",
    alignItems: "flex-end",
    gap: "5px",
    height: "180px",
    overflowX: "auto",
    paddingTop: "15px",
  },
  barColumn: {
    flex: "1 0 18px",
    minWidth: "18px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "flex-end",
    height: "100%",
  },
  barValue: {
    fontSize: "9px",
    color: "#B4FF00",
    marginBottom: "4px",
  },
  barTrack: {
    height: "120px",
    width: "100%",
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "center",
  },
  bar: {
    width: "70%",
    maxWidth: "20px",
    background: "#B4FF00",
    borderRadius: "3px 3px 0 0",
    minHeight: "0",
  },
  barLabel: {
    fontSize: "8px",
    color: "#777",
    marginTop: "7px",
    whiteSpace: "nowrap",
  },
  section: {
    background: "#111",
    border: "1px solid #292929",
    borderRadius: "12px",
    padding: "25px",
    marginBottom: "30px",
  },
  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "15px",
    flexWrap: "wrap",
    marginBottom: "20px",
  },
  sectionTitle: {
    fontSize: "17px",
    fontWeight: 950,
    letterSpacing: "1px",
    margin: 0,
  },
  count: {
    fontSize: "10px",
    color: "#B4FF00",
    fontWeight: 900,
    letterSpacing: "1px",
  },
  tableWrap: {
    width: "100%",
    overflowX: "auto",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    textAlign: "left",
  },
  th: {
    padding: "13px 12px",
    fontSize: "10px",
    color: "#888",
    borderBottom: "1px solid #333",
    letterSpacing: "1px",
    whiteSpace: "nowrap",
  },
  td: {
    padding: "15px 12px",
    fontSize: "12px",
    color: "#ddd",
    borderBottom: "1px solid #242424",
  },
  status: {
    display: "inline-block",
    padding: "6px 9px",
    borderRadius: "4px",
    fontSize: "9px",
    fontWeight: 900,
    letterSpacing: "0.5px",
    whiteSpace: "nowrap",
  },
  statusActive: {
    background: "#202820",
    color: "#B4FF00",
  },
  statusReward: {
    background: "#B4FF00",
    color: "#111",
  },
  activityList: {
    display: "flex",
    flexDirection: "column",
  },
  activityItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "15px",
    flexWrap: "wrap",
    padding: "16px 5px",
    borderBottom: "1px solid #292929",
  },
  activityName: {
    fontSize: "13px",
    color: "#fff",
  },
  activityDescription: {
    fontSize: "10px",
    color: "#B4FF00",
    fontWeight: 900,
    letterSpacing: "1px",
    margin: "6px 0 0",
  },
  activityDate: {
    fontSize: "10px",
    color: "#888",
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
