"use client";

import { useState } from "react";

export default function OwnersPage() {
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/owners-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setError(data.message || "Incorrect PIN. Please try again.");
        return;
      }

      window.location.href = "/owners/dashboard";
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={styles.page}>
      <div style={styles.card}>
        <div style={styles.logo}>
          PLANET HEALTH<span style={{ color: "#45e017" }}>.</span>
        </div>

        <p style={styles.eyebrow}>BUSINESS OWNER ACCESS</p>

        <h1 style={styles.heading}>
          THE BUSINESS.
          <br />
          <span style={{ color: "#45e017" }}>BEHIND THE BRAND.</span>
        </h1>

        <p style={styles.description}>
          Welcome to the Planet Health loyalty analytics dashboard.
          Enter your owner PIN to continue.
        </p>

        <form onSubmit={handleLogin}>
          <label style={styles.label}>OWNER PIN</label>

          <input
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="Enter owner PIN"
            required
            style={styles.input}
          />

          {error && <p style={styles.error}>{error}</p>}

          <button
            type="submit"
            disabled={loading || !pin}
            style={styles.button}
          >
            {loading ? "CHECKING..." : "ACCESS ANALYTICS →"}
          </button>
        </form>

        <div style={styles.footer}>
          PLANET HEALTH · PRIVATE BUSINESS ACCESS
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
    justifyContent: "center",
    alignItems: "center",
    padding: "30px 18px",
    boxSizing: "border-box",
  },
  card: {
    width: "100%",
    maxWidth: "480px",
    background: "#fff",
    border: "2px solid #111",
    borderRadius: "22px",
    padding: "35px",
    boxSizing: "border-box",
  },
  logo: {
    fontSize: "24px",
    fontWeight: 900,
    letterSpacing: "-1px",
  },
  eyebrow: {
    fontSize: "11px",
    fontWeight: 900,
    letterSpacing: "2px",
    marginTop: "35px",
  },
  heading: {
    fontSize: "clamp(34px, 8vw, 50px)",
    lineHeight: 1,
    fontWeight: 900,
    margin: "18px 0",
  },
  description: {
    color: "#666",
    fontSize: "14px",
    lineHeight: 1.7,
    marginBottom: "30px",
  },
  label: {
    display: "block",
    fontSize: "11px",
    fontWeight: 900,
    letterSpacing: "1px",
    marginBottom: "8px",
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
    padding: "18px",
    background: "#B4FF00",
    color: "#111",
    border: "2px solid #111",
    borderRadius: "10px",
    fontWeight: 900,
    fontSize: "14px",
    cursor: "pointer",
  },
  error: {
    color: "#c22",
    fontSize: "13px",
    fontWeight: 700,
  },
  footer: {
    textAlign: "center",
    marginTop: "35px",
    fontSize: "10px",
    letterSpacing: "1px",
    color: "#888",
  },
};
