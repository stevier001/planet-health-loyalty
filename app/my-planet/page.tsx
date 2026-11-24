
"use client";

import { useCallback, useEffect, useState } from "react";

type Dashboard = {
  success: boolean;
  authenticated: boolean;
  customer?: {
    firstName: string;
    lastName: string;
    email: string;
  };
  loyalty?: {
    stamps: number;
    target: number;
    rewardUnlocked: boolean;
  };
  wallet?: {
    balancePence: number;
    currency: string;
    transactions: {
      id: string;
      transaction_type: string;
      amount_pence: number;
      description: string;
      created_at: string;
    }[];
  };
};

export default function MyPlanetPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState("");

  const loadDashboard = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const response = await fetch("/api/my-planet/dashboard", {
        credentials: "same-origin",
        cache: "no-store",
      });

      const result = await response.json();

      if (response.status === 401) {
        setData({ success: false, authenticated: false });
        return;
      }

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Unable to load your account.");
      }

      setData(result);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  async function logout() {
    try {
      setLoggingOut(true);

      const response = await fetch("/api/my-planet/logout", {
        method: "POST",
        credentials: "same-origin",
      });

      if (!response.ok) {
        throw new Error("Unable to log out. Please try again.");
      }

      setData({ success: false, authenticated: false });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Logout failed."
      );
    } finally {
      setLoggingOut(false);
    }
  }

  const money = (pence: number) =>
    new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: data?.wallet?.currency || "GBP",
    }).format(pence / 100);

  if (loading) {
    return (
      <main style={styles.page}>
        <p style={styles.muted}>Loading your Planet...</p>
      </main>
    );
  }

  if (!data?.authenticated) {
    return (
      <main style={styles.page}>
        <section style={styles.loginCard}>
          <div style={styles.logo}>MY PLANET<span>.</span></div>
          <h1>Welcome to your Planet.</h1>
          <p style={styles.muted}>
            Your loyalty, rewards and wallet, all in one place.
          </p>
          <a href="https://planethealthclub.co.uk/pages/loyalty-rewards"
            style={styles.button}>
            Log in to Planet Health
          </a>
        </section>
      </main>
    );
  }

  const customer = data.customer!;
  const loyalty = data.loyalty!;
  const wallet = data.wallet!;

  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <div>
          <div style={styles.logo}>MY PLANET<span>.</span></div>
          <p style={styles.eyebrow}>YOUR PLANET HEALTH MEMBERSHIP</p>
        </div>
        <button
          style={styles.logout}
          onClick={logout}
          disabled={loggingOut}
        >
          {loggingOut ? "Signing out..." : "Sign out"}
        </button>
      </header>

      <section style={styles.welcome}>
        <p style={styles.eyebrow}>YOUR SPACE. YOUR REWARDS.</p>
        <h1>Hello, {customer.firstName || "there"}.</h1>
        <p style={styles.muted}>
          Good to have you here.
        </p>
      </section>

      {error && <p style={styles.error}>{error}</p>}

      <section style={styles.card}>
        <div style={styles.cardTop}>
          <div>
            <p style={styles.eyebrow}>YOUR LOYALTY CARD</p>
            <h2>Little rewards. Big love.</h2>
          </div>
          <span style={styles.stampCount}>
            {loyalty.stamps}/{loyalty.target}
          </span>
        </div>

        <div style={styles.stamps}>
          {Array.from({ length: loyalty.target }).map((_, index) => (
            <div
              key={index}
              style={{
                ...styles.stamp,
                ...(index < loyalty.stamps ? styles.stampFilled : {}),
              }}
            >
              {index < loyalty.stamps ? "✓" : index + 1}
            </div>
          ))}
        </div>

        <p style={styles.cardNote}>
          {loyalty.rewardUnlocked
            ? "You've unlocked your reward. Enjoy!"
            : `${loyalty.target - loyalty.stamps} more ${
                loyalty.target - loyalty.stamps === 1 ? "stamp" : "stamps"
              } until your reward.`}
        </p>
      </section>

      <section style={styles.wallet}>
        <div>
          <p style={styles.eyebrow}>YOUR PLANET WALLET</p>
          <h2>{money(wallet.balancePence)}</h2>
          <p style={styles.muted}>Available balance</p>
        </div>
        <a
          href="https://planethealthclub.co.uk/pages/loyalty-rewards"
          style={styles.walletButton}
        >
          Top up
        </a>
      </section>

      <section style={styles.section}>
        <div style={styles.sectionHeading}>
          <h2>Recent activity</h2>
        </div>

        {wallet.transactions.length === 0 ? (
          <p style={styles.muted}>Your transactions will appear here.</p>
        ) : (
          wallet.transactions.slice(0, 5).map((transaction) => (
            <div key={transaction.id} style={styles.transaction}>
              <div>
                <strong>
                  {transaction.description || transaction.transaction_type}
                </strong>
                <p style={styles.transactionDate}>
                  {new Date(transaction.created_at).toLocaleDateString("en-GB")}
                </p>
              </div>
              <strong>{money(transaction.amount_pence)}</strong>
            </div>
          ))
        )}
      </section>

      <section style={styles.birthday}>
        <p style={styles.eyebrow}>A LITTLE SOMETHING FOR YOU</p>
        <h2>Birthday rewards.</h2>
        <p style={styles.muted}>
          We're working on something special for your birthday.
          Watch this space.
        </p>
      </section>

      <footer style={styles.footer}>
        PLANET HEALTH · YOUR MEMBERSHIP, ALL IN ONE PLACE.
      </footer>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#F0EBE6",
    color: "#111111",
    padding: "28px 20px 50px",
    fontFamily: "Arial, sans-serif",
    maxWidth: "620px",
    margin: "0 auto",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
    borderBottom: "1px solid #D8D0C8",
    paddingBottom: "20px",
  },
  logo: {
    fontSize: "23px",
    fontWeight: 900,
    letterSpacing: "-1px",
  },
  eyebrow: {
    fontSize: "10px",
    letterSpacing: "1.5px",
    fontWeight: 700,
    color: "#77716B",
  },
  welcome: {
    padding: "35px 0 25px",
  },
  loginCard: {
    marginTop: "15vh",
    background: "#FFFFFF",
    borderRadius: "20px",
    padding: "32px 24px",
  },
  card: {
    background: "#FFFFFF",
    borderRadius: "20px",
    padding: "24px",
    marginBottom: "16px",
  },
  cardTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "10px",
  },
  stampCount: {
    fontSize: "20px",
    fontWeight: 900,
  },
  stamps: {
    display: "grid",
    gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
    gap: "8px",
    margin: "24px 0 15px",
  },
  stamp: {
    aspectRatio: "1",
    border: "2px dashed #CFC7BE",
    borderRadius: "50%",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    color: "#AAA198",
    fontWeight: 700,
    fontSize: "16px",
  },
  stampFilled: {
    background: "#45E017",
    border: "2px solid #45E017",
    color: "#111111",
  },
  cardNote: {
    fontSize: "13px",
    fontWeight: 600,
  },
  wallet: {
    background: "#111111",
    color: "#FFFFFF",
    borderRadius: "20px",
    padding: "25px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
    marginBottom: "30px",
  },
  walletButton: {
    background: "#45E017",
    color: "#111111",
    padding: "12px 18px",
    borderRadius: "30px",
    fontWeight: 800,
    textDecoration: "none",
    whiteSpace: "nowrap",
  },
  section: {
    marginBottom: "25px",
  },
  sectionHeading: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "15px",
  },
  transaction: {
    display: "flex",
    justifyContent: "space-between",
    gap: "12px",
    padding: "16px 0",
    borderBottom: "1px solid #D8D0C8",
    fontSize: "13px",
  },
  transactionDate: {
    color: "#77716B",
    fontSize: "11px",
    margin: "5px 0 0",
  },
  birthday: {
    background: "#E3DCD4",
    borderRadius: "20px",
    padding: "24px",
  },
  button: {
    display: "inline-block",
    background: "#45E017",
    color: "#111111",
    padding: "15px 22px",
    borderRadius: "30px",
    fontWeight: 800,
    textDecoration: "none",
    marginTop: "15px",
  },
  logout: {
    border: "1px solid #CCC3BA",
    background: "transparent",
    borderRadius: "30px",
    padding: "10px 14px",
    fontWeight: 700,
    cursor: "pointer",
  },
  muted: {
    color: "#77716B",
    fontSize: "14px",
    lineHeight: 1.6,
  },
  error: {
    color: "#B42318",
    background: "#FEE4E2",
    padding: "12px",
    borderRadius: "10px",
    fontSize: "13px",
  },
  footer: {
    textAlign: "center",
    color: "#77716B",
    fontSize: "9px",
    letterSpacing: "1px",
    paddingTop: "35px",
  },
};
