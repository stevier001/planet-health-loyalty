
"use client";

import { useEffect, useState } from "react";

type Customer = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  stamps: number;
};

export default function StaffPage() {
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
  const [message, setMessage] = useState("");

  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerError, setScannerError] = useState("");

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

            // Our customer QR codes should contain a numeric ID
            if (!/^\d+$/.test(qrNumber)) {
              setScannerError("This QR code doesn't contain a valid customer number.");
              return;
            }

            // Stop the camera and close the scanner
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

            // Automatically search for the customer
            await searchCustomerTerm(qrNumber);
          },
          () => {
            // Ignore normal camera scanning misses
          }
        );
      } catch (err) {
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
    }
  }

  // Shared customer search for manual searches and QR scans
  async function searchCustomerTerm(term: string) {
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
      } else if (/^\d+$/.test(term.trim())) {
        setMessage("QR code scanned successfully. Select the customer below.");
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
            Find a customer, view their loyalty card and add a stamp.
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
  },
  customerName: {
    fontSize: "25px",
    marginBottom: "5px",
  },
  stampRow: {
    display: "grid",
    gridTemplateColumns: "repeat(6, 56px)",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "4px",
    margin: "25px 0",
    width: "100%",
  },
  stamp: {
    width: "56px",
    height: "56px",
    minWidth: "56px",
    minHeight: "56px",
    maxWidth: "56px",
    maxHeight: "56px",
    flex: "0 0 56px",
    boxSizing: "border-box",
    border: "2px solid #B4FF00",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 900,
    fontSize: "17px",
    lineHeight: 1,
    padding: 0,
    margin: 0,
    aspectRatio: "1 / 1",
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
};
