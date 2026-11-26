
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
        err instanceof Error
          ? err.message
          : "Unable to load staff accounts."
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
        {
          method: "GET",
          cache: "no-store",
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.message || "Unable to load access history."
        );
      }

      setHistory(data.activity || []);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load access history."
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
        headers: {
          "Content-Type": "application/json",
        },
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
        err instanceof Error
          ? err.message
          : "Unable to update staff account."
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
    <section className="mt-8 rounded-2xl border border-white/10 bg-[#151515] p-5 text-white md:p-7">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#B4FF00]">
            Team administration
          </p>
          <h2 className="mt-2 text-2xl font-black">
            Staff Management
          </h2>
          <p className="mt-1 text-sm text-white/50">
            Manage individual staff IDs, access PINs and login history.
          </p>
        </div>

        <button
          type="button"
          onClick={loadStaff}
          disabled={loading}
          className="rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold transition hover:bg-white/10 disabled:opacity-50"
        >
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {message && (
        <div className="mb-5 rounded-lg border border-[#B4FF00]/30 bg-[#B4FF00]/10 p-3 text-sm text-[#B4FF00]">
          {message}
        </div>
      )}

      {error && (
        <div className="mb-5 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <p className="py-8 text-center text-sm text-white/50">
          Loading staff accounts...
        </p>
      ) : staff.length === 0 ? (
        <p className="py-8 text-center text-sm text-white/50">
          No staff accounts found.
        </p>
      ) : (
        <div className="space-y-3">
          {staff.map((member) => (
            <div
              key={member.staff_id}
              className="rounded-xl border border-white/10 bg-black/20 p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-xl font-black">
                      #{member.staff_id}
                    </span>

                    <span
                      className={`rounded-full px-3 py-1 text-xs font-bold ${
                        member.is_active
                          ? "bg-[#B4FF00]/15 text-[#B4FF00]"
                          : "bg-red-500/15 text-red-300"
                      }`}
                    >
                      {member.is_active ? "ACTIVE" : "INACTIVE"}
                    </span>

                    <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-white/70">
                      {member.has_pin ? "PIN ASSIGNED" : "NO PIN"}
                    </span>
                  </div>

                  <p className="mt-2 text-xs text-white/45">
                    Last login: {formatDate(member.last_login_at)}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
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
                    className="rounded-lg border border-white/20 px-3 py-2 text-xs font-bold hover:bg-white/10"
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
                    className="rounded-lg border border-[#B4FF00]/40 px-3 py-2 text-xs font-bold text-[#B4FF00] hover:bg-[#B4FF00]/10"
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
                      className="rounded-lg border border-red-500/40 px-3 py-2 text-xs font-bold text-red-300 hover:bg-red-500/10 disabled:opacity-50"
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
                      className="rounded-lg bg-[#B4FF00] px-3 py-2 text-xs font-black text-black hover:opacity-90 disabled:opacity-30"
                    >
                      ACTIVATE
                    </button>
                  )}
                </div>
              </div>

              {selectedStaff === member.staff_id && (
                <div className="mt-5 border-t border-white/10 pt-4">
                  <label className="mb-2 block text-sm font-semibold">
                    {member.has_pin
                      ? "Enter new personal PIN"
                      : "Create personal PIN"}
                  </label>

                  <div className="flex flex-wrap gap-3">
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
                      className="min-w-0 flex-1 rounded-lg border border-white/20 bg-black px-4 py-3 text-white outline-none focus:border-[#B4FF00]"
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
                      className="rounded-lg bg-[#B4FF00] px-5 py-3 text-sm font-black text-black hover:opacity-90 disabled:opacity-30"
                    >
                      {saving === member.staff_id
                        ? "SAVING..."
                        : "SAVE PIN"}
                    </button>
                  </div>

                  <p className="mt-2 text-xs text-white/40">
                    Use 4–8 digits. Saving a PIN automatically activates this account.
                  </p>
                </div>
              )}

              {historyStaff === member.staff_id && (
                <div className="mt-5 border-t border-white/10 pt-5">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="font-bold text-white">
                        Access History — #{member.staff_id}
                      </h3>
                      <p className="mt-1 text-xs text-white/40">
                        Staff Portal login and logout records
                      </p>
                    </div>

                    <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-white/60">
                      {history.length} events
                    </span>
                  </div>

                  {historyLoading ? (
                    <p className="py-6 text-center text-sm text-white/50">
                      Loading access history...
                    </p>
                  ) : history.length === 0 ? (
                    <p className="rounded-lg bg-white/5 p-4 text-center text-sm text-white/50">
                      No access history recorded yet.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {history.map((event) => (
                        <div
                          key={event.id}
                          className="flex items-center gap-3 rounded-lg bg-white/5 p-3"
                        >
                          <span
                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg ${
                              event.event_type === "login"
                                ? "bg-[#B4FF00]/15 text-[#B4FF00]"
                                : "bg-white/10 text-white/60"
                            }`}
                          >
                            {event.event_type === "login" ? "↗" : "↙"}
                          </span>

                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold text-white">
                              {event.event_type === "login"
                                ? "Logged in"
                                : "Logged out"}
                            </p>
                            <p className="mt-1 text-xs text-white/45">
                              {formatDate(event.occurred_at)}
                            </p>
                          </div>

                          <span
                            className={`text-xs font-bold uppercase ${
                              event.event_type === "login"
                                ? "text-[#B4FF00]"
                                : "text-white/40"
                            }`}
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

      <p className="mt-6 text-xs leading-relaxed text-white/40">
        Staff IDs are permanent and should never be reassigned. Deactivating
        an account preserves its historical records.
      </p>
    </section>
  );
}
