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
