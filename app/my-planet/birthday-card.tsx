
"use client";

import { useState } from "react";

type BirthdayCardProps = {
  dateOfBirth: string | null;
};

export default function BirthdayCard({
  dateOfBirth,
}: BirthdayCardProps) {
  const [birthday, setBirthday] = useState(dateOfBirth || "");
  const [savedBirthday, setSavedBirthday] = useState(dateOfBirth || "");
  const [editing, setEditing] = useState(!dateOfBirth);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function saveBirthday() {
    setMessage("");
    setError("");

    if (!birthday) {
      setError("Please enter your date of birth.");
      return;
    }

    if (birthday > new Date().toISOString().slice(0, 10)) {
      setError("Your date of birth cannot be in the future.");
      return;
    }

    try {
      setSaving(true);

      const response = await fetch("/api/my-planet/birthday", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        cache: "no-store",
        body: JSON.stringify({
          dateOfBirth: birthday,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Unable to save your birthday.");
      }

      setSavedBirthday(result.dateOfBirth);
      setBirthday(result.dateOfBirth);
      setEditing(false);
      setMessage("Your birthday has been saved successfully!");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again."
      );
    } finally {
      setSaving(false);
    }
  }

  function formatBirthday(value: string) {
    if (!value) return "";

    return new Date(`${value}T12:00:00`).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }

  return (
    <section style={styles.card}>
      <p style={styles.eyebrow}>A LITTLE SOMETHING FOR YOU</p>

      <h2 style={styles.heading}>Birthday rewards. 🎂</h2>

      <p style={styles.description}>
        Let us know your birthday so we can make it a little more special.
      </p>

      {!editing && savedBirthday ? (
        <>
          <div style={styles.savedBox}>
            <span style={styles.savedLabel}>YOUR DATE OF BIRTH</span>
            <strong style={styles.savedDate}>
              {formatBirthday(savedBirthday)}
            </strong>
          </div>

          <button
            type="button"
            style={styles.button}
            onClick={() => {
              setBirthday(savedBirthday);
              setEditing(true);
              setMessage("");
              setError("");
            }}
          >
            EDIT DATE OF BIRTH
          </button>
        </>
      ) : (
        <>
          <label htmlFor="my-planet-birthday" style={styles.label}>
            Your date of birth
          </label>

          <input
            id="my-planet-birthday"
            type="date"
            value={birthday}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(event) => {
              setBirthday(event.target.value);
              setError("");
              setMessage("");
            }}
            style={styles.input}
          />

          <button
            type="button"
            style={{
              ...styles.button,
              opacity: saving ? 0.6 : 1,
            }}
            onClick={saveBirthday}
            disabled={saving}
          >
            {saving ? "SAVING..." : "SAVE MY BIRTHDAY"}
          </button>

          {savedBirthday && (
            <button
              type="button"
              style={styles.cancelButton}
              onClick={() => {
                setBirthday(savedBirthday);
                setEditing(false);
                setError("");
                setMessage("");
              }}
            >
              CANCEL
            </button>
          )}
        </>
      )}

      {message && <p style={styles.success}>{message}</p>}
      {error && <p style={styles.error}>{error}</p>}

      <p style={styles.note}>
        Your birthday is saved securely with your Planet Health membership.
      </p>
    </section>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: "#FFFFFF",
    borderRadius: "20px",
    padding: "24px",
    marginTop: "16px",
  },
  eyebrow: {
    fontSize: "10px",
    letterSpacing: "1.5px",
    fontWeight: 700,
    color: "#77716B",
  },
  heading: {
    fontSize: "22px",
    fontWeight: 900,
    margin: "12px 0",
    color: "#111111",
  },
  description: {
    fontSize: "14px",
    lineHeight: 1.6,
    color: "#77716B",
  },
  label: {
    display: "block",
    fontSize: "13px",
    fontWeight: 700,
    marginTop: "20px",
    marginBottom: "8px",
  },
  input: {
    display: "block",
    width: "100%",
    boxSizing: "border-box",
    padding: "14px",
    border: "1px solid #CCC3BA",
    borderRadius: "10px",
    fontSize: "16px",
    background: "#FFFFFF",
    color: "#111111",
  },
  button: {
    display: "block",
    width: "100%",
    marginTop: "16px",
    padding: "15px",
    background: "#45E017",
    color: "#111111",
    border: "none",
    borderRadius: "10px",
    fontSize: "13px",
    fontWeight: 900,
    cursor: "pointer",
  },
  cancelButton: {
    display: "block",
    width: "100%",
    marginTop: "10px",
    padding: "12px",
    background: "transparent",
    color: "#77716B",
    border: "1px solid #CCC3BA",
    borderRadius: "10px",
    fontWeight: 700,
    cursor: "pointer",
  },
  savedBox: {
    background: "#F0EBE6",
    borderRadius: "12px",
    padding: "16px",
    marginTop: "18px",
  },
  savedLabel: {
    display: "block",
    fontSize: "10px",
    letterSpacing: "1px",
    color: "#77716B",
    marginBottom: "8px",
  },
  savedDate: {
    fontSize: "18px",
    color: "#111111",
  },
  success: {
    color: "#187A13",
    fontSize: "13px",
    fontWeight: 700,
  },
  error: {
    color: "#B42318",
    fontSize: "13px",
  },
  note: {
    color: "#77716B",
    fontSize: "11px",
    lineHeight: 1.5,
    marginTop: "18px",
  },
};
