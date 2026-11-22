
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { verifyStaffSession } from "../../../../lib/staff-auth";

export const runtime = "nodejs";

type TransactionType = "credit" | "debit";

export async function POST(request: NextRequest) {
  try {
    // 1. Verify staff login.
    if (!verifyStaffSession(request)) {
      return NextResponse.json(
        { success: false, message: "Staff access required" },
        { status: 401 }
      );
    }

    // 2. Read and validate the request.
    const body = await request.json();

    const customerId = body.customerId;
    const transactionType = body.transactionType;
    const amount = body.amount;
    const description = body.description;

    if (
      typeof customerId !== "string" ||
      !/^gid:\/\/shopify\/Customer\/\d+$/.test(customerId)
    ) {
      return NextResponse.json(
        { success: false, message: "Invalid customer ID" },
        { status: 400 }
      );
    }

    if (
      transactionType !== "credit" &&
      transactionType !== "debit"
    ) {
      return NextResponse.json(
        { success: false, message: "Invalid transaction type" },
        { status: 400 }
      );
    }

    if (
      typeof amount !== "number" ||
      !Number.isFinite(amount) ||
      amount <= 0 ||
      Math.round(amount * 100) !== amount * 100 ||
      amount > 10000
    ) {
      return NextResponse.json(
        { success: false, message: "Enter a valid amount up to £10,000" },
        { status: 400 }
      );
    }

    const amountPence = Math.round(amount * 100);

    if (
      description !== undefined &&
      (typeof description !== "string" ||
        description.length > 200)
    ) {
      return NextResponse.json(
        { success: false, message: "Invalid transaction description" },
        { status: 400 }
      );
    }

    // 3. Validate that this Shopify customer exists.
    const shop = process.env.SHOPIFY_SHOP;
    const clientId = process.env.SHOPIFY_API_KEY;
    const clientSecret = process.env.SHOPIFY_API_SECRET;

    if (!shop || !clientId || !clientSecret) {
      throw new Error("Shopify settings are missing");
    }

    const tokenResponse = await fetch(
      `https://${shop}/admin/oauth/access_token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: "client_credentials",
        }),
        cache: "no-store",
      }
    );

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok || !tokenData.access_token) {
      throw new Error("Shopify authentication failed");
    }

    const customerResponse = await fetch(
      `https://${shop}/admin/api/2026-04/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": tokenData.access_token,
        },
        body: JSON.stringify({
          query: `
            query ValidateWalletCustomer($id: ID!) {
              customer(id: $id) {
                id
              }
            }
          `,
          variables: { id: customerId },
        }),
        cache: "no-store",
      }
    );

    const customerData = await customerResponse.json();

    if (
      !customerResponse.ok ||
      customerData.errors ||
      customerData.data?.customer?.id !== customerId
    ) {
      return NextResponse.json(
        { success: false, message: "Shopify customer not found" },
        { status: 404 }
      );
    }

    // 4. Connect to Supabase using the private server key.
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      throw new Error("Supabase settings are missing");
    }

    // 5. Create a unique transaction key.
    const idempotencyKey = randomUUID();

    // 6. Process balance change and transaction record atomically.
    const walletResponse = await fetch(
      `${supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/process_wallet_transaction`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          p_customer_id: customerId,
          p_transaction_type: transactionType,
          p_amount_pence: amountPence,
          p_description:
            description ||
            (transactionType === "credit"
              ? "Wallet top-up"
              : "Wallet purchase"),
          p_reference: `PH-${Date.now()}`,
          p_idempotency_key: idempotencyKey,
          p_created_by: "staff_portal",
        }),
        cache: "no-store",
      }
    );

    const walletData = await walletResponse.json();

    if (!walletResponse.ok) {
      const message = String(
        walletData.message || walletData.details || ""
      );

      if (message.includes("Insufficient wallet balance")) {
        return NextResponse.json(
          {
            success: false,
            message: "Insufficient wallet balance",
          },
          { status: 409 }
        );
      }

      console.error("Wallet transaction failed:", walletData);

      throw new Error("Unable to process wallet transaction");
    }

    // 7. Return the updated wallet balance.
    return NextResponse.json({
      success: true,
      transactionId: walletData.transaction_id,
      customerId,
      transactionType,
      amountPence,
      balancePence: walletData.balance_pence,
      currency: "GBP",
      message:
        transactionType === "credit"
          ? "Money successfully added to wallet."
          : "Wallet payment successfully processed.",
    });
  } catch (error) {
    console.error("Wallet transaction API error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Unable to process wallet transaction. Please try again.",
      },
      { status: 500 }
    );
  }
}
