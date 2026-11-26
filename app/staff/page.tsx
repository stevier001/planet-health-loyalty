
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

    setWalletTransactionLoading(true);
    setWalletError("");
    setWalletMessage("");

    try {
      const response = await fetch("/api/wallet/transaction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: selected.id,
          type: walletMode,
          amount,
          description: walletDescription.trim() || undefined,
        }),
      });

      const data = await response.json();

      if (response.status === 401) {
        setAuthenticated(false);
        setWalletError("Your staff session has expired. Please log in again.");
        return;
      }

      if (!response.ok || !data.success) {
        setWalletError(data.message || "Unable to process transaction.");
        return;
      }

      setWalletMessage(
        data.message ||
          (walletMode === "credit"
            ? "Wallet successfully credited."
            : "Wallet successfully debited.")
      );

      setWalletAmount("");
      setWalletDescription("");
      setWalletMode(null);

      await loadWallet(selected.id);
    } catch {
      setWalletError("Unable to process transaction. Please try again.");
    } finally {
      setWalletTransactionLoading(false);
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
            if (cancelled) return;

            await scanner.stop();
            setScannerOpen(false);

            const customerTerm = decodedText.trim();

            if (customerTerm) {
              await searchCustomerTerm(customerTerm, true);
            }
          },
          () => {}
        );
      } catch (error) {
        console.error("Scanner error:", error);
        setScannerError(
          "Unable to access the camera. Please check camera permissions."
        );
      }
    }

    startScanner();

    return () => {
      cancelled = true;

      if (scanner) {
        scanner
          .stop()
          .catch(() => {})
          .finally(() => {
            scanner.clear().catch(() => {});
          });
      }
    };
  }, [scannerOpen, authenticated]);

  function closeScanner() {
    setScannerOpen(false);
    setScannerError("");
  }

  if (checking) {
    return (
      <main style={styles.page}>
        <div style={styles.loginCard}>
          <div style={styles.logo}>
            PLANET HEALTH<span style={styles.green}>.</span>
          </div>
          <p style={styles.description}>CHECKING STAFF ACCESS...</p>
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
            Enter your personal staff ID and PIN to access the loyalty control panel.
          </p>

          <form onSubmit={handleLogin}>
            <label style={styles.label}>STAFF ID</label>

            <input
              type="text"
              inputMode="numeric"
              autoComplete="username"
              value={staffId}
              onChange={(e) =>
                setStaffId(e.target.value.replace(/\D/g, "").slice(0, 4))
              }
              placeholder="Enter your staff ID"
              maxLength={4}
              required
              style={styles.input}
            />

            <label style={styles.label}>PERSONAL PIN</label>

            <input
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              value={pin}
              onChange={(e) =>
                setPin(e.target.value.replace(/\D/g, "").slice(0, 8))
              }
              placeholder="Enter your PIN"
              maxLength={8}
              required
              style={styles.input}
            />

            {error && <p style={styles.error}>{error}</p>}

            <button
              type="submit"
              disabled={loginLoading || staffId.length !== 4 || pin.length < 4}
              style={styles.button}
            >
              {loginLoading ? "CHECKING..." : "ACCESS STAFF PORTAL →"}
            </button>
          </form>

          <div style={styles.footer}>PLANET HEALTH · STAFF ONLY</div>
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
            <div style={styles.eyebrow}>LOYALTY CONTROL PANEL</div>
          </div>

          <button onClick={handleLogout} style={styles.logout}>
            LOG OUT
          </button>
        </header>

        <section style={{ marginBottom: 28 }}>
          <div style={styles.eyebrow}>WELCOME TO THE LOYALTY HUB</div>

          <h1 style={styles.heading}>
            GOOD FOOD.
            <br />
            <span style={styles.green}>GOOD REWARDS.</span>
          </h1>

          <p style={styles.description}>
            Find a customer, view their loyalty card and manage their wallet.
          </p>
        </section>

        {/* QR CODE SCANNER */}
        <section style={styles.scannerSection}>
          <div style={styles.scannerHeading}>
            <div>
              <div style={styles.eyebrow}>QUICK CUSTOMER LOOKUP</div>
              <h2 style={styles.scannerTitle}>SCAN QR CODE</h2>
            </div>
            <div style={styles.scannerIcon}>▦</div>
          </div>

          <p style={styles.smallText}>
            Scan the QR code on a customer's loyalty card to find their account.
          </p>

          {!scannerOpen ? (
            <button
              onClick={() => {
                setScannerError("");
                setError("");
                setMessage("");
                setScannerOpen(true);
              }}
              style={styles.button}
            >
              OPEN CAMERA SCANNER →
            </button>
          ) : (
            <div style={styles.scannerBox}>
              <div id="staff-qr-reader" ref={scannerRef} />

              {scannerError && (
                <p style={styles.error}>{scannerError}</p>
              )}

              <button onClick={closeScanner} style={styles.secondaryButton}>
                CLOSE SCANNER
              </button>
            </div>
          )}
        </section>

        {/* MANUAL CUSTOMER SEARCH */}
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>FIND A CUSTOMER</h2>

          <p style={styles.smallText}>
            Search by customer name, email address or QR code number.
          </p>

          <form onSubmit={searchCustomers}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Enter name, email or QR number..."
              style={styles.input}
            />

            <button
              type="submit"
              disabled={searchLoading || search.trim().length < 2}
              style={styles.button}
            >
              {searchLoading ? "SEARCHING SHOPIFY..." : "SEARCH CUSTOMERS →"}
            </button>
          </form>

          {error && <p style={styles.error}>{error}</p>}
          {message && <p style={styles.message}>{message}</p>}

          {customers.length > 0 && (
            <div style={{ marginTop: 22 }}>
              <div style={styles.label}>SEARCH RESULTS</div>

              {customers.map((customer) => (
                <button
                  key={customer.id}
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
            <div style={styles.eyebrow}>CUSTOMER ACCOUNT</div>

            <h2 style={styles.sectionTitle}>
              {selected.firstName} {selected.lastName}
            </h2>

            <p style={styles.smallText}>{selected.email}</p>

            <div style={styles.stampCard}>
              <div style={styles.eyebrow}>LOYALTY CARD</div>

              <div style={styles.stampCount}>
                {selected.stamps}
                <span>/ 6</span>
              </div>

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
                    {index < selected.stamps ? "✓" : ""}
                  </div>
                ))}
              </div>

              <p style={styles.smallText}>
                {selected.stamps >= 6
                  ? "REWARD READY TO REDEEM"
                  : `${6 - selected.stamps} more stamps until a reward`}
              </p>
            </div>

            <div style={styles.actionGrid}>
              <button
                onClick={addStamp}
                disabled={stampLoading || selected.stamps >= 6}
                style={styles.actionButton}
              >
                {stampLoading ? "ADDING..." : "＋ ADD STAMP"}
              </button>

              <button
                onClick={redeemReward}
                disabled={redeemLoading || selected.stamps < 6}
                style={styles.actionButton}
              >
                {redeemLoading ? "REDEEMING..." : "✓ REDEEM REWARD"}
              </button>
            </div>

            {error && <p style={styles.error}>{error}</p>}
            {message && <p style={styles.message}>{message}</p>}

            {/* WALLET */}
            <div style={styles.walletCard}>
              <div style={styles.walletHeader}>
                <div>
                  <div style={styles.eyebrow}>PLANET HEALTH</div>
                  <h3 style={styles.walletTitle}>CUSTOMER WALLET</h3>
                </div>
                <div style={styles.walletIcon}>£</div>
              </div>

              {walletLoading ? (
                <p style={styles.smallText}>LOADING WALLET...</p>
              ) : (
                <div style={styles.walletBalance}>
                  {balancePence === null
                    ? "—"
                    : formatMoney(balancePence)}
                </div>
              )}

              {walletError && (
                <p style={styles.error}>{walletError}</p>
              )}

              {walletMessage && (
                <p style={styles.message}>{walletMessage}</p>
              )}

              <div style={styles.walletActions}>
                <button
                  onClick={() => {
                    setWalletMode("credit");
                    setWalletError("");
                    setWalletMessage("");
                  }}
                  style={styles.walletActionButton}
                >
                  <span style={styles.walletActionIcon}>＋</span>
                  <strong>ADD MONEY</strong>
                  <span>Credit customer wallet</span>
                </button>

                <button
                  onClick={() => {
                    setWalletMode("debit");
                    setWalletError("");
                    setWalletMessage("");
                  }}
                  style={styles.walletActionButton}
                >
                  <span style={styles.walletActionIcon}>▣</span>
                  <strong>SPEND MONEY</strong>
                  <span>Deduct a purchase</span>
                </button>
              </div>

              {walletMode && (
                <form
                  onSubmit={processWalletTransaction}
                  style={styles.walletForm}
                >
                  <h3 style={styles.walletFormTitle}>
                    {walletMode === "credit"
                      ? "ADD MONEY TO WALLET"
                      : "SPEND FROM WALLET"}
                  </h3>

                  <p style={styles.walletHint}>
                    {walletMode === "credit"
                      ? "Record money already received through the till."
                      : "Record a purchase already paid for through the till."}
                  </p>

                  <label style={styles.label}>AMOUNT (£)</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0.01"
                    max="10000"
                    step="0.01"
                    required
                    value={walletAmount}
                    onChange={(e) => setWalletAmount(e.target.value)}
                    placeholder="0.00"
                    style={styles.input}
                  />

                  <label style={styles.label}>DESCRIPTION (OPTIONAL)</label>
                  <input
                    value={walletDescription}
                    onChange={(e) => setWalletDescription(e.target.value)}
                    placeholder="e.g. Till top-up or lunch"
                    style={styles.input}
                  />

                  {walletError && (
                    <p style={styles.error}>{walletError}</p>
                  )}

                  <button
                    type="submit"
                    disabled={walletTransactionLoading}
                    style={styles.button}
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
                                ? "#45e017"
                                : "#ffffff",
                          }}
                        >
                          {transaction.transaction_type === "credit"
                            ? "+"
                            : "-"}
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
    background: "#101010",
    color: "#ffffff",
    padding: "24px 16px",
    fontFamily: "Arial, Helvetica, sans-serif",
  },
  loginCard: {
    width: "100%",
    maxWidth: 420,
    margin: "60px auto",
    padding: 32,
    background: "#191919",
    border: "1px solid #333333",
    borderRadius: 18,
    boxSizing: "border-box",
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
  },
  green: {
    color: "#45e017",
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: 2,
    color: "#45e017",
    marginBottom: 10,
  },
  heading: {
    fontSize: "clamp(38px, 8vw, 64px)",
    fontWeight: 900,
    lineHeight: 0.95,
    letterSpacing: "-3px",
    margin: "18px 0",
  },
  description: {
    color: "#aaaaaa",
    fontSize: 14,
    lineHeight: 1.6,
    marginBottom: 28,
  },
  label: {
    display: "block",
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: 1.5,
    color: "#aaaaaa",
    margin: "18px 0 8px",
  },
  input: {
    display: "block",
    width: "100%",
    boxSizing: "border-box",
    background: "#101010",
    border: "1px solid #444444",
    borderRadius: 9,
    color: "#ffffff",
    padding: "15px 14px",
    fontSize: 16,
    outline: "none",
    marginBottom: 14,
  },
  button: {
    display: "block",
    width: "100%",
    background: "#45e017",
    color: "#101010",
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
    background: "transparent",
    color: "#ffffff",
    border: "1px solid #555555",
    borderRadius: 9,
    padding: "13px",
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: 1,
    cursor: "pointer",
    marginTop: 12,
  },
  error: {
    color: "#ff6868",
    fontSize: 13,
    lineHeight: 1.5,
  },
  message: {
    color: "#45e017",
    fontSize: 13,
    lineHeight: 1.5,
  },
  footer: {
    textAlign: "center",
    color: "#666666",
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
    background: "transparent",
    border: "1px solid #555555",
    color: "#ffffff",
    padding: "11px 16px",
    borderRadius: 8,
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: 1,
    cursor: "pointer",
  },
  section: {
    background: "#191919",
    border: "1px solid #333333",
    borderRadius: 16,
    padding: 22,
    marginBottom: 22,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: 900,
    letterSpacing: "-0.5px",
    margin: "8px 0",
  },
  smallText: {
    color: "#999999",
    fontSize: 12,
    lineHeight: 1.6,
  },
  scannerSection: {
    background: "#191919",
    border: "1px solid #333333",
    borderRadius: 16,
    padding: 22,
    marginBottom: 22,
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
  },
  scannerIcon: {
    fontSize: 34,
    color: "#45e017",
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
    background: "#101010",
    border: "1px solid #333333",
    borderRadius: 10,
    padding: 15,
    color: "#ffffff",
    textAlign: "left",
    marginTop: 9,
    cursor: "pointer",
  },
  customerButtonSelected: {
    border: "1px solid #45e017",
  },
  customerStamps: {
    color: "#45e017",
    fontWeight: 900,
    fontSize: 14,
  },
  stampCard: {
    background: "#101010",
    border: "1px solid #333333",
    borderRadius: 14,
    padding: 20,
    marginTop: 22,
    textAlign: "center",
  },
  stampCount: {
    fontSize: 46,
    fontWeight: 900,
    margin: "12px 0",
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
    border: "1px solid #555555",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 18,
    fontWeight: 900,
    boxSizing: "border-box",
  },
  stampCircleActive: {
    background: "#45e017",
    borderColor: "#45e017",
    color: "#101010",
  },
  actionGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 10,
    marginTop: 16,
  },
  actionButton: {
    background: "#222222",
    color: "#45e017",
    border: "1px solid #45e017",
    borderRadius: 9,
    padding: 14,
    fontSize: 11,
    fontWeight: 900,
    cursor: "pointer",
  },
  walletCard: {
    background: "#101010",
    border: "1px solid #333333",
    borderRadius: 14,
    padding: 20,
    marginTop: 25,
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
  },
  walletIcon: {
    width: 42,
    height: 42,
    borderRadius: "50%",
    background: "#45e017",
    color: "#101010",
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
    background: "#191919",
    border: "1px solid #444444",
    borderRadius: 10,
    color: "#ffffff",
    padding: 14,
    textAlign: "left",
    cursor: "pointer",
  },
  walletActionIcon: {
    color: "#45e017",
    fontSize: 24,
    fontWeight: 900,
  },
  walletForm: {
    borderTop: "1px solid #333333",
    marginTop: 24,
    paddingTop: 18,
  },
  walletFormTitle: {
    fontSize: 16,
    fontWeight: 900,
  },
  walletHint: {
    color: "#999999",
    fontSize: 12,
    lineHeight: 1.5,
  },
  transactionSection: {
    borderTop: "1px solid #333333",
    marginTop: 25,
    paddingTop: 20,
  },
  transactionTitle: {
    fontSize: 13,
    fontWeight: 900,
    letterSpacing: 1,
    marginBottom: 15,
  },
  transactionRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    padding: "13px 0",
    borderBottom: "1px solid #292929",
  },
  transactionAmount: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 5,
    whiteSpace: "nowrap",
  },
};
