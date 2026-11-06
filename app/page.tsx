"use client";

import { useState } from "react";

export default function Page() {
  const [search, setSearch] = useState("");
  const [stamps, setStamps] = useState(3);
  const [selected, setSelected] = useState(false);

  return (
    <main style={{
      minHeight: "100vh",
      background: "#F0EBE6",
      color: "#111",
      fontFamily: "Arial, sans-serif",
      padding: "30px 20px"
    }}>
      <div style={{ maxWidth: "900px", margin: "auto" }}>

        <header style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "15px",
          marginBottom: "45px"
        }}>
          <div>
            <div style={{ fontSize: "25px", fontWeight: 900 }}>
              PLANET HEALTH<span style={{ color: "#45e017" }}>.</span>
            </div>
            <div style={{ fontSize: "12px", letterSpacing: "2px" }}>
              LOYALTY CONTROL PANEL
            </div>
          </div>
          <div style={{
            background: "#B4FF00",
            padding: "10px 16px",
            borderRadius: "30px",
            fontSize: "12px",
            fontWeight: 800
          }}>
            STAFF DASHBOARD
          </div>
        </header>

        <section style={{ marginBottom: "30px" }}>
          <div style={{ fontSize: "13px", fontWeight: 700 }}>
            WELCOME TO THE LOYALTY HUB
          </div>
          <h1 style={{
            fontSize: "clamp(32px, 6vw, 52px)",
            lineHeight: 1,
            margin: "12px 0"
          }}>
            GOOD FOOD.<br />
            <span style={{ color: "#45e017" }}>GOOD REWARDS.</span>
          </h1>
          <p style={{ color: "#555", fontSize: "15px" }}>
            Find customers, manage stamps and reward loyalty.
          </p>
        </section>

        <section style={{
          background: "#fff",
          border: "2px solid #111",
          borderRadius: "20px",
          padding: "25px",
          marginBottom: "20px"
        }}>
          <h2 style={{ marginTop: 0 }}>FIND A CUSTOMER</h2>
          <p style={{ color: "#666", fontSize: "14px" }}>
            Search using a customer name, email or ID.
          </p>

          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setSelected(false);
            }}
            placeholder="Enter customer details..."
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "17px",
              border: "2px solid #111",
              borderRadius: "10px",
              fontSize: "16px",
              marginTop: "10px"
            }}
          />

          <button
            onClick={() => setSelected(true)}
            style={{
              width: "100%",
              marginTop: "12px",
              padding: "17px",
              background: "#B4FF00",
              border: "2px solid #111",
              borderRadius: "10px",
              fontWeight: 900,
              fontSize: "15px",
              cursor: "pointer"
            }}
          >
            SEARCH CUSTOMERS →
          </button>

          {selected && (
            <p style={{ fontSize: "13px", color: "#a33" }}>
              Customer lookup will be connected to Shopify in the next stage.
            </p>
          )}
        </section>

        <section style={{
          background: "#111",
          color: "#fff",
          borderRadius: "20px",
          padding: "25px",
          marginBottom: "20px"
        }}>
          <div style={{ color: "#B4FF00", fontWeight: 800, fontSize: "12px" }}>
            LOYALTY CARD PREVIEW
          </div>

          <h2 style={{ fontSize: "27px" }}>YOUR REWARDS</h2>
          <p style={{ color: "#ccc", fontSize: "14px" }}>
            Example customer loyalty card
          </p>

          <div style={{
            display: "flex",
            gap: "12px",
            flexWrap: "wrap",
            margin: "25px 0"
          }}>
            {[1, 2, 3, 4, 5].map((number) => (
              <div key={number} style={{
                width: "48px",
                height: "48px",
                borderRadius: "50%",
                border: "2px solid #B4FF00",
                background: number <= stamps ? "#B4FF00" : "transparent",
                color: number <= stamps ? "#111" : "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 900,
                fontSize: "18px"
              }}>
                {number <= stamps ? "✓" : number}
              </div>
            ))}
          </div>

          <div style={{ color: "#B4FF00", fontWeight: 800 }}>
            {stamps} / 5 STAMPS
          </div>

          <button
            onClick={() => setStamps((current) => Math.min(5, current + 1))}
            disabled={stamps >= 5}
            style={{
              width: "100%",
              marginTop: "22px",
              padding: "17px",
              background: stamps >= 5 ? "#777" : "#B4FF00",
              color: "#111",
              border: 0,
              borderRadius: "10px",
              fontWeight: 900,
              fontSize: "15px",
              cursor: stamps >= 5 ? "not-allowed" : "pointer"
            }}
          >
            {stamps >= 5 ? "REWARD UNLOCKED" : "DEMO: ADD A STAMP"}
          </button>
          <p style={{ fontSize: "11px", color: "#aaa" }}>
            Demonstration only. Changes are not saved to Shopify.
          </p>
        </section>

        <footer style={{
          textAlign: "center",
          padding: "25px",
          fontSize: "11px",
          letterSpacing: "2px",
          color: "#777"
        }}>
          PLANET HEALTH · LOYALTY REWARDS
        </footer>

      </div>
    </main>
  );
}
