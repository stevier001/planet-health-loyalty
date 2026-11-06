"use client";

import { useEffect, useState } from "react";

export default function StaffPage() {
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [error, setError] = useState("");

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

  useEffect(() => {
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
    setPin("");
  }

  if (checking) {
    return (
      <main style={styles.page}>
        <div style={styles.card}>LOADING STAFF PORTAL...</div>
      </main>
    );
  }

  if (!authenticated) {
    return (
      <main style={styles.page}>
        <div style={styles.card}>
          <div style={styles.logo}>
            PLANET HEALTH<span style={{ color: "#45e017" }}>.</span>
          </div>

          <div style={styles.eyebrow}>LOYALTY REWARDS</div>

          <h1 style={styles.heading}>
            STAFF
            <br />
            <span style={{ color: "#45e017" }}>ACCESS.</span>
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

          <div style={styles.footer}>
            PLANET HEALTH · STAFF ONLY
          </div>
        </div>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <div style={styles.card}>
        <div style={styles.logo}>
          PLANET HEALTH<span style={{ color: "#45e017" }}>.</span>
        </div>

        <div style={styles.eyebrow}>STAFF CONTROL PANEL</div>

        <h1 style={styles.heading}>
          GOOD FOOD.
          <br />
          <span style={{ color: "#45e017" }}>GOOD REWARDS.</span>
        </h1>

        <p style={styles.description}>
          You're successfully logged in. The customer loyalty dashboard
          will be connected next.
        </p>

        <div style={styles.notice}>
          <strong>STAFF ACCESS ACTIVE</strong>
          <p>Secure session verified.</p>
          <p>Reward target: 6 stamps.</p>
        </div>

        <button onClick={handleLogout} style={styles.logout}>
          LOG OUT
        </button>

        <div style={styles.footer}>
          PLANET HEALTH · LOYALTY REWARDS
        </div>
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
    alignItems: "center",
    justifyContent: "center",
    padding: "25px 18px",
    boxSizing: "border-box",
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
  logo: {
    fontSize: "23px",
    fontWeight: 900,
    letterSpacing: "-1px",
  },
  eyebrow: {
    marginTop: "35px",
    fontSize: "12px",
    fontWeight: 800,
    letterSpacing: "2px",
  },
  heading: {
    fontSize: "clamp(38px, 10vw, 52px)",
    lineHeight: 1,
    margin: "15px 0",
    fontWeight: 900,
  },
  description: {
    color: "#666",
    fontSize: "15px",
    lineHeight: 1.6,
    marginBottom: "28px",
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
    fontSize: "18px",
    marginBottom: "14px",
  },
  button: {
    width: "100%",
    padding: "18px",
    background: "#B4FF00",
    border: "2px solid #111",
    borderRadius: "10px",
    fontSize: "14px",
    fontWeight: 900,
    cursor: "pointer",
  },
  error: {
    color: "#c22",
    fontSize: "13px",
    fontWeight: 700,
  },
  notice: {
    background: "#111",
    color: "#fff",
    padding: "22px",
    borderRadius: "14px",
    lineHeight: 1.5,
  },
  logout: {
    width: "100%",
    padding: "16px",
    marginTop: "20px",
    background: "#fff",
    border: "2px solid #111",
    borderRadius: "10px",
    fontWeight: 900,
    cursor: "pointer",
  },
  footer: {
    textAlign: "center",
    marginTop: "30px",
    fontSize: "10px",
    letterSpacing: "1.5px",
    color: "#888",
  },
};
