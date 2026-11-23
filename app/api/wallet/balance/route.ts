
import { NextRequest, NextResponse } from "next/server";
import { verifyStaffSession } from "../../../../lib/staff-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    // 1. Verify staff login.
    if (!verifyStaffSession(request)) {
      return NextResponse.json(
        { success: false, message: "Staff access required" },
        { status: 401 }
      );
    }

    // 2. Read customer ID.
    const customerId = request.nextUrl.searchParams.get("customerId");

    if (
      !customerId ||
      !/^gid:\/\/shopify\/Customer\/\d+$/.test(customerId)
    ) {
      return NextResponse.json(
        { success: false, message: "Invalid customer ID" },
        { status: 400 }
      );
    }

    // 3. Connect to Supabase.
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      throw new Error("Supabase settings are missing");
    }

    const headers = {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    };

    // 4. Get the customer's wallet balance.
    const accountResponse = await fetch(
      `${supabaseUrl.replace(/\/$/, "")}/rest/v1/wallet_accounts?customer_id=eq.${encodeURIComponent(customerId)}&select=customer_id,balance_pence,currency,created_at,updated_at`,
      {
        headers,
        cache: "no-store",
      }
    );

    if (!accountResponse.ok) {
      throw new Error("Could not retrieve wallet account");
    }

    const accounts = await accountResponse.json();
    const account = accounts[0] || {
      customer_id: customerId,
      balance_pence: 0,
      currency: "GBP",
    };

    // 5. Get the customer's latest 50 transactions.
    const transactionsResponse = await fetch(
      `${supabaseUrl.replace(/\/$/, "")}/rest/v1/wallet_transactions?customer_id=eq.${encodeURIComponent(customerId)}&select=id,transaction_type,amount_pence,balance_after_pence,description,reference,created_at&order=created_at.desc&limit=50`,
      {
        headers,
        cache: "no-store",
      }
    );

    if (!transactionsResponse.ok) {
      throw new Error("Could not retrieve wallet transactions");
    }

    const transactions = await transactionsResponse.json();

    // 6. Return wallet information.
    return NextResponse.json({
      success: true,
      customerId,
      balancePence: Number(account.balance_pence),
      currency: account.currency || "GBP",
      transactions,
    });
  } catch (error) {
    console.error("Wallet balance API error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Unable to retrieve wallet information.",
      },
      { status: 500 }
    );
  }
}
