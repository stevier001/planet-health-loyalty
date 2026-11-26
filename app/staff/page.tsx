
"use client";

import { useEffect, useRef, useState } from "react";

type Customer = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  stamps: number;
};

type WalletTransaction = {
  id: string;
  transaction_type: "credit" | "debit";
  amount_pence: number;
  balance_after_pence: number;
  description: string | null;
  reference: string | null;
  created_at: string;
};

type WalletMode = "credit" | "debit";

export default function StaffPage() {
  const [staffId, setStaffId] = useState("");
  const [pin, setPin] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);
  const [loginLoading, setLoginLoading] = useState(false);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selected, setSelected] = useState<Customer | null>(null);

  const [searchLoading, setSearchLoading] = useState(false);
  const [stampLoading, setStampLoading] = useState(false);
  const [redeemLoading, setRedeemLoading] = useState(false);
  const [message, setMessage] = useState("");

  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerError, setScannerError] = useState("");

  // Wallet state
  const [balancePence, setBalancePence] = useState<number | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletError, setWalletError] = useState("");
  const [walletMessage, setWalletMessage] = useState("");
  const [walletMode, setWalletMode] = useState<WalletMode | null>(null);
  const [walletAmount, setWalletAmount] = useState("");
  const [walletDescription, setWalletDescription] = useState("");
  const [walletTransactionLoading, setWalletTransactionLoading] =
    useState(false);

  const scannerRef = useRef<HTMLDivElement | null>(null);
  const walletRequestNumber = useRef(0);
  const pendingWalletRequest = useRef<string | null>(null);

  function formatMoney(pence: number) {
    return (pence / 100).toLocaleString("en-GB", {
      style: "currency",
      currency: "GBP",
    });
  }

  // Check staff login session
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

  // Load the selected customer's wallet
  async function loadWallet(customerId: string) {
    const requestNumber = ++walletRequestNumber.current;

    setWalletLoading(true);
    setWalletError("");
    setWalletMessage("");
    setBalancePence(null);
    setTransactions([]);

    try {
      const response = await fetch(
        `/api/wallet/balance?customerId=${encodeURIComponent(customerId)}`,
        { cache: "no-store" }
      );

      const data = await response.json();

      if (requestNumber !== walletRequestNumber.current) return;

      if (response.status === 401) {
        setWalletError(
          "Wallet access was denied. Your staff login is still active. Please try refreshing the wallet."
        );
        return;
      }

      if (!response.ok || !data.success) {
        setWalletError(data.message || "Unable to load wallet.");
        return;
      }

      setBalancePence(data.balance_pence ?? 0);
      setTransactions(data.transactions || []);
    } catch {
      if (requestNumber !== walletRequestNumber.current) return;
      setWalletError("Unable to load wallet. Please try again.");
    } finally {
      if (requestNumber === walletRequestNumber.current) {
        setWalletLoading(false);
      }
    }
  }

  // Individual staff login
  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoginLoading(true);
    setError("");

    try {
      const response = await fetch("/api/staff-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffId, pin }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setError(data.message || "Incorrect staff ID or PIN.");
        return;
      }

      setAuthenticated(true);
      setStaffId("");
      setPin("");
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleLogout() {
    setScannerOpen(false);

    try {
      await fetch("/api/staff-logout", { method: "POST" });
    } finally {
      setAuthenticated(false);
      setSelected(null);
      setCustomers([]);
      setSearch("");
      setMessage("");
      setBalancePence(null);
      setTransactions([]);
      setWalletMode(null);
      pendingWalletRequest.current = null;
    }
  }

  // Shared customer search for manual searches and QR scans
  async function searchCustomerTerm(term: string, isQrScan = false) {
    if (term.trim().length < 2) {
      setError("Please enter at least 2 characters.");
      return;
    }

    setSearchLoading(true);
    setError("");
    setMessage("");
    setSelected(null);
    setCustomers([]);
    setSearch(term);

    try {
      const response = await fetch(
        `/api/customer-search?q=${encodeURIComponent(term.trim())}`,
        { cache: "no-store" }
      );

      const data = await response.json();

      if (response.status === 401) {
        setAuthenticated(false);
        setError("Your staff session has expired. Please log in again.");
        return;
      }

      if (!response.ok || !data.success) {
        setError(data.message || "Customer search failed.");
        return;
      }

      setCustomers(data.customers || []);

      if (!data.customers?.length) {
        setMessage("No customers found. Try another search.");
      } else if (isQrScan && /^\d+$/.test(term.trim())) {
        try {
          const scanResponse = await fetch("/api/qr-scan", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              customer_id: data.customers[0].id,
            }),
          });

          if (!scanResponse.ok) {
            console.error("QR scan could not be recorded.");
          }
        } catch (scanError) {
          console.error("QR scan could not be recorded:", scanError);
        }
      }
    } catch {
      setError("Unable to search customers. Please try again.");
    } finally {
      setSearchLoading(false);
    }
  }

  async function searchCustomers(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await searchCustomerTerm(search);
  }

  // Select customer and load their wallet
  async function selectCustomer(customer: Customer) {
    setSelected(customer);
    setError("");
    setMessage("");
    setWalletMode(null);
    setWalletAmount("");
    setWalletDescription("");
    await loadWallet(customer.id);
  }

  // Add a loyalty stamp
  async function addStamp() {
    if (!selected || stampLoading) return;

    setStampLoading(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/stamp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: selected.id }),
      });

      const data = await response.json();

      if (response.status === 401) {
        setAuthenticated(false);
        setError("Your staff session has expired. Please log in again.");
        return;
      }

      if (!response.ok || !data.success) {
        setError(data.message || "Unable to add stamp.");
        return;
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

      setMessage(data.message || "Stamp successfully added.");
    } catch {
      setError("Unable to save stamp. Please try again.");
    } finally {
      setStampLoading(false);
    }
  }

  // Redeem a reward
  async function redeemReward() {
    if (!selected || redeemLoading || selected.stamps < 6) return;

    const confirmed = window.confirm(
      "Are you sure you want to redeem this customer's reward?"
    );

    if (!confirmed) return;

    setRedeemLoading(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/redeem-reward", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId: selected.id }),
      });

      const data = await response.json();

      if (response.status === 401) {
        setAuthenticated(false);
        setError("Your staff session has expired. Please log in again.");
        return;
      }

      if (!response.ok || !data.success) {
        setError(data.message || "Unable to redeem reward.");
        return;
      }

      const updatedCustomer = {
        ...selected,
        stamps: 0,
      };

      setSelected(updatedCustomer);

      setCustomers((current) =>
        current.map((customer) =>
          customer.id === updatedCustomer.id
            ? updatedCustomer
            : customer
        )
      );

      setMessage(data.message || "Reward successfully redeemed.");
    } catch {
      setError("Unable to redeem reward. Please try again.");
    } finally {
      setRedeemLoading(false);
    }
  }

  // Process a wallet top-up or spend
  async function processWalletTransaction(
    e: React.FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();

    if (!selected || walletTransactionLoading || !walletMode) return;

    const amount = Number(walletAmount);

    if (!Number.isFinite(amount) || amount <= 0) {
      setWalletError("Please enter a valid amount.");
      return;
    }

    const amountPence = Math.round(amount * 100);

    if (amountPence <= 0) {
      setWalletError("Please enter a valid amount.");
      return;
    }

    if (
      walletMode === "debit" &&
      balancePence !== null &&
      amountPence > balancePence
    ) {
      setWalletError("This customer does not have enough wallet balance.");
      return;
    }

    setWalletTransactionLoading(true);
    setWalletError("");
    setWalletMessage("");

    const requestId = `${selected.id}-${Date.now()}`;
    pendingWalletRequest.current = requestId;

    try {
      const response = await fetch("/api/wallet/transaction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: selected.id,
          type: walletMode,
          amount: amountPence,
          description: walletDescription.trim() || undefined,
          requestId,
        }),
      });

      const data = await response.json();

      if (response.status === 401) {
        setAuthenticated(false);
        setWalletError("Your staff session has expired. Please log in again.");
        return;
      }

      if (!response.ok || !data.success) {
        setWalletError(data.message || "Unable to process wallet transaction.");
        return;
      }

      setWalletMessage(data.message || "Wallet transaction completed.");
      setWalletAmount("");
      setWalletDescription("");
      setWalletMode(null);

      await loadWallet(selected.id);
    } catch {
      setWalletError("Unable to process wallet transaction. Please try again.");
    } finally {
      setWalletTransactionLoading(false);
      pendingWalletRequest.current = null;
    }
  }

  // QR scanner
  useEffect(() => {
    if (!scannerOpen || !authenticated) return;

    let scanner: any;
    let cancelled = false;

    async function startScanner() {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");

        if (cancelled || !scannerRef.current) return;

        scanner = new Html5Qrcode("staff-qr-reader");

        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
          },
          async (decodedText: string) => {
            await scanner.stop();
            setScannerOpen(false);
            await searchCustomerTerm(decodedText, true);
          },
          () => {}
        );
      } catch {
        setScannerError(
          "Unable to start camera. Please check camera permissions or use manual search."
        );
      }
    }

    startScanner();

    return () => {
      cancelled = true;

      if (scanner) {
        scanner
          .stop()
          .then(() => scanner.clear())
          .catch(() => {
            scanner.clear().catch(() => {});
          });
      }
    };
  }, [scannerOpen, authenticated]);

  if (checking) {
    return (
      <main style={styles.page}>
        <div style={styles.loginCard}>
          <p style={styles.smallText}>Checking staff access...</p>
        </div>
      </main>
    );
  }

  if (!authenticated) {
    return (
      <main style={styles.page}>
        <div style={styles.loginCard}>
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
            Enter your personal staff ID and PIN to access the loyalty control
            panel.
          </p>

          <form onSubmit={handleLogin}>
            <label style={styles.label}>STAFF ID</label>
            <input
              style={styles.input}
              type="text"
              inputMode="numeric"
              autoComplete="username"
              placeholder="Enter your staff ID"
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
              required
            />

            <label style={styles.label}>PERSONAL PIN</label>
            <input
              style={styles.input}
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              placeholder="Enter your PIN"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              required
            />

            {error && <p style={styles.error}>{error}</p>}

            <button
              style={styles.button}
              type="submit"
              disabled={loginLoading}
            >
              {loginLoading ? "CHECKING ACCESS..." : "ACCESS STAFF PORTAL →"}
            </button>
          </form>

          <footer style={styles.footer}>PLANET HEALTH · STAFF ONLY</footer>
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

          <button
            type="button"
            style={styles.logout}
            onClick={handleLogout}
          >
            LOG OUT
          </button>
        </header>

        {/* CUSTOMER SEARCH */}
        <section style={styles.section}>
          <div style={styles.eyebrow}>CUSTOMER LOOKUP</div>
          <h2 style={styles.sectionTitle}>Find a customer</h2>
          <p style={styles.smallText}>
            Search using a customer's name, email address or customer ID.
          </p>

          <form onSubmit={searchCustomers}>
            <input
              style={styles.input}
              type="text"
              placeholder="Search customers..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            <button
              type="submit"
              style={styles.button}
              disabled={searchLoading}
            >
              {searchLoading ? "SEARCHING..." : "SEARCH CUSTOMERS →"}
            </button>
          </form>

          <button
            type="button"
            style={styles.secondaryButton}
            onClick={() => {
              setScannerError("");
              setScannerOpen((current) => !current);
            }}
          >
            {scannerOpen ? "CLOSE QR SCANNER" : "SCAN CUSTOMER QR CODE"}
          </button>

          {scannerOpen && (
            <div style={styles.scannerBox}>
              <div id="staff-qr-reader" ref={scannerRef} />
              {scannerError && (
                <p style={styles.error}>{scannerError}</p>
              )}
            </div>
          )}

          {error && <p style={styles.error}>{error}</p>}
          {message && <p style={styles.message}>{message}</p>}

          {customers.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <h3 style={styles.transactionTitle}>SEARCH RESULTS</h3>

              {customers.map((customer) => (
                <button
                  key={customer.id}
                  type="button"
                  onClick={() => selectCustomer(customer)}
                  style={{
                    ...styles.customerButton,
                    ...(selected?.id === customer.id
                      ? styles.customerButtonSelected
                      : {}),
                  }}
                >
                  <span>
                    <strong>
                      {customer.firstName} {customer.lastName}
                    </strong>
                    <br />
                    <small>{customer.email}</small>
                  </span>

                  <span style={styles.customerStamps}>
                    {customer.stamps}/6
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* SELECTED CUSTOMER */}
        {selected && (
          <section style={styles.section}>
            <div style={styles.eyebrow}>CUSTOMER LOYALTY CARD</div>
            <h2 style={styles.sectionTitle}>
              {selected.firstName} {selected.lastName}
            </h2>
            <p style={styles.smallText}>{selected.email}</p>

            <div style={styles.stampCard}>
              <div style={styles.eyebrow}>LOYALTY PROGRESS</div>

              <div style={styles.stampCount}>
                {selected.stamps} / 6
              </div>

              <p style={styles.smallText}>
                {selected.stamps >= 6
                  ? "Reward unlocked."
                  : `${6 - selected.stamps} more stamps until a reward.`}
              </p>

              <div style={styles.stampGrid}>
                {Array.from({ length: 6 }).map((_, index) => (
                  <div
                    key={index}
                    style={{
                      ...styles.stampCircle,
                      ...(index < selected.stamps
                        ? styles.stampCircleActive
                        : {}),
                    }}
                  >
                    {index < selected.stamps ? "✓" : index + 1}
                  </div>
                ))}
              </div>

              <div style={styles.actionGrid}>
                <button
                  type="button"
                  style={styles.actionButton}
                  onClick={addStamp}
                  disabled={stampLoading || selected.stamps >= 6}
                >
                  {stampLoading ? "ADDING..." : "ADD STAMP +"}
                </button>

                <button
                  type="button"
                  style={styles.actionButton}
                  onClick={redeemReward}
                  disabled={redeemLoading || selected.stamps < 6}
                >
                  {redeemLoading ? "REDEEMING..." : "REDEEM REWARD"}
                </button>
              </div>
            </div>
          </section>
        )}

        {/* CUSTOMER WALLET */}
        {selected && (
          <section style={styles.walletCard}>
            <div style={styles.walletHeader}>
              <div>
                <div style={styles.eyebrow}>CUSTOMER WALLET</div>
                <h2 style={styles.walletTitle}>Planet Health Wallet</h2>
              </div>
              <div style={styles.walletIcon}>£</div>
            </div>

            {walletLoading ? (
              <p style={styles.smallText}>Loading wallet...</p>
            ) : balancePence !== null ? (
              <div style={styles.walletBalance}>
                {formatMoney(balancePence)}
              </div>
            ) : (
              <p style={styles.smallText}>Wallet balance unavailable.</p>
            )}

            {walletError && <p style={styles.error}>{walletError}</p>}
            {walletMessage && <p style={styles.message}>{walletMessage}</p>}

            <div style={styles.walletActions}>
              <button
                type="button"
                style={styles.walletActionButton}
                onClick={() => {
                  setWalletMode("credit");
                  setWalletAmount("");
                  setWalletDescription("");
                  setWalletError("");
                  setWalletMessage("");
                }}
              >
                <span style={styles.walletActionIcon}>+</span>
                <strong>ADD MONEY</strong>
                <small style={styles.walletHint}>Top up customer wallet</small>
              </button>

              <button
                type="button"
                style={styles.walletActionButton}
                onClick={() => {
                  setWalletMode("debit");
                  setWalletAmount("");
                  setWalletDescription("");
                  setWalletError("");
                  setWalletMessage("");
                }}
              >
                <span style={styles.walletActionIcon}>−</span>
                <strong>SPEND MONEY</strong>
                <small style={styles.walletHint}>Deduct from wallet</small>
              </button>
            </div>

            {walletMode && (
              <form
                style={styles.walletForm}
                onSubmit={processWalletTransaction}
              >
                <h3 style={styles.walletFormTitle}>
                  {walletMode === "credit" ? "ADD MONEY" : "SPEND MONEY"}
                </h3>

                <label style={styles.label}>AMOUNT (£)</label>
                <input
                  style={styles.input}
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="0.00"
                  value={walletAmount}
                  onChange={(e) => setWalletAmount(e.target.value)}
                  required
                />

                <label style={styles.label}>DESCRIPTION (OPTIONAL)</label>
                <input
                  style={styles.input}
                  type="text"
                  placeholder="Add a note..."
                  value={walletDescription}
                  onChange={(e) => setWalletDescription(e.target.value)}
                />

                {walletError && <p style={styles.error}>{walletError}</p>}

                <button
                  type="submit"
                  style={styles.button}
                  disabled={walletTransactionLoading}
                >
                  {walletTransactionLoading
                    ? "PROCESSING..."
                    : walletMode === "credit"
                      ? "CONFIRM TOP-UP →"
                      : "CONFIRM SPEND →"}
                </button>

                <button
                  type="button"
                  onClick={() => setWalletMode(null)}
                  style={styles.secondaryButton}
                >
                  CANCEL
                </button>
              </form>
            )}

            {/* TRANSACTION HISTORY */}
            <div style={styles.transactionSection}>
              <h3 style={styles.transactionTitle}>RECENT TRANSACTIONS</h3>

              {transactions.length === 0 ? (
                <p style={styles.smallText}>
                  No wallet transactions yet.
                </p>
              ) : (
                transactions.map((transaction) => (
                  <div
                    key={transaction.id}
                    style={styles.transactionRow}
                  >
                    <div>
                      <strong>
                        {transaction.description ||
                          (transaction.transaction_type === "credit"
                            ? "Wallet top-up"
                            : "Wallet spend")}
                      </strong>
                      <small>
                        {new Date(transaction.created_at).toLocaleString(
                          "en-GB"
                        )}
                      </small>
                    </div>

                    <div style={styles.transactionAmount}>
                      <strong
                        style={{
                          color:
                            transaction.transaction_type === "credit"
                              ? "#269900"
                              : "#111111",
                        }}
                      >
                        {transaction.transaction_type === "credit" ? "+" : "-"}
                        {formatMoney(transaction.amount_pence)}
                      </strong>
                      <small>
                        Balance:{" "}
                        {formatMoney(transaction.balance_after_pence)}
                      </small>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        )}

        <footer style={styles.footer}>
          PLANET HEALTH · STAFF ONLY
        </footer>
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#F0EBE6",
    color: "#111111",
    padding: "24px 16px",
    fontFamily: "Arial, Helvetica, sans-serif",
  },
  loginCard: {
    width: "100%",
    maxWidth: 420,
    margin: "60px auto",
    padding: 32,
    background: "#FFFFFF",
    border: "1px solid #E0DAD3",
    borderRadius: 18,
    boxSizing: "border-box",
    boxShadow: "0 12px 35px rgba(0,0,0,0.05)",
  },
  dashboard: {
    width: "100%",
    maxWidth: 760,
    margin: "0 auto",
  },
  logo: {
    fontSize: 22,
    fontWeight: 900,
    letterSpacing: "-1px",
    marginBottom: 12,
    color: "#111111",
  },
  green: {
    color: "#45e017",
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: 2,
    color: "#269900",
    marginBottom: 10,
  },
  heading: {
    fontSize: "clamp(38px, 8vw, 64px)",
    fontWeight: 900,
    lineHeight: 0.95,
    letterSpacing: "-3px",
    margin: "18px 0",
    color: "#111111",
  },
  description: {
    color: "#666666",
    fontSize: 14,
    lineHeight: 1.6,
    marginBottom: 28,
  },
  label: {
    display: "block",
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: 1.5,
    color: "#555555",
    margin: "18px 0 8px",
  },
  input: {
    display: "block",
    width: "100%",
    boxSizing: "border-box",
    background: "#FFFFFF",
    border: "1px solid #D8D2CB",
    borderRadius: 9,
    color: "#111111",
    padding: "15px 14px",
    fontSize: 16,
    outline: "none",
    marginBottom: 14,
  },
  button: {
    display: "block",
    width: "100%",
    background: "#45e017",
    color: "#111111",
    border: "none",
    borderRadius: 9,
    padding: "16px",
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: 1,
    cursor: "pointer",
    marginTop: 16,
  },
  secondaryButton: {
    display: "block",
    width: "100%",
    background: "#FFFFFF",
    color: "#111111",
    border: "1px solid #D8D2CB",
    borderRadius: 9,
    padding: "13px",
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: 1,
    cursor: "pointer",
    marginTop: 12,
  },
  error: {
    color: "#D93636",
    fontSize: 13,
    lineHeight: 1.5,
  },
  message: {
    color: "#269900",
    fontSize: 13,
    lineHeight: 1.5,
  },
  footer: {
    textAlign: "center",
    color: "#888078",
    fontSize: 9,
    fontWeight: 800,
    letterSpacing: 2,
    marginTop: 35,
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    marginBottom: 35,
  },
  logout: {
    background: "#FFFFFF",
    border: "1px solid #D8D2CB",
    color: "#111111",
    padding: "11px 16px",
    borderRadius: 8,
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: 1,
    cursor: "pointer",
  },
  section: {
    background: "#FFFFFF",
    border: "1px solid #E0DAD3",
    borderRadius: 16,
    padding: 22,
    marginBottom: 22,
    boxShadow: "0 5px 18px rgba(0,0,0,0.025)",
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: 900,
    letterSpacing: "-0.5px",
    margin: "8px 0",
    color: "#111111",
  },
  smallText: {
    color: "#77716B",
    fontSize: 12,
    lineHeight: 1.6,
  },
  scannerSection: {
    background: "#FFFFFF",
    border: "1px solid #E0DAD3",
    borderRadius: 16,
    padding: 22,
    marginBottom: 22,
    boxShadow: "0 5px 18px rgba(0,0,0,0.025)",
  },
  scannerHeading: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  scannerTitle: {
    fontSize: 24,
    fontWeight: 900,
    margin: "4px 0 10px",
    color: "#111111",
  },
  scannerIcon: {
    fontSize: 34,
    color: "#269900",
  },
  scannerBox: {
    marginTop: 18,
    overflow: "hidden",
    borderRadius: 12,
  },
  customerButton: {
    width: "100%",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    background: "#FAF8F5",
    border: "1px solid #E0DAD3",
    borderRadius: 10,
    padding: 15,
    color: "#111111",
    textAlign: "left",
    marginTop: 9,
    cursor: "pointer",
  },
  customerButtonSelected: {
    border: "1px solid #45e017",
    background: "#F5FFEF",
  },
  customerStamps: {
    color: "#269900",
    fontWeight: 900,
    fontSize: 14,
  },
  stampCard: {
    background: "#FAF8F5",
    border: "1px solid #E0DAD3",
    borderRadius: 14,
    padding: 20,
    marginTop: 22,
    textAlign: "center",
  },
  stampCount: {
    fontSize: 46,
    fontWeight: 900,
    margin: "12px 0",
    color: "#111111",
  },
  stampGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(6, 1fr)",
    gap: 8,
    margin: "20px 0",
  },
  stampCircle: {
    width: "100%",
    aspectRatio: "1",
    borderRadius: "50%",
    border: "1px solid #CFC8C0",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 18,
    fontWeight: 900,
    boxSizing: "border-box",
    color: "#111111",
    background: "#FFFFFF",
  },
  stampCircleActive: {
    background: "#45e017",
    borderColor: "#45e017",
    color: "#111111",
  },
  actionGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 10,
    marginTop: 16,
  },
  actionButton: {
    background: "#F5FFEF",
    color: "#237D00",
    border: "1px solid #45e017",
    borderRadius: 9,
    padding: 14,
    fontSize: 11,
    fontWeight: 900,
    cursor: "pointer",
  },
  walletCard: {
    background: "#FFFFFF",
    border: "1px solid #E0DAD3",
    borderRadius: 14,
    padding: 20,
    marginTop: 25,
    boxShadow: "0 5px 18px rgba(0,0,0,0.025)",
  },
  walletHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  walletTitle: {
    fontSize: 19,
    fontWeight: 900,
    margin: "5px 0",
    color: "#111111",
  },
  walletIcon: {
    width: 42,
    height: 42,
    borderRadius: "50%",
    background: "#45e017",
    color: "#111111",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 24,
    fontWeight: 900,
  },
  walletBalance: {
    fontSize: 38,
    fontWeight: 900,
    letterSpacing: "-1px",
    margin: "24px 0",
    color: "#111111",
  },
  walletActions: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 10,
    marginTop: 20,
  },
  walletActionButton: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 7,
    background: "#FAF8F5",
    border: "1px solid #E0DAD3",
    borderRadius: 10,
    color: "#111111",
    padding: 14,
    textAlign: "left",
    cursor: "pointer",
  },
  walletActionIcon: {
    color: "#269900",
    fontSize: 24,
    fontWeight: 900,
  },
  walletForm: {
    borderTop: "1px solid #E0DAD3",
    marginTop: 24,
    paddingTop: 18,
  },
  walletFormTitle: {
    fontSize: 16,
    fontWeight: 900,
    color: "#111111",
  },
  walletHint: {
    color: "#77716B",
    fontSize: 12,
    lineHeight: 1.5,
  },
  transactionSection: {
    borderTop: "1px solid #E0DAD3",
    marginTop: 25,
    paddingTop: 20,
  },
  transactionTitle: {
    fontSize: 13,
    fontWeight: 900,
    letterSpacing: 1,
    marginBottom: 15,
    color: "#111111",
  },
  transactionRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    padding: "13px 0",
    borderBottom: "1px solid #EAE5DF",
    color: "#111111",
  },
  transactionAmount: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 5,
    whiteSpace: "nowrap",
  },
};
