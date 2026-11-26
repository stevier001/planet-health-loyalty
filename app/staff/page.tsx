
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
  const [walletSubmitting, setWalletSubmitting] = useState(false);

  // Prevent an old balance request overwriting a newer customer selection.
  const walletRequestNumber = useRef(0);

  // Reuse the same key when retrying an identical transaction.
  const pendingWalletRequest = useRef<{
    fingerprint: string;
    key: string;
  } | null>(null);

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

      setBalancePence(data.balancePence);
      setTransactions(data.transactions || []);
    } catch {
      if (requestNumber === walletRequestNumber.current) {
        setWalletError("Unable to connect to the wallet. Please try again.");
      }
    } finally {
      if (requestNumber === walletRequestNumber.current) {
        setWalletLoading(false);
      }
    }
  }

  // Automatically load wallet whenever a customer is selected
  useEffect(() => {
    if (!selected || !authenticated) {
      walletRequestNumber.current++;
      setBalancePence(null);
      setTransactions([]);
      setWalletLoading(false);
      setWalletError("");
      setWalletMessage("");
      setWalletMode(null);
      setWalletAmount("");
      setWalletDescription("");
      return;
    }

    setWalletMode(null);
    setWalletAmount("");
    setWalletDescription("");
    pendingWalletRequest.current = null;

    loadWallet(selected.id);
    // The selected customer ID is the intended trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, authenticated]);

  // QR camera scanner
  useEffect(() => {
    if (!scannerOpen || !authenticated) return;

    let scanner: any = null;
    let cancelled = false;

    async function startScanner() {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");

        if (cancelled) return;

        scanner = new Html5Qrcode("qr-reader");

        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1,
          },
          async (decodedText: string) => {
            if (cancelled) return;

            const qrNumber = decodedText.trim();

            if (!/^\d+$/.test(qrNumber)) {
              setScannerError(
                "This QR code doesn't contain a valid customer number."
              );
              return;
            }

            cancelled = true;

            try {
              if (scanner?.isScanning) {
                await scanner.stop();
              }
              scanner?.clear();
            } catch {
              // Scanner may already have stopped
            }

            setScannerOpen(false);
            setScannerError("");

            await searchCustomerTerm(qrNumber, true);
          },
          () => {
            // Ignore normal camera scanning misses
          }
        );
      } catch {
        if (!cancelled) {
          setScannerError(
            "Unable to access the camera. Please allow camera permission and try again."
          );
          setScannerOpen(false);
        }
      }
    }

    startScanner();

    return () => {
      cancelled = true;

      if (scanner) {
        const stopScanner = async () => {
          try {
            if (scanner.isScanning) {
              await scanner.stop();
            }
            scanner.clear();
          } catch {
            // Camera may already be stopped
          }
        };

        stopScanner();
      }
    };
  }, [scannerOpen, authenticated]);

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoginLoading(true);
    setError("");

    try {
      const response = await fetch("/api/staff-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        setError(data.message || "Incorrect PIN.");
        return;
      }

      setAuthenticated(true);
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
          console.error("QR scan tracking error:", scanError);
        }

        setMessage(
          "QR code scanned successfully. Select the customer below."
        );
      }
    } catch {
      setError("Unable to connect to Shopify.");
    } finally {
      setSearchLoading(false);
    }
  }

  async function searchCustomers(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await searchCustomerTerm(search);
  }

  // Add a stamp
  async function addStamp() {
    if (!selected || stampLoading || selected.stamps >= 6) return;

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
      "Confirm that this customer has received their reward? Their six stamps will be reset to zero."
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

    if (
      !selected ||
      walletSubmitting ||
      !walletMode ||
      balancePence === null
    ) {
      return;
    }

    const amount = Number(walletAmount);
    const amountPence = Math.round(amount * 100);

    if (
      !Number.isFinite(amount) ||
      amount <= 0 ||
      amountPence <= 0 ||
      Math.round(amount * 100) !== amount * 100 ||
      amount > 10000
    ) {
      setWalletError("Enter a valid amount up to £10,000, with up to 2 decimal places.");
      return;
    }

    if (walletMode === "debit" && amountPence > balancePence) {
      setWalletError("Insufficient wallet balance.");
      return;
    }

    const description =
      walletDescription.trim() ||
      (walletMode === "credit" ? "Wallet top-up" : "Wallet purchase");

    const actionLabel =
      walletMode === "credit" ? "add to" : "deduct from";

    const confirmed = window.confirm(
      `Confirm ${formatMoney(amountPence)} ${actionLabel} this customer's wallet?\n\nIMPORTANT: The cash or card payment must already have been completed through the till. This only records the wallet transaction.`
    );

    if (!confirmed) return;

    setWalletSubmitting(true);
    setWalletError("");
    setWalletMessage("");

    const fingerprint = [
      selected.id,
      walletMode,
      amountPence,
      description,
    ].join("|");

    if (
      !pendingWalletRequest.current ||
      pendingWalletRequest.current.fingerprint !== fingerprint
    ) {
      pendingWalletRequest.current = {
        fingerprint,
        key: crypto.randomUUID(),
      };
    }

    const idempotencyKey = pendingWalletRequest.current.key;

    try {
      const response = await fetch("/api/wallet/transaction", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          customerId: selected.id,
          transactionType: walletMode,
          amount,
          description,
          idempotencyKey,
        }),
      });

      const data = await response.json();

      if (response.status === 401) {
        setWalletError(
          "Wallet transaction access was denied. Your staff login is still active. Please try again."
        );
        return;
      }

      if (!response.ok || !data.success) {
        setWalletError(data.message || "Unable to process wallet transaction.");
        return;
      }

      // Only clear the key after the server confirms success.
      pendingWalletRequest.current = null;

      if (typeof data.balancePence === "number") {
        setBalancePence(data.balancePence);
      }

      setWalletAmount("");
      setWalletDescription("");
      setWalletMode(null);

      await loadWallet(selected.id);

      setWalletMessage(
        walletMode === "credit"
          ? "Money successfully added to the wallet."
          : "Wallet spending successfully recorded."
      );
    } catch {
      // Keep the same key so an identical retry cannot create a duplicate.
      setWalletError(
        "We couldn't confirm the transaction. Check the wallet balance and transaction history before trying again."
      );
    } finally {
      setWalletSubmitting(false);
    }
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
            PLANET HEALTH<span style={styles.green}>.</span>
          </div>

          <div style={styles.eyebrow}>LOYALTY REWARDS</div>

          <h1 style={styles.heading}>
            STAFF
            <br />
            <span style={styles.green}>ACCESS.</span>
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
              disabled={loginLoading || !pin}
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
              style={styles.scanButton}
            >
              ▦ &nbsp; SCAN CUSTOMER QR CODE
            </button>
          ) : (
            <>
              <div id="qr-reader" style={styles.qrReader} />

              <button
                onClick={() => setScannerOpen(false)}
                style={styles.cancelScan}
              >
                CLOSE CAMERA
              </button>
            </>
          )}

          {scannerError && (
            <p style={styles.error}>{scannerError}</p>
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
                  onClick={() => {
                    setSelected(customer);
                    setMessage("");
                    setError("");
                  }}
                  style={{
                    ...styles.customerButton,
                    background:
                      selected?.id === customer.id ? "#B4FF00" : "#fff",
                  }}
                >
                  <span>
                    <strong>
                      {customer.firstName} {customer.lastName}
                    </strong>
                    <span style={styles.customerEmail}>
                      {customer.email}
                    </span>
                  </span>

                  <strong>{customer.stamps}/6</strong>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* CUSTOMER LOYALTY CARD */}
        {selected && (
          <>
            <section style={styles.loyaltyCard}>
              <div style={styles.eyebrowGreen}>CUSTOMER LOYALTY CARD</div>

              <h2 style={styles.customerName}>
                {selected.firstName} {selected.lastName}
              </h2>

              <p style={styles.customerEmail}>{selected.email}</p>

              <h2 style={styles.sectionTitleWhite}>YOUR REWARDS</h2>

              <div style={styles.stampRow}>
                {[1, 2, 3, 4, 5, 6].map((number) => (
                  <div
                    key={number}
                    style={{
                      ...styles.stamp,
                      background:
                        number <= selected.stamps ? "#B4FF00" : "transparent",
                      color:
                        number <= selected.stamps ? "#111" : "#fff",
                    }}
                  >
                    {number <= selected.stamps ? "✓" : number}
                  </div>
                ))}
              </div>

              <div style={styles.stampCount}>
                {selected.stamps} / 6 STAMPS
              </div>

              {selected.stamps >= 6 ? (
                <div style={styles.reward}>
                  <strong>REWARD UNLOCKED!</strong>
                  <p>This customer has collected all 6 stamps.</p>

                  <button
                    onClick={redeemReward}
                    disabled={redeemLoading}
                    style={styles.redeemButton}
                  >
                    {redeemLoading
                      ? "REDEEMING REWARD..."
                      : "REDEEM REWARD ✓"}
                  </button>
                </div>
              ) : (
                <button
                  onClick={addStamp}
                  disabled={stampLoading}
                  style={styles.button}
                >
                  {stampLoading ? "SAVING STAMP..." : "ADD STAMP +"}
                </button>
              )}

              <p style={styles.cardNote}>
                Stamps are saved directly to the customer's Shopify record.
              </p>
            </section>

            {/* CUSTOMER WALLET */}
            <section style={styles.walletCard}>
              <div style={styles.walletHeader}>
                <div>
                  <div style={styles.walletEyebrow}>CUSTOMER WALLET</div>
                  <h2 style={styles.walletTitle}>AVAILABLE BALANCE</h2>
                </div>

                <span style={styles.walletTag}>SEPARATE FROM STAMPS</span>
              </div>

              {walletLoading ? (
                <div style={styles.walletLoading}>LOADING WALLET...</div>
              ) : balancePence !== null ? (
                <div style={styles.walletBalance}>
                  {formatMoney(balancePence)}
                </div>
              ) : (
                <div style={styles.walletLoading}>
                  WALLET BALANCE UNAVAILABLE
                </div>
              )}

              {walletError && (
                <p style={styles.walletError}>{walletError}</p>
              )}

              {walletMessage && (
                <p style={styles.walletSuccess}>{walletMessage}</p>
              )}

              <div style={styles.walletActions}>
                <button
                  type="button"
                  disabled={walletLoading || balancePence === null || walletSubmitting}
                  onClick={() => {
                    setWalletMode("credit");
                    setWalletAmount("");
                    setWalletDescription("");
                    setWalletError("");
                    setWalletMessage("");
                  }}
                  style={{
                    ...styles.walletAction,
                    ...(walletMode === "credit" ? styles.walletActionActive : {}),
                  }}
                >
                  <span style={styles.walletActionIcon}>⊕</span>
                  <strong>ADD MONEY</strong>
                  <span>Record a till top-up</span>
                </button>

                <button
                  type="button"
                  disabled={walletLoading || balancePence === null || walletSubmitting}
                  onClick={() => {
                    setWalletMode("debit");
                    setWalletAmount("");
                    setWalletDescription("");
                    setWalletError("");
                    setWalletMessage("");
                  }}
                  style={{
                    ...styles.walletAction,
                    ...(walletMode === "debit" ? styles.walletActionActive : {}),
                  }}
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
                    {walletMode === "credit" ? "ADD MONEY TO WALLET" : "SPEND FROM WALLET"}
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
                    type="text"
                    maxLength={200}
                    value={walletDescription}
                    onChange={(e) => setWalletDescription(e.target.value)}
                    placeholder={
                      walletMode === "credit"
                        ? "e.g. Wallet top-up"
                        : "e.g. Lunch purchase"
                    }
                    style={styles.input}
                  />

                  <button
                    type="submit"
                    disabled={walletSubmitting || !walletAmount || balancePence === null}
                    style={styles.button}
                  >
                    {walletSubmitting
                      ? "PROCESSING..."
                      : walletMode === "credit"
                        ? "CONFIRM TOP-UP →"
                        : "CONFIRM WALLET SPEND →"}
                  </button>

                  <button
                    type="button"
                    disabled={walletSubmitting}
                    onClick={() => {
                      setWalletMode(null);
                      setWalletAmount("");
                      setWalletDescription("");
                      setWalletError("");
                    }}
                    style={styles.walletCancel}
                  >
                    CANCEL
                  </button>
                </form>
              )}

              <div style={styles.transactionHeader}>
                <h3 style={styles.transactionTitle}>RECENT TRANSACTIONS</h3>

                <button
                  type="button"
                  disabled={walletLoading}
                  onClick={() => loadWallet(selected.id)}
                  style={styles.refreshButton}
                >
                  REFRESH ↻
                </button>
              </div>

              {walletLoading ? (
                <p style={styles.walletHint}>Loading transactions...</p>
              ) : transactions.length === 0 ? (
                <p style={styles.walletHint}>No wallet transactions yet.</p>
              ) : (
                <div>
                  {transactions.map((transaction) => (
                    <div key={transaction.id} style={styles.transactionRow}>
                      <div style={styles.transactionDetails}>
                        <strong>
                          {transaction.description ||
                            (transaction.transaction_type === "credit"
                              ? "Wallet top-up"
                              : "Wallet purchase")}
                        </strong>
                        <span>
                          {new Date(transaction.created_at).toLocaleString(
                            "en-GB",
                            {
                              dateStyle: "medium",
                              timeStyle: "short",
                            }
                          )}
                        </span>
                      </div>

                      <strong
                        style={{
                          color:
                            transaction.transaction_type === "credit"
                              ? "#087A32"
                              : "#111",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {transaction.transaction_type === "credit" ? "+" : "−"}
                        {formatMoney(transaction.amount_pence)}
                      </strong>
                    </div>
                  ))}
                </div>
              )}

              <p style={styles.walletFootnote}>
                Wallet credit is separate from loyalty stamps. All cash or card
                payments must be completed through the till first.
              </p>
            </section>
          </>
        )}

        <footer style={styles.footer}>
          PLANET HEALTH · LOYALTY REWARDS
        </footer>
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
    padding: "35px 18px",
    boxSizing: "border-box",
  },
  card: {
    width: "100%",
    maxWidth: "460px",
    alignSelf: "center",
    background: "#fff",
    border: "2px solid #111",
    borderRadius: "22px",
    padding: "30px",
    boxSizing: "border-box",
  },
  dashboard: {
    width: "100%",
    maxWidth: "760px",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 15,
    flexWrap: "wrap",
    marginBottom: 45,
  },
  logo: {
    fontSize: "23px",
    fontWeight: 900,
    letterSpacing: "-1px",
  },
  green: { color: "#45e017" },
  eyebrow: {
    marginTop: "12px",
    fontSize: "11px",
    fontWeight: 900,
    letterSpacing: "2px",
  },
  eyebrowGreen: {
    color: "#B4FF00",
    fontSize: "12px",
    fontWeight: 900,
    letterSpacing: "2px",
  },
  heading: {
    fontSize: "clamp(38px, 8vw, 58px)",
    lineHeight: 1,
    margin: "15px 0",
    fontWeight: 900,
  },
  description: {
    color: "#666",
    fontSize: "15px",
    lineHeight: 1.6,
    marginBottom: "25px",
  },
  section: {
    background: "#fff",
    border: "2px solid #111",
    borderRadius: "18px",
    padding: "25px",
    marginBottom: "22px",
  },
  scannerSection: {
    background: "#fff",
    border: "2px solid #111",
    borderRadius: "18px",
    padding: "25px",
    marginBottom: "22px",
  },
  scannerHeading: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  scannerTitle: {
    fontSize: "25px",
    fontWeight: 900,
    margin: "10px 0",
  },
  scannerIcon: {
    fontSize: "42px",
    fontWeight: 900,
    color: "#111",
  },
  scanButton: {
    width: "100%",
    padding: "20px",
    background: "#B4FF00",
    color: "#111",
    border: "2px solid #111",
    borderRadius: "10px",
    fontWeight: 900,
    fontSize: "15px",
    cursor: "pointer",
    marginTop: "12px",
  },
  qrReader: {
    width: "100%",
    marginTop: "18px",
    overflow: "hidden",
    borderRadius: "12px",
  },
  cancelScan: {
    width: "100%",
    padding: "15px",
    background: "#fff",
    color: "#111",
    border: "2px solid #111",
    borderRadius: "10px",
    fontWeight: 900,
    cursor: "pointer",
    marginTop: "12px",
  },
  sectionTitle: {
    fontSize: "19px",
    fontWeight: 900,
    marginTop: 0,
  },
  sectionTitleWhite: {
    fontSize: "20px",
    fontWeight: 900,
    marginTop: 30,
    color: "#fff",
  },
  smallText: {
    fontSize: "13px",
    color: "#666",
    lineHeight: 1.6,
  },
  label: {
    display: "block",
    fontSize: "11px",
    fontWeight: 900,
    marginBottom: "9px",
    letterSpacing: "1px",
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    padding: "17px",
    border: "2px solid #111",
    borderRadius: "10px",
    fontSize: "16px",
    marginTop: "10px",
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
    marginTop: "10px",
  },
  redeemButton: {
    width: "100%",
    padding: "16px",
    background: "#111",
    color: "#B4FF00",
    border: "2px solid #111",
    borderRadius: "10px",
    fontWeight: 900,
    fontSize: "14px",
    cursor: "pointer",
    marginTop: "15px",
  },
  logout: {
    padding: "12px 18px",
    background: "#fff",
    border: "2px solid #111",
    borderRadius: "10px",
    fontWeight: 900,
    cursor: "pointer",
  },
  customerButton: {
    width: "100%",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    textAlign: "left",
    padding: "15px",
    border: "1px solid #111",
    borderRadius: "10px",
    marginTop: "9px",
    cursor: "pointer",
    color: "#111",
  },
  customerEmail: {
    display: "block",
    fontSize: "12px",
    color: "#999",
    marginTop: "5px",
    overflowWrap: "anywhere",
  },
  loyaltyCard: {
    background: "#111",
    color: "#fff",
    borderRadius: "18px",
    padding: "25px",
    marginBottom: "22px",
    boxSizing: "border-box",
    width: "100%",
    minWidth: 0,
  },
  customerName: {
    fontSize: "25px",
    marginBottom: "5px",
  },
  stampRow: {
    display: "grid",
    gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "6px",
    margin: "25px 0",
    width: "100%",
    minWidth: 0,
    boxSizing: "border-box",
  },
  stamp: {
    width: "100%",
    height: "auto",
    minWidth: 0,
    minHeight: 0,
    maxWidth: "none",
    maxHeight: "none",
    boxSizing: "border-box",
    aspectRatio: "1 / 1",
    border: "2px solid #B4FF00",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 900,
    fontSize: "clamp(12px, 4vw, 17px)",
    lineHeight: 1,
    padding: 0,
    margin: 0,
  },
  stampCount: {
    color: "#B4FF00",
    fontWeight: 900,
    marginBottom: "15px",
  },
  reward: {
    background: "#B4FF00",
    color: "#111",
    padding: "18px",
    borderRadius: "10px",
    marginTop: "15px",
  },
  cardNote: {
    color: "#aaa",
    fontSize: "11px",
    marginTop: "18px",
    lineHeight: 1.5,
  },
  error: {
    color: "#c22",
    fontSize: "13px",
    fontWeight: 700,
  },
  message: {
    color: "#257b16",
    fontSize: "13px",
    fontWeight: 700,
  },
  footer: {
    textAlign: "center",
    marginTop: "30px",
    fontSize: "10px",
    letterSpacing: "1.5px",
    color: "#888",
  },

  // Wallet styling
  walletCard: {
    background: "#fff",
    color: "#111",
    border: "2px solid #111",
    borderRadius: "18px",
    padding: "25px",
    marginBottom: "22px",
    boxSizing: "border-box",
    width: "100%",
  },
  walletHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "12px",
  },
  walletEyebrow: {
    fontSize: "12px",
    fontWeight: 900,
    letterSpacing: "1px",
  },
  walletTitle: {
    fontSize: "11px",
    color: "#777",
    fontWeight: 700,
    marginTop: "15px",
    marginBottom: "8px",
  },
  walletTag: {
    background: "#dff5df",
    color: "#087A32",
    borderRadius: "20px",
    padding: "5px 10px",
    fontSize: "10px",
    fontWeight: 900,
  },
  walletBalance: {
    fontSize: "32px",
    fontWeight: 900,
    color: "#087A32",
    margin: "5px 0 22px",
  },
  walletLoading: {
    fontSize: "13px",
    color: "#777",
    margin: "15px 0 22px",
  },
  walletActions: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "12px",
    marginTop: "15px",
    marginBottom: "22px",
  },
  walletAction: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: "7px",
    padding: "15px 12px",
    background: "#fff",
    color: "#111",
    border: "1px solid #ddd",
    borderRadius: "10px",
    textAlign: "left",
    cursor: "pointer",
    minWidth: 0,
  },
  walletActionActive: {
    border: "2px solid #111",
    background: "#f3ffd6",
  },
  walletActionIcon: {
    fontSize: "24px",
    lineHeight: 1,
  },
  walletForm: {
    background: "#f7f7f7",
    border: "1px solid #ddd",
    borderRadius: "12px",
    padding: "18px",
    marginBottom: "24px",
  },
  walletFormTitle: {
    fontSize: "16px",
    fontWeight: 900,
    marginTop: 0,
  },
  walletHint: {
    fontSize: "12px",
    color: "#777",
    lineHeight: 1.5,
  },
  walletCancel: {
    width: "100%",
    padding: "14px",
    background: "#fff",
    color: "#111",
    border: "1px solid #111",
    borderRadius: "10px",
    fontWeight: 900,
    cursor: "pointer",
    marginTop: "10px",
  },
  walletError: {
    background: "#fff0f0",
    color: "#b00020",
    padding: "10px",
    borderRadius: "8px",
    fontSize: "13px",
    fontWeight: 700,
  },
  walletSuccess: {
    background: "#eaf8e9",
    color: "#087A32",
    padding: "10px",
    borderRadius: "8px",
    fontSize: "13px",
    fontWeight: 700,
  },
  transactionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "10px",
    marginTop: "20px",
    marginBottom: "12px",
  },
  transactionTitle: {
    fontSize: "16px",
    fontWeight: 900,
    margin: 0,
  },
  refreshButton: {
    background: "#fff",
    border: "1px solid #111",
    borderRadius: "7px",
    padding: "7px 10px",
    fontSize: "10px",
    fontWeight: 900,
    cursor: "pointer",
  },
  transactionRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
    padding: "14px 0",
    borderTop: "1px solid #eee",
    fontSize: "13px",
  },
  transactionDetails: {
    display: "flex",
    flexDirection: "column",
    gap: "5px",
    minWidth: 0,
  },
  walletFootnote: {
    color: "#888",
    fontSize: "11px",
    lineHeight: 1.5,
    marginTop: "18px",
    marginBottom: 0,
  },
};
