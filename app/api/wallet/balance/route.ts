
import * as crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function verifyShopifyProxy(request: NextRequest): boolean {
  const params = request.nextUrl.searchParams;
  const signature = params.get("signature");

  const secrets = [
    process.env.SHOPIFY_API_SECRET,
    process.env.SHOPIFY_API_SECRET_OLD,
  ].filter((secret): secret is string => Boolean(secret));

  if (!signature || secrets.length === 0) return false;

  const grouped = new Map<string, string[]>();

  params.forEach((value, key) => {
    if (key === "signature") return;
    const values = grouped.get(key) || [];
    values.push(value);
    grouped.set(key, values);
  });

  const message = Array.from(grouped.entries())
    .map(([key, values]) => `${key}=${values.join(",")}`)
    .sort()
    .join("");

  if (!/^[a-f0-9]{64}$/i.test(signature)) return false;

  const supplied = Buffer.from(signature, "hex");

  for (const secret of secrets) {
    const calculated = crypto
      .createHmac("sha256", secret)
      .update(message)
      .digest("hex");

    const expected = Buffer.from(calculated, "hex");

    if (
      supplied.length === expected.length &&
      crypto.timingSafeEqual(supplied, expected)
    ) {
      return true;
    }
  }

  return false;
}

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;

    // Verify Shopify App Proxy signature.
    if (!verifyShopifyProxy(request)) {
      return NextResponse.json(
        { success: false, message: "Invalid Shopify signature" },
        { status: 401 }
      );
    }

    // Validate request timestamp.
    const timestamp = Number(params.get("timestamp"));

    if (
      !Number.isFinite(timestamp) ||
      Math.abs(Date.now() / 1000 - timestamp) > 300
    ) {
      return NextResponse.json(
        { success: false, message: "Invalid or expired request" },
        { status: 401 }
      );
    }

    // Validate Shopify store.
    const shop = params.get("shop");
    const configuredShop = process.env.SHOPIFY_SHOP;

    if (
      !shop ||
      !configuredShop ||
      shop.toLowerCase() !== configuredShop.toLowerCase()
    ) {
      return NextResponse.json(
        { success: false, message: "Invalid shop" },
        { status: 401 }
      );
    }

    // Shopify supplies the authenticated customer ID.
    const customerId = params.get("logged_in_customer_id");

    if (!customerId || !/^\d+$/.test(customerId)) {
      return NextResponse.json(
        { success: false, message: "Customer login required" },
        { status: 401 }
      );
    }

    const customerGid = `gid://shopify/Customer/${customerId}`;

    // Connect to Supabase.
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      throw new Error("Supabase settings are missing");
    }

    const baseUrl = supabaseUrl.replace(/\/$/, "");

    const headers = {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    };

    // Retrieve this customer's wallet balance.
    const accountResponse = await fetch(
      `${baseUrl}/rest/v1/wallet_accounts?customer_id=eq.${encodeURIComponent(customerGid)}&select=customer_id,balance_pence,currency`,
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
      balance_pence: 0,
      currency: "GBP",
    };

    // Retrieve this customer's latest 50 transactions.
    const transactionsResponse = await fetch(
      `${baseUrl}/rest/v1/wallet_transactions?customer_id=eq.${encodeURIComponent(customerGid)}&select=id,transaction_type,amount_pence,balance_after_pence,description,created_at&order=created_at.desc&limit=50`,
      {
        headers,
        cache: "no-store",
      }
    );

    if (!transactionsResponse.ok) {
      throw new Error("Could not retrieve wallet transactions");
    }

    const transactions = await transactionsResponse.json();

    return NextResponse.json(
      {
        success: true,
        balancePence: Number(account.balance_pence),
        currency: account.currency || "GBP",
        transactions,
      },
      {
        headers: {
          "Cache-Control": "no-store, private",
        },
      }
    );

  } catch (error) {
    console.error("Customer wallet API error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Unable to retrieve wallet information.",
      },
      { status: 500 }
    );
  }
}
