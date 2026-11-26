
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
