
import * as crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Approved Planet Health wallet top-up variants.
// Values are fixed server-side and cannot be changed by the browser.
const WALLET_TOP_UPS: Record<string, number> = {
  "60663988191577": 10,
  "60663988224345": 20,
  "60663988257113": 30,
  "60663988289881": 40,
  "60663988322649": 50,
  "60663988355417": 100,
};

const STORE_URL = "https://planethealthclub.co.uk";

// Verify Shopify's signed App Proxy request.
// This deliberately follows the existing loyalty-register
// authentication implementation.
function verifyShopifyProxy(request: NextRequest): boolean {
  const params = new URL(request.url).searchParams;
  const signature = params.get("signature");

  const secrets = [
    process.env.SHOPIFY_API_SECRET,
    process.env.SHOPIFY_API_SECRET_OLD,
  ].filter((secret): secret is string => Boolean(secret));

  if (!signature || secrets.length === 0) {
    console.error("WALLET CHECKOUT: Missing signature or secrets");
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
    console.error("WALLET CHECKOUT: Invalid signature format");
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

  console.error("WALLET CHECKOUT: Signature mismatch");
  return false;
}

// Establish the customer identity from Shopify's signed parameters.
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

export async function POST(request: NextRequest) {
  try {
    // 1. Verify the logged-in Shopify customer.
    const customerGid = getVerifiedCustomer(request);

    if (!customerGid) {
      return NextResponse.json(
        {
          success: false,
          message: "Please log in to your Planet Health account.",
        },
        { status: 401 }
      );
    }

    // 2. Read the requested top-up variant.
    let body: { variantId?: unknown };

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid checkout request.",
        },
        { status: 400 }
      );
    }

    const variantId = String(body.variantId || "");

    // 3. Only permit the six approved variants.
    const amount = WALLET_TOP_UPS[variantId];

    if (!amount) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid wallet top-up selection.",
        },
        { status: 400 }
      );
    }

    // 4. Create the Shopify cart checkout URL.
    // The browser will continue on the same storefront domain.
    const checkoutUrl =
      `${STORE_URL}/cart/${variantId}:1?checkout`;

    // 5. Return the approved checkout details.
    return NextResponse.json(
      {
        success: true,
        amount,
        variantId,
        checkoutUrl,
      },
      {
        headers: {
          "Cache-Control": "no-store, private",
        },
      }
    );
  } catch (error) {
    console.error("WALLET CHECKOUT ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Unable to create wallet checkout.",
      },
      { status: 500 }
    );
  }
}
