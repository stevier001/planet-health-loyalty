
"use client";

import { useCallback, useEffect, useState } from "react";

type StaffAccount = {
  staff_id: number;
  is_active: boolean;
  has_pin: boolean;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
};

type StaffAccessEvent = {
  id: number;
  staff_id: number;
  event_type: "login" | "logout";
  occurred_at: string;
};

const styles: Record<string, React.CSSProperties> = {
  section: {
    marginTop: 32,
    padding: "28px",
    border: "1px solid #333",
    borderRadius: 18,
    background: "#151515",
    color: "#fff",
    fontFamily: "inherit",
  },
  header: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    marginBottom: 24,
  },
  eyebrow: {
    color: "#B4FF00",
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: "0.2em",
    textTransform: "uppercase",
    margin: 0,
  },
  heading: {
    fontSize: 26,
    fontWeight: 900,
    margin: "8px 0 4px",
  },
  description: {
    color: "#999",
    fontSize: 14,
    margin: 0,
  },
  button: {
    border: "1px solid #444",
    borderRadius: 8,
    padding: "10px 14px",
    background: "#222",
    color: "#fff",
    fontSize: 12,
    fontWeight: 800,
    cursor: "pointer",
  },
  staffCard: {
    border: "1px solid #333",
    borderRadius: 12,
    background: "#101010",
    padding: 18,
  },
  staffHeader: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  staffInfo: {
    minWidth: 0,
  },
  staffIdentity: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 12,
  },
  staffId: {
    fontSize: 20,
    fontWeight: 900,
    marginRight: 4,
  },
  activeBadge: {
    display: "inline-block",
    borderRadius: 30,
    padding: "6px 12px",
    background: "rgba(180,255,0,0.13)",
    color: "#B4FF00",
    fontSize: 11,
    fontWeight: 900,
    letterSpacing: "0.04em",
  },
  inactiveBadge: {
    display: "inline-block",
    borderRadius: 30,
    padding: "6px 12px",
    background: "rgba(239,68,68,0.15)",
    color: "#fca5a5",
    fontSize: 11,
    fontWeight: 900,
    letterSpacing: "0.04em",
  },
  separator: {
    color: "#777",
    fontWeight: 800,
    margin: "0 3px",
  },
  pinBadge: {
    display: "inline-block",
    borderRadius: 30,
    padding: "6px 12px",
    background: "#292929",
    color: "#ddd",
    fontSize: 11,
    fontWeight: 800,
  },
  lastLogin: {
    margin: "12px 0 0",
    color: "#999",
    fontSize: 12,
  },
  actions: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
  },
  historyButton: {
    border: "1px solid rgba(180,255,0,0.5)",
    borderRadius: 8,
    padding: "10px 12px",
    background: "transparent",
    color: "#B4FF00",
    fontSize: 11,
    fontWeight: 900,
    cursor: "pointer",
  },
  dangerButton: {
    border: "1px solid rgba(239,68,68,0.5)",
    borderRadius: 8,
    padding: "10px 12px",
    background: "transparent",
    color: "#fca5a5",
    fontSize: 11,
    fontWeight: 900,
    cursor: "pointer",
  },
  activateButton: {
    border: "none",
    borderRadius: 8,
    padding: "10px 12px",
    background: "#B4FF00",
    color: "#111",
    fontSize: 11,
    fontWeight: 900,
    cursor: "pointer",
  },
  form: {
    marginTop: 20,
    paddingTop: 18,
    borderTop: "1px solid #333",
  },
  label: {
    display: "block",
    marginBottom: 10,
    fontSize: 14,
    fontWeight: 700,
  },
  inputRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
  },
  input: {
    flex: "1 1 180px",
    minWidth: 0,
    border: "1px solid #444",
    borderRadius: 8,
    padding: "12px 14px",
    background: "#080808",
    color: "#fff",
    fontSize: 14,
  },
  saveButton: {
    border: "none",
    borderRadius: 8,
    padding: "12px 20px",
    background: "#B4FF00",
    color: "#111",
    fontSize: 12,
    fontWeight: 900,
    cursor: "pointer",
  },
  helpText: {
    marginTop: 9,
    color: "#888",
    fontSize: 12,
  },
  historyPanel: {
    marginTop: 20,
    paddingTop: 20,
    borderTop: "1px solid #333",
  },
  historyHeader: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 16,
  },
  event: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    borderRadius: 9,
    background: "#222",
    padding: 12,
    marginBottom: 9,
  },
  eventIcon: {
    display: "flex",
    width: 36,
    height: 36,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "50%",
    background: "rgba(180,255,0,0.13)",
    color: "#B4FF00",
    fontSize: 18,
  },
  footer: {
    marginTop: 22,
    color: "#888",
    fontSize: 12,
    lineHeight: 1.6,
  },
  notice: {
    marginBottom: 16,
    borderRadius: 8,
    padding: 12,
    fontSize: 13,
  },
};

export default function StaffManagement() {
  const [staff, setStaff] = useState<StaffAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<number | null>(null);
  const [selectedStaff, setSelectedStaff] = useState<number | null>(null);
  const [historyStaff, setHistoryStaff] = useState<number | null>(null);
  const [history, setHistory] = useState<StaffAccessEvent[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [pin, setPin] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadStaff = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const response = await fetch("/api/owners-staff", {
        method: "GET",
        cache: "no-store",
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to load staff accounts.");
      }

      setStaff(data.staff || []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to load staff accounts."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStaff();
  }, [loadStaff]);

  async function loadAccessHistory(staffId: number) {
    if (historyStaff === staffId) {
      setHistoryStaff(null);
      setHistory([]);
      return;
    }

    try {
      setHistoryStaff(staffId);
      setHistoryLoading(true);
      setHistory([]);
      setError("");
      setMessage("");

      const response = await fetch(
        `/api/owners-staff?staffId=${staffId}`,
        { method: "GET", cache: "no-store" }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to load access history.");
      }

      setHistory(data.activity || []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to load access history."
      );
      setHistoryStaff(null);
    } finally {
      setHistoryLoading(false);
    }
  }

  async function updateStaff(
    staffId: number,
    action: "set_pin" | "activate" | "deactivate",
    newPin?: string
  ) {
    try {
      setSaving(staffId);
      setMessage("");
      setError("");

      const response = await fetch("/api/owners-staff", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staffId,
          action,
          ...(newPin ? { pin: newPin } : {}),
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to update staff account.");
      }

      setMessage(data.message || "Staff account updated.");
      setSelectedStaff(null);
      setPin("");
      await loadStaff();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to update staff account."
      );
    } finally {
      setSaving(null);
    }
  }

  function formatDate(value: string | null) {
    if (!value) return "Never";

    return new Date(value).toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <section style={styles.section}>
      <div style={styles.header}>
        <div>
          <p style={styles.eyebrow}>Team administration</p>
          <h2 style={styles.heading}>Staff Management</h2>
          <p style={styles.description}>
            Manage individual staff IDs, access PINs and login history.
          </p>
        </div>

        <button
          type="button"
          onClick={loadStaff}
          disabled={loading}
          style={{ ...styles.button, opacity: loading ? 0.5 : 1 }}
        >
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {message && (
        <div
          style={{
            ...styles.notice,
            border: "1px solid rgba(180,255,0,0.3)",
            background: "rgba(180,255,0,0.1)",
            color: "#B4FF00",
          }}
        >
          {message}
        </div>
      )}

      {error && (
        <div
          style={{
            ...styles.notice,
            border: "1px solid rgba(239,68,68,0.3)",
            background: "rgba(239,68,68,0.1)",
            color: "#fca5a5",
          }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <p style={{ padding: 30, textAlign: "center", color: "#999" }}>
          Loading staff accounts...
        </p>
      ) : staff.length === 0 ? (
        <p style={{ padding: 30, textAlign: "center", color: "#999" }}>
          No staff accounts found.
        </p>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {staff.map((member) => (
            <div key={member.staff_id} style={styles.staffCard}>
              <div style={styles.staffHeader}>
                <div style={styles.staffInfo}>
                  <div style={styles.staffIdentity}>
                    <span style={styles.staffId}>#{member.staff_id}</span>

                    <span
                      style={
                        member.is_active
                          ? styles.activeBadge
                          : styles.inactiveBadge
                      }
                    >
                      {member.is_active ? "ACTIVE" : "INACTIVE"}
                    </span>

                    <span style={styles.separator}>|</span>

                    <span style={styles.pinBadge}>
                      {member.has_pin ? "PIN ASSIGNED" : "NO PIN"}
                    </span>
                  </div>

                  <p style={styles.lastLogin}>
                    Last login: {formatDate(member.last_login_at)}
                  </p>
                </div>

                <div style={styles.actions}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedStaff(
                        selectedStaff === member.staff_id
                          ? null
                          : member.staff_id
                      );
                      setPin("");
                      setMessage("");
                      setError("");
                    }}
                    style={styles.button}
                  >
                    {selectedStaff === member.staff_id
                      ? "CANCEL"
                      : member.has_pin
                        ? "CHANGE PIN"
                        : "SET PIN"}
                  </button>

                  <button
                    type="button"
                    onClick={() => loadAccessHistory(member.staff_id)}
                    style={styles.historyButton}
                  >
                    {historyStaff === member.staff_id
                      ? "HIDE HISTORY"
                      : "VIEW ACCESS HISTORY"}
                  </button>

                  {member.is_active ? (
                    <button
                      type="button"
                      disabled={saving === member.staff_id}
                      onClick={() =>
                        updateStaff(member.staff_id, "deactivate")
                      }
                      style={{
                        ...styles.dangerButton,
                        opacity: saving === member.staff_id ? 0.5 : 1,
                      }}
                    >
                      DEACTIVATE
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={
                        saving === member.staff_id || !member.has_pin
                      }
                      onClick={() =>
                        updateStaff(member.staff_id, "activate")
                      }
                      style={{
                        ...styles.activateButton,
                        opacity:
                          saving === member.staff_id || !member.has_pin
                            ? 0.3
                            : 1,
                      }}
                    >
                      ACTIVATE
                    </button>
                  )}
                </div>
              </div>

              {selectedStaff === member.staff_id && (
                <div style={styles.form}>
                  <label style={styles.label}>
                    {member.has_pin
                      ? "Enter new personal PIN"
                      : "Create personal PIN"}
                  </label>

                  <div style={styles.inputRow}>
                    <input
                      type="password"
                      inputMode="numeric"
                      autoComplete="new-password"
                      maxLength={8}
                      value={pin}
                      onChange={(event) =>
                        setPin(event.target.value.replace(/\D/g, ""))
                      }
                      placeholder="4–8 digit PIN"
                      style={styles.input}
                    />

                    <button
                      type="button"
                      disabled={
                        saving === member.staff_id ||
                        !/^\d{4,8}$/.test(pin)
                      }
                      onClick={() =>
                        updateStaff(member.staff_id, "set_pin", pin)
                      }
                      style={{
                        ...styles.saveButton,
                        opacity:
                          saving === member.staff_id ||
                          !/^\d{4,8}$/.test(pin)
                            ? 0.3
                            : 1,
                      }}
                    >
                      {saving === member.staff_id ? "SAVING..." : "SAVE PIN"}
                    </button>
                  </div>

                  <p style={styles.helpText}>
                    Use 4–8 digits. Saving a PIN automatically activates this
                    account.
                  </p>
                </div>
              )}

              {historyStaff === member.staff_id && (
                <div style={styles.historyPanel}>
                  <div style={styles.historyHeader}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>
                        Access History — #{member.staff_id}
                      </h3>
                      <p style={{ margin: "5px 0 0", color: "#888", fontSize: 12 }}>
                        Staff Portal login and logout records
                      </p>
                    </div>

                    <span style={styles.pinBadge}>
                      {history.length} events
                    </span>
                  </div>

                  {historyLoading ? (
                    <p style={{ padding: 20, textAlign: "center", color: "#999" }}>
                      Loading access history...
                    </p>
                  ) : history.length === 0 ? (
                    <p
                      style={{
                        borderRadius: 8,
                        background: "#222",
                        padding: 16,
                        textAlign: "center",
                        color: "#999",
                        fontSize: 13,
                      }}
                    >
                      No access history recorded yet.
                    </p>
                  ) : (
                    <div>
                      {history.map((event) => (
                        <div key={event.id} style={styles.event}>
                          <span
                            style={{
                              ...styles.eventIcon,
                              ...(event.event_type === "logout"
                                ? {
                                    background: "#333",
                                    color: "#bbb",
                                  }
                                : {}),
                            }}
                          >
                            {event.event_type === "login" ? "↗" : "↙"}
                          </span>

                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ margin: 0, fontSize: 13, fontWeight: 800 }}>
                              {event.event_type === "login"
                                ? "Logged in"
                                : "Logged out"}
                            </p>
                            <p style={{ margin: "5px 0 0", color: "#999", fontSize: 12 }}>
                              {formatDate(event.occurred_at)}
                            </p>
                          </div>

                          <span
                            style={{
                              color:
                                event.event_type === "login"
                                  ? "#B4FF00"
                                  : "#999",
                              fontSize: 11,
                              fontWeight: 900,
                              textTransform: "uppercase",
                            }}
                          >
                            {event.event_type}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <p style={styles.footer}>
        Staff IDs are permanent and should never be reassigned. Deactivating
        an account preserves its historical records.
      </p>
    </section>
  );
}
