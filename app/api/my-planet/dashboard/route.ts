
import * as crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SHOPIFY_API_VERSION = "2026-04";
const STORE_DOMAIN = "5ieyjg-ax.myshopify.com";
const SESSION_COOKIE = "__Host-myplanet_session";

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function getCustomerGid(
  request: NextRequest
): Promise<string | null> {
  const sessionToken = request.cookies.get(SESSION_COOKIE)?.value;

  if (!sessionToken || !/^[a-f0-9]{64}$/.test(sessionToken)) {
    return null;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error("Supabase configuration is missing");
  }

  const baseUrl = supabaseUrl.replace(/\/$/, "");
  const tokenHash = hashToken(sessionToken);
  const now = new Date().toISOString();

  const response = await fetch(
    `${baseUrl}/rest/v1/customer_sessions?token_hash=eq.${tokenHash}&revoked_at=is.null&expires_at=gt.${encodeURIComponent(now)}&select=customer_gid`,
    {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
      cache: "no-store",
    }
  );

  if (!response.ok) {
    throw new Error("Could not verify customer session");
  }

  const sessions = await response.json();

  if (!Array.isArray(sessions) || sessions.length !== 1) {
    return null;
  }

  return sessions[0].customer_gid;
}

async function getShopifyAccessToken(): Promise<string> {
  const apiKey = process.env.SHOPIFY_API_KEY;
  const apiSecret = process.env.SHOPIFY_API_SECRET;

  if (!apiKey || !apiSecret) {
    throw new Error("Shopify credentials are missing");
  }

  const response = await fetch(
    `https://${STORE_DOMAIN}/admin/oauth/access_token`,
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
      cache: "no-store",
    }
  );

  const data = await response.json();

  if (!response.ok || !data.access_token) {
    throw new Error("Could not authenticate with Shopify");
  }

  return data.access_token;
}

export async function GET(request: NextRequest) {
  try {
    // 1. Verify the customer's secure My Planet session.

    const customerGid = await getCustomerGid(request);

    if (!customerGid) {
      return NextResponse.json(
        {
          success: false,
          authenticated: false,
          error: "Please log in to My Planet.",
        },
        { status: 401 }
      );
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      throw new Error("Supabase configuration is missing");
    }

    const baseUrl = supabaseUrl.replace(/\/$/, "");

    const supabaseHeaders = {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    };

    // 2. Retrieve customer details, loyalty stamps and date of birth.

    const accessToken = await getShopifyAccessToken();

    const customerQuery = `
      query GetMyPlanetCustomer($id: ID!) {
        customer(id: $id) {
          firstName
          lastName
          email
          loyaltyStamps: metafield(namespace: "loyalty", key: "stamps") {
            value
          }
          dateOfBirth: metafield(namespace: "custom", key: "date_of_birth") {
            value
          }
        }
      }
    `;

    const shopifyResponse = await fetch(
      `https://${STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken,
        },
        body: JSON.stringify({
          query: customerQuery,
          variables: {
            id: customerGid,
          },
        }),
        cache: "no-store",
      }
    );

    if (!shopifyResponse.ok) {
      throw new Error("Could not retrieve Shopify customer");
    }

    const shopifyData = await shopifyResponse.json();

    if (shopifyData.errors?.length) {
      console.error("My Planet Shopify errors:", shopifyData.errors);
      throw new Error("Shopify customer lookup failed");
    }

    const customer = shopifyData.data?.customer;

    if (!customer) {
      return NextResponse.json(
        {
          success: false,
          error: "Your Planet Health customer account could not be found.",
        },
        { status: 404 }
      );
    }

    const parsedStamps = Number(
      customer.loyaltyStamps?.value ?? 0
    );

    const stamps =
      Number.isFinite(parsedStamps)
        ? Math.min(6, Math.max(0, Math.floor(parsedStamps)))
        : 0;

    // 3. Retrieve the existing wallet account.

    const accountResponse = await fetch(
      `${baseUrl}/rest/v1/wallet_accounts?customer_id=eq.${encodeURIComponent(customerGid)}&select=balance_pence,currency`,
      {
        headers: supabaseHeaders,
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

    // 4. Retrieve the customer's recent wallet transactions.

    const transactionsResponse = await fetch(
      `${baseUrl}/rest/v1/wallet_transactions?customer_id=eq.${encodeURIComponent(customerGid)}&select=id,transaction_type,amount_pence,balance_after_pence,description,reference,created_at&order=created_at.desc&limit=50`,
      {
        headers: supabaseHeaders,
        cache: "no-store",
      }
    );

    if (!transactionsResponse.ok) {
      throw new Error("Could not retrieve wallet transactions");
    }

    const transactions = await transactionsResponse.json();

    // 5. Return the customer's dashboard information.

    return NextResponse.json(
      {
        success: true,
        authenticated: true,
        customer: {
          firstName: customer.firstName || "",
          lastName: customer.lastName || "",
          email: customer.email || "",
          dateOfBirth: customer.dateOfBirth?.value || null,
        },
        loyalty: {
          stamps,
          target: 6,
          rewardUnlocked: stamps >= 6,
        },
        wallet: {
          balancePence: Number(account.balance_pence) || 0,
          currency: account.currency || "GBP",
          transactions,
        },
      },
      {
        headers: {
          "Cache-Control": "no-store, private",
          Pragma: "no-cache",
        },
      }
    );
  } catch (error) {
    console.error("MY PLANET: Dashboard error", error);

    return NextResponse.json(
      {
        success: false,
        error: "Unable to load your Planet Health dashboard.",
      },
      { status: 500 }
    );
  }
}
