
import * as crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function verifyShopifyProxy(request: NextRequest): boolean {
  const params = new URL(request.url).searchParams;
  const signature = params.get("signature");

  const secrets = [
    process.env.SHOPIFY_API_SECRET,
    process.env.SHOPIFY_API_SECRET_OLD,
  ].filter((secret): secret is string => Boolean(secret));

  if (!signature || secrets.length === 0) {
    console.error("LOYALTY AUTH: Missing signature or secrets");
    return false;
  }

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

  if (!/^[a-f0-9]{64}$/i.test(signature)) {
    console.error("LOYALTY AUTH: Invalid signature format");
    return false;
  }

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

  console.error("LOYALTY AUTH: Signature mismatch");
  return false;
}

function getVerifiedCustomer(request: NextRequest): string | null {
  const params = new URL(request.url).searchParams;

  if (!verifyShopifyProxy(request)) {
    return null;
  }

  const timestamp = Number(params.get("timestamp"));

  if (
    !Number.isFinite(timestamp) ||
    Math.abs(Date.now() / 1000 - timestamp) > 300
  ) {
    return null;
  }

  const shop = params.get("shop");
  const configuredShop = process.env.SHOPIFY_SHOP;

  if (
    !shop ||
    !configuredShop ||
    shop.toLowerCase() !== configuredShop.toLowerCase()
  ) {
    return null;
  }

  const customerId = params.get("logged_in_customer_id");

  if (!customerId || !/^\d+$/.test(customerId)) {
    return null;
  }

  return `gid://shopify/Customer/${customerId}`;
}

// CUSTOMER WALLET: READ ONLY
export async function GET(request: NextRequest) {
  try {
    const customerGid = getVerifiedCustomer(request);

    if (!customerGid) {
      return NextResponse.json(
        { success: false, error: "Customer authentication failed" },
        { status: 401 }
      );
    }

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

    const accountResponse = await fetch(
      `${baseUrl}/rest/v1/wallet_accounts?customer_id=eq.${encodeURIComponent(customerGid)}&select=balance_pence,currency`,
      {
        headers,
        cache: "no-store",
      }
    );

    if (!accountResponse.ok) {
      throw new Error("Could not retrieve customer wallet");
    }

    const accounts = await accountResponse.json();

    const account = accounts[0] || {
      balance_pence: 0,
      currency: "GBP",
    };

    const transactionsResponse = await fetch(
      `${baseUrl}/rest/v1/wallet_transactions?customer_id=eq.${encodeURIComponent(customerGid)}&select=id,transaction_type,amount_pence,balance_after_pence,description,reference,created_at&order=created_at.desc&limit=50`,
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
    console.error("Customer wallet balance error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Unable to retrieve wallet information.",
      },
      { status: 500 }
    );
  }
}

// EXISTING LOYALTY REGISTRATION: PRESERVED
export async function POST(request: NextRequest) {
  try {
    const params = new URL(request.url).searchParams;

    if (!verifyShopifyProxy(request)) {
      return NextResponse.json(
        { success: false, error: "Invalid Shopify signature" },
        { status: 401 }
      );
    }

    const timestamp = Number(params.get("timestamp"));

    if (
      !Number.isFinite(timestamp) ||
      Math.abs(Date.now() / 1000 - timestamp) > 300
    ) {
      return NextResponse.json(
        { success: false, error: "Invalid or expired timestamp" },
        { status: 401 }
      );
    }

    const shop = params.get("shop");
    const configuredShop = process.env.SHOPIFY_SHOP;

    if (
      !shop ||
      !configuredShop ||
      shop.toLowerCase() !== configuredShop.toLowerCase()
    ) {
      return NextResponse.json(
        { success: false, error: "Invalid shop" },
        { status: 401 }
      );
    }

    const customerId = params.get("logged_in_customer_id");

    if (!customerId || !/^\d+$/.test(customerId)) {
      return NextResponse.json(
        { success: false, error: "Customer is not logged in" },
        { status: 401 }
      );
    }

    const apiKey = process.env.SHOPIFY_API_KEY;
    const apiSecret = process.env.SHOPIFY_API_SECRET;

    if (!apiKey || !apiSecret) {
      console.error("LOYALTY REGISTER: Shopify credentials missing");

      return NextResponse.json(
        { success: false, error: "Shopify configuration missing" },
        { status: 500 }
      );
    }

    const tokenResponse = await fetch(
      `https://${configuredShop}/admin/oauth/access_token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: apiKey,
          client_secret: apiSecret,
          grant_type: "client_credentials",
        }),
      }
    );

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok || !tokenData.access_token) {
      console.error("LOYALTY REGISTER: Could not obtain Shopify token");

      return NextResponse.json(
        { success: false, error: "Shopify authentication failed" },
        { status: 502 }
      );
    }

    const customerGid = `gid://shopify/Customer/${customerId}`;

    const mutation = `
      mutation RegisterLoyaltyMember($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields {
            id
            namespace
            key
            value
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const shopifyResponse = await fetch(
      `https://${configuredShop}/admin/api/2026-04/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": tokenData.access_token,
        },
        body: JSON.stringify({
          query: mutation,
          variables: {
            metafields: [
              {
                ownerId: customerGid,
                namespace: "custom",
                key: "loyalty_member",
                type: "boolean",
                value: "true",
              },
            ],
          },
        }),
      }
    );

    const result = await shopifyResponse.json();

    if (!shopifyResponse.ok || result.errors) {
      console.error("LOYALTY REGISTER: Shopify GraphQL request failed");

      return NextResponse.json(
        { success: false, error: "Shopify request failed" },
        { status: 502 }
      );
    }

    const userErrors = result.data?.metafieldsSet?.userErrors || [];

    if (userErrors.length > 0) {
      console.error("LOYALTY REGISTER: Metafield update rejected");

      return NextResponse.json(
        { success: false, error: "Could not register loyalty member" },
        { status: 400 }
      );
    }

    console.log("LOYALTY REGISTER: Customer registered successfully");

    return NextResponse.json({
      success: true,
      registered: true,
    });
  } catch (error) {
    console.error("LOYALTY REGISTER: Unexpected server error", error);

    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
