
import * as crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SHOPIFY_API_VERSION = "2026-04";

const STORE_DOMAIN = "5ieyjg-ax.myshopify.com";

const ALLOWED_CHECKOUT_HOSTS = [
  "planethealthclub.co.uk",
  "www.planethealthclub.co.uk",
  STORE_DOMAIN,
];

const APPROVED_VARIANTS: Record<string, number> = {
  "60663988191577": 10,
  "60663988224345": 20,
  "60663988257113": 30,
  "60663988289881": 40,
  "60663988322649": 50,
  "60663988355417": 100,
};

function verifyShopifyProxy(request: NextRequest): boolean {
  const params = request.nextUrl.searchParams;
  const signature = params.get("signature");

  if (!signature) {
    return false;
  }

  const secrets = [
    process.env.SHOPIFY_API_SECRET,
    process.env.SHOPIFY_API_SECRET_OLD,
  ].filter((value): value is string => Boolean(value));

  if (secrets.length === 0) {
    console.error("Shopify App Proxy secrets are missing.");
    return false;
  }

  const groupedParams = new Map<string, string[]>();

  params.forEach((value, key) => {
    if (key === "signature") return;

    const existing = groupedParams.get(key) || [];
    existing.push(value);
    groupedParams.set(key, existing);
  });

  const message = Array.from(groupedParams.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, values]) => `${key}=${values.join(",")}`)
    .join("");

  return secrets.some((secret) => {
    const calculated = crypto
      .createHmac("sha256", secret)
      .update(message)
      .digest("hex");

    try {
      const expectedBuffer = Buffer.from(calculated, "hex");
      const receivedBuffer = Buffer.from(signature, "hex");

      return (
        expectedBuffer.length === receivedBuffer.length &&
        crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
      );
    } catch {
      return false;
    }
  });
}

function getVerifiedCustomer(request: NextRequest): string | null {
  const params = request.nextUrl.searchParams;

  const timestamp = params.get("timestamp");
  const shop = params.get("shop");
  const customerId = params.get("logged_in_customer_id");

  if (!timestamp || !shop || !customerId) {
    return null;
  }

  const timestampNumber = Number(timestamp);

  if (!Number.isFinite(timestampNumber)) {
    return null;
  }

  const currentTime = Math.floor(Date.now() / 1000);

  if (Math.abs(currentTime - timestampNumber) > 300) {
    return null;
  }

  if (shop !== STORE_DOMAIN) {
    return null;
  }

  if (!/^\d+$/.test(customerId)) {
    return null;
  }

  return `gid://shopify/Customer/${customerId}`;
}

export async function POST(request: NextRequest) {
  try {
    // 1. Verify the Shopify App Proxy request.

    if (!verifyShopifyProxy(request)) {
      return NextResponse.json(
        {
          success: false,
          error: "Unauthorised Shopify request.",
        },
        { status: 401 }
      );
    }

    // 2. Verify that the customer is logged in.

    const customerId = getVerifiedCustomer(request);

    if (!customerId) {
      return NextResponse.json(
        {
          success: false,
          error: "Please log in to your Planet Health account.",
        },
        { status: 401 }
      );
    }

    // 3. Read and validate the selected wallet top-up.

    const body = await request.json().catch(() => null);

    const variantId = String(body?.variantId || "");

    const amount = APPROVED_VARIANTS[variantId];

    if (!amount) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid wallet top-up selection.",
        },
        { status: 400 }
      );
    }

    // 4. Create the Shopify Storefront API cart.

    const storefrontEndpoint =
      `https://${STORE_DOMAIN}/api/${SHOPIFY_API_VERSION}/graphql.json`;

    const mutation = `
      mutation CreateWalletCheckout($input: CartInput) {
        cartCreate(input: $input) {
          cart {
            id
            checkoutUrl
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const storefrontResponse = await fetch(storefrontEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: mutation,
        variables: {
          input: {
            lines: [
              {
                merchandiseId: `gid://shopify/ProductVariant/${variantId}`,
                quantity: 1,
              },
            ],
          },
        },
        // No Storefront API token is required for tokenless cart access.
      }),
      cache: "no-store",
    });

    if (!storefrontResponse.ok) {
      console.error(
        "Shopify Storefront API HTTP error:",
        storefrontResponse.status
      );

      return NextResponse.json(
        {
          success: false,
          error: "Unable to create your checkout. Please try again.",
        },
        { status: 502 }
      );
    }

    const storefrontData = await storefrontResponse.json();

    if (storefrontData.errors?.length) {
      console.error(
        "Shopify Storefront API errors:",
        storefrontData.errors
      );

      return NextResponse.json(
        {
          success: false,
          error: "Shopify could not create your checkout.",
        },
        { status: 502 }
      );
    }

    const cartResult = storefrontData.data?.cartCreate;

    if (cartResult?.userErrors?.length) {
      console.error(
        "Shopify cart creation errors:",
        cartResult.userErrors
      );

      return NextResponse.json(
        {
          success: false,
          error: "Unable to create your wallet checkout.",
        },
        { status: 502 }
      );
    }

    const checkoutUrl = cartResult?.cart?.checkoutUrl;

    if (!checkoutUrl) {
      console.error("Shopify did not return a checkout URL.");

      return NextResponse.json(
        {
          success: false,
          error: "Shopify did not return a checkout URL.",
        },
        { status: 502 }
      );
    }

    // 5. Validate Shopify's returned checkout URL.

    const checkout = new URL(checkoutUrl);

    if (
      checkout.protocol !== "https:" ||
      !ALLOWED_CHECKOUT_HOSTS.includes(checkout.hostname)
    ) {
      console.error(
        "Unexpected Shopify checkout URL host:",
        checkout.hostname
      );

      return NextResponse.json(
        {
          success: false,
          error: "Invalid checkout destination.",
        },
        { status: 502 }
      );
    }

    // 6. Ask Shopify to silently authenticate the existing
    // Customer Accounts session when checkout opens.

    checkout.searchParams.set("sso", "silent");

    console.log("Wallet checkout created:", {
      customerId,
      amount,
      variantId,
    });

    // 7. Return the checkout URL to the existing wallet page.

    return NextResponse.json({
      success: true,
      amount,
      variantId,
      checkoutUrl: checkout.toString(),
    });
  } catch (error) {
    console.error("Wallet checkout error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Something went wrong creating your checkout.",
      },
      { status: 500 }
    );
  }
}
