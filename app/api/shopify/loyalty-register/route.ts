
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

export const runtime = "nodejs";

function verifyShopifyProxy(request: NextRequest) {
  const url = new URL(request.url);
  const params = url.searchParams;

  const signature = params.get("signature");
  const secret = process.env.SHOPIFY_API_SECRET;

  if (!signature || !secret) {
    return false;
  }

  // Group duplicate query parameters, as Shopify requires.
  const grouped = new Map<string, string[]>();

  params.forEach((value, key) => {
    if (key === "signature") return;

    const existing = grouped.get(key) || [];
    existing.push(value);
    grouped.set(key, existing);
  });

  // Shopify App Proxy signature format:
  // sorted key=value pairs, concatenated without separators.
  const message = Array.from(grouped.entries())
    .map(([key, values]) => `${key}=${values.join(",")}`)
    .sort()
    .join("");

  const calculated = crypto
    .createHmac("sha256", secret)
    .update(message)
    .digest("hex");

  if (!/^[a-f0-9]{64}$/i.test(signature)) {
    return false;
  }

  const suppliedBuffer = Buffer.from(signature, "hex");
  const calculatedBuffer = Buffer.from(calculated, "hex");

  if (
    suppliedBuffer.length !== calculatedBuffer.length ||
    !crypto.timingSafeEqual(suppliedBuffer, calculatedBuffer)
  ) {
    return false;
  }

  // Reject old or future-dated requests.
  const timestamp = Number(params.get("timestamp"));

  if (!Number.isFinite(timestamp)) {
    return false;
  }

  const age = Math.floor(Date.now() / 1000) - timestamp;

  if (age > 300 || age < -60) {
    return false;
  }

  // Only accept requests from our Shopify store.
  const expectedShop = process.env.SHOPIFY_SHOP;
  const actualShop = params.get("shop");

  if (!expectedShop || actualShop !== expectedShop) {
    return false;
  }

  return true;
}

export async function POST(request: NextRequest) {
  try {
    // Verify Shopify's signature before trusting any parameters.
    if (!verifyShopifyProxy(request)) {
      return NextResponse.json(
        { success: false, message: "Invalid Shopify request" },
        { status: 401 }
      );
    }

    const url = new URL(request.url);

    // This ID comes from Shopify's signed App Proxy request.
    const customerId = url.searchParams.get(
      "logged_in_customer_id"
    );

    if (!customerId || !/^\d+$/.test(customerId)) {
      return NextResponse.json(
        {
          success: false,
          message: "Please log in to register for loyalty.",
        },
        { status: 401 }
      );
    }

    const shop = process.env.SHOPIFY_SHOP;
    const clientId = process.env.SHOPIFY_API_KEY;
    const clientSecret = process.env.SHOPIFY_API_SECRET;

    if (!shop || !clientId || !clientSecret) {
      throw new Error("Shopify settings are missing");
    }

    // Obtain Shopify Admin API access token.
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

    const endpoint =
      `https://${shop}/admin/api/2026-04/graphql.json`;

    const customerGid =
      `gid://shopify/Customer/${customerId}`;

    // Register the authenticated customer as a loyalty member.
    const registrationResponse = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": tokenData.access_token,
      },
      body: JSON.stringify({
        query: `
          mutation RegisterLoyaltyMember(
            $metafields: [MetafieldsSetInput!]!
          ) {
            metafieldsSet(metafields: $metafields) {
              metafields {
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
        `,
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
      cache: "no-store",
    });

    const registrationData =
      await registrationResponse.json();

    if (
      !registrationResponse.ok ||
      registrationData.errors ||
      registrationData.data?.metafieldsSet?.userErrors?.length
    ) {
      console.error(
        "Loyalty registration failed:",
        registrationData.errors ||
          registrationData.data?.metafieldsSet?.userErrors
      );

      throw new Error("Unable to register loyalty membership");
    }

    return NextResponse.json({
      success: true,
      registered: true,
      message: "Loyalty membership confirmed.",
    });
  } catch (error) {
    console.error("Loyalty registration error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Unable to register loyalty membership.",
      },
      { status: 500 }
    );
  }
}
