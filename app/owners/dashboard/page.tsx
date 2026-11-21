
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
    description: "Successful customer QR scans",
  },
  {
    key: "stamp_awarded",
    label: "STAMPS AWARDED",
    description: "Loyalty stamps added to customer cards",
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

      const customers: Customer[] = result.customers || [];

      const registeredCustomers = customers.filter(
        (customer) => customer.loyaltyMember
      );

      setData({
        customers,
        activity: result.activity || [],
        totalLoyaltyMembers: Number(
          result.totalLoyaltyMembers ?? registeredCustomers.length
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
    } catch {
      setError(
        "Unable to load business data. Please try again."
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

  const loyaltyCustomers = data.customers.filter(
    (customer) => customer.loyaltyMember
  );

  const totalCustomers = data.totalLoyaltyMembers;

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

  const periodTotals = METRICS.reduce(
    (totals, metric) => {
      totals[metric.key] = selectedActivity.reduce(
        (total, bucket) => total + bucket[metric.key],
        0
      );

      return totals;
    },
    {
      qr_scan: 0,
      stamp_awarded: 0,
      reward_unlocked: 0,
      reward_redeemed: 0,
    } as Record<EventType, number>
  );

  function formatDate(date: string) {
    return new Date(date).toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function periodDescription() {
    if (period === "daily") {
      return "Daily activity over the last 30 days";
    }

    if (period === "weekly") {
      return "Weekly activity over the last 12 weeks";
    }

    return "Monthly activity over the last 12 months";
  }

  function activityLabel(eventType: string) {
    return EVENT_LABELS[eventType] || eventType.replace(/_/g, " ").toUpperCase();
  }

  function activityStyle(eventType: string) {
    if (eventType === "reward_unlocked") {
      return styles.reward;
    }

    if (eventType === "reward_redeemed") {
      return styles.redeemed;
    }

    if (eventType === "qr_scan") {
      return styles.scanned;
    }

    return styles.active;
  }

  return (
    <main style={styles.page}>
      <div style={styles.container}>
        <header style={styles.header}>
          <div>
            <div style={styles.logo}>
              PLANET HEALTH
              <span style={{ color: "#B4FF00" }}>.</span>
            </div>

            <div style={styles.subtitle}>
              BUSINESS OWNER DASHBOARD
            </div>
          </div>

          <button style={styles.logout} onClick={logout}>
            LOG OUT
          </button>
        </header>

        <section style={styles.intro}>
          <p style={{ ...styles.eyebrow, color: "#111111" }}>
            THE BIG PICTURE
          </p>

          <h1 style={styles.heading}>
            YOUR BUSINESS.
            <br />
            <span style={{ color: "#45e017" }}>
              YOUR LOYALTY.
            </span>
          </h1>

          <p style={styles.description}>
            Your live overview of the Planet Health loyalty programme.
          </p>
        </section>

        {loading ? (
          <div style={styles.message}>
            LOADING BUSINESS DATA...
          </div>
        ) : error ? (
          <div style={styles.error}>
            {error}

            <button style={styles.retry} onClick={loadDashboard}>
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
                <button
                  onClick={() => setPeriod("daily")}
                  style={{
                    ...styles.periodButton,
                    ...(period === "daily"
                      ? styles.periodButtonActive
                      : {}),
                  }}
                >
                  DAILY
                </button>

                <button
                  onClick={() => setPeriod("weekly")}
                  style={{
                    ...styles.periodButton,
                    ...(period === "weekly"
                      ? styles.periodButtonActive
                      : {}),
                  }}
                >
                  WEEKLY
                </button>

                <button
                  onClick={() => setPeriod("monthly")}
                  style={{
                    ...styles.periodButton,
                    ...(period === "monthly"
                      ? styles.periodButtonActive
                      : {}),
                  }}
                >
                  MONTHLY
                </button>
              </div>

              <p style={styles.periodDescription}>
                {periodDescription()}
              </p>

              {/* PERIOD TOTALS */}
              <div style={styles.engagementStats}>
                {METRICS.map((metric) => (
                  <div
                    key={metric.key}
                    style={styles.engagementCard}
                  >
                    <div style={styles.engagementLabel}>
                      {metric.label}
                    </div>

                    <div style={styles.engagementValue}>
                      {periodTotals[metric.key].toLocaleString("en-GB")}
                    </div>

                    <div style={styles.engagementDescription}>
                      {metric.description}
                    </div>
                  </div>
                ))}
              </div>

              {/* ACTIVITY CHARTS */}
              <div style={styles.charts}>
                {METRICS.map((metric) => (
                  <ActivityChart
                    key={`${period}-${metric.key}`}
                    title={metric.label}
                    description={metric.description}
                    data={selectedActivity}
                    dataKey={metric.key}
                  />
                ))}
              </div>

              {selectedActivity.length === 0 && (
                <p style={styles.noChartData}>
                  No activity reporting data is available yet.
                </p>
              )}
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
                  RECENT LOYALTY ACTIVITY
                </h2>

                <span style={styles.count}>
                  LATEST EVENTS
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
                        {item.customer_name || item.customer_id}
                      </strong>

                      <div style={styles.activityEmail}>
                        {item.customer_email || ""}
                      </div>

                      <div style={styles.activityDate}>
                        {formatDate(item.created_at)}
                      </div>
                    </div>

                    <span style={activityStyle(item.event_type)}>
                      {activityLabel(item.event_type)}
                    </span>
                  </div>
                ))}

                {data.activity.length === 0 && (
                  <div style={styles.empty}>
                    No activity recorded yet.
                  </div>
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
  const values = data.map((item) => item[dataKey]);
  const maxValue = Math.max(1, ...values);

  const chartWidth = 760;
  const chartHeight = 230;
  const left = 45;
  const right = 12;
  const top = 18;
  const bottom = 42;

  const plotWidth = chartWidth - left - right;
  const plotHeight = chartHeight - top - bottom;

  const slotWidth = data.length > 0
    ? plotWidth / data.length
    : plotWidth;

  const barWidth = Math.max(
    3,
    Math.min(24, slotWidth * 0.62)
  );

  const labelInterval =
    data.length > 20 ? 5 : data.length > 12 ? 2 : 1;

  const midValue = Math.ceil(maxValue / 2);

  return (
    <div style={styles.chartCard}>
      <div style={styles.chartHeading}>
        <div>
          <h3 style={styles.chartTitle}>{title}</h3>
          <p style={styles.chartDescription}>{description}</p>
        </div>

        <div style={styles.chartTotal}>
          {values.reduce((sum, value) => sum + value, 0)}
        </div>
      </div>

      <div style={styles.chartScroller}>
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          width="100%"
          role="img"
          aria-label={`${title} activity bar chart`}
          style={styles.chartSvg}
        >
          {[0, midValue, maxValue].map((value, index) => {
            const y = top + plotHeight -
              (value / maxValue) * plotHeight;

            return (
              <g key={index}>
                <line
                  x1={left}
                  y1={y}
                  x2={chartWidth - right}
                  y2={y}
                  stroke="#e5e5e5"
                  strokeWidth="1"
                />

                <text
                  x={left - 9}
                  y={y + 4}
                  fontSize="11"
                  textAnchor="end"
                  fill="#777"
                >
                  {value}
                </text>
              </g>
            );
          })}

          {data.map((item, index) => {
            const value = item[dataKey];

            const barHeight =
              (value / maxValue) * plotHeight;

            const x =
              left +
              index * slotWidth +
              (slotWidth - barWidth) / 2;

            const y =
              top + plotHeight - barHeight;

            const showLabel =
              index % labelInterval === 0 ||
              index === data.length - 1;

            return (
              <g key={`${item.label}-${index}`}>
                <rect
                  x={x}
                  y={value > 0 ? y : top + plotHeight - 2}
                  width={barWidth}
                  height={value > 0 ? barHeight : 2}
                  rx="3"
                  fill="#B4FF00"
                >
                  <title>
                    {item.label}: {value}
                  </title>
                </rect>

                {showLabel && (
                  <text
                    x={left + index * slotWidth + slotWidth / 2}
                    y={chartHeight - 13}
                    fontSize="10"
                    textAnchor="middle"
                    fill="#777"
                  >
                    {item.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {values.every((value) => value === 0) && (
        <p style={styles.chartEmpty}>
          No recorded activity in this period yet.
        </p>
      )}
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
  reportingSection: {
    background: "#fff",
    border: "2px solid #111",
    borderRadius: "14px",
    padding: "25px",
    marginBottom: "45px",
  },
  reportingHeader: {
    marginBottom: "25px",
  },
  reportingEyebrow: {
    color: "#398900",
    fontSize: "11px",
    fontWeight: 950,
    letterSpacing: "2px",
    margin: "0 0 10px",
  },
  reportingTitle: {
    fontSize: "clamp(24px, 4vw, 34px)",
    fontWeight: 950,
    letterSpacing: "-1px",
    margin: "0 0 10px",
  },
  reportingDescription: {
    fontSize: "13px",
    color: "#666",
    lineHeight: 1.6,
    margin: 0,
  },
  periodSelector: {
    display: "flex",
    gap: "8px",
    flexWrap: "wrap",
    marginBottom: "12px",
  },
  periodButton: {
    flex: "1 1 100px",
    padding: "13px 16px",
    border: "2px solid #111",
    borderRadius: "7px",
    background: "#fff",
    color: "#111",
    fontSize: "11px",
    fontWeight: 950,
    letterSpacing: "1px",
    cursor: "pointer",
  },
  periodButtonActive: {
    background: "#B4FF00",
  },
  periodDescription: {
    fontSize: "12px",
    color: "#777",
    margin: "12px 0 20px",
  },
  engagementStats: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "10px",
    marginBottom: "28px",
  },
  engagementCard: {
    background: "#111",
    color: "#fff",
    borderRadius: "9px",
    padding: "18px",
    minWidth: 0,
  },
  engagementLabel: {
    color: "#B4FF00",
    fontSize: "10px",
    fontWeight: 950,
    letterSpacing: "1px",
  },
  engagementValue: {
    fontSize: "32px",
    fontWeight: 950,
    margin: "12px 0 7px",
  },
  engagementDescription: {
    fontSize: "11px",
    color: "#ccc",
    lineHeight: 1.5,
  },
  charts: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 430px), 1fr))",
    gap: "15px",
  },
  chartCard: {
    border: "1px solid #ddd",
    borderRadius: "10px",
    padding: "16px",
    minWidth: 0,
    background: "#fff",
  },
  chartHeading: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
    marginBottom: "12px",
  },
  chartTitle: {
    fontSize: "13px",
    fontWeight: 950,
    margin: 0,
  },
  chartDescription: {
    fontSize: "11px",
    color: "#777",
    margin: "5px 0 0",
  },
  chartTotal: {
    background: "#B4FF00",
    color: "#111",
    borderRadius: "7px",
    padding: "9px 12px",
    fontSize: "16px",
    fontWeight: 950,
  },
  chartScroller: {
    width: "100%",
    overflowX: "auto",
  },
  chartSvg: {
    display: "block",
    width: "100%",
    minWidth: "300px",
    height: "auto",
  },
  chartEmpty: {
    textAlign: "center",
    color: "#888",
    fontSize: "11px",
    margin: "8px 0 0",
  },
  noChartData: {
    textAlign: "center",
    color: "#777",
    fontSize: "12px",
    padding: "20px",
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
  redeemed: {
    display: "inline-block",
    background: "#111",
    color: "#B4FF00",
    padding: "7px 9px",
    borderRadius: "5px",
    fontSize: "9px",
    fontWeight: 950,
    whiteSpace: "nowrap",
  },
  scanned: {
    display: "inline-block",
    background: "#e4f0ff",
    color: "#164c86",
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
