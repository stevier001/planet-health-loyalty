
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

export const runtime = "nodejs";

function verifyShopifyProxy(request: NextRequest): boolean {
  const params = new URL(request.url).searchParams;

  const signature = params.get("signature");
  const secret = process.env.SHOPIFY_API_SECRET;

  if (!signature) {
    console.error("LOYALTY AUTH: Missing signature");
    return false;
  }

  if (!secret) {
    console.error("LOYALTY AUTH: SHOPIFY_API_SECRET missing");
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
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, values]) => `${key}=${values.join(",")}`)
    .join("");

  const calculated = crypto
    .createHmac("sha256", secret)
    .update(message)
    .digest("hex");

  if (!/^[a-f0-9]{64}$/i.test(signature)) {
    console.error("LOYALTY AUTH: Invalid signature format");
    return false;
  }

  const supplied = Buffer.from(signature, "hex");
  const expected = Buffer.from(calculated, "hex");

  if (
    supplied.length !== expected.length ||
    !crypto.timingSafeEqual(supplied, expected)
  ) {
    console.error("LOYALTY AUTH: Signature mismatch");
    return false;
  }

  const timestamp = Number(params.get("timestamp"));

  if (!Number.isFinite(timestamp)) {
    console.error("LOYALTY AUTH: Invalid timestamp");
    return false;
  }

  const age = Math.floor(Date.now() / 1000) - timestamp;

  if (age > 300 || age < -60) {
    console.error("LOYALTY AUTH: Timestamp outside allowed window");
    return false;
  }

  const expectedShop = process.env.SHOPIFY_SHOP;
  const actualShop = params.get("shop");

  if (!expectedShop || actualShop !== expectedShop) {
    console.error("LOYALTY AUTH: Shop mismatch");
    return false;
  }

  console.log("LOYALTY AUTH: Shopify proxy verified");

  return true;
}

export async function POST(request: NextRequest) {
  try {
    if (!verifyShopifyProxy(request)) {
      return NextResponse.json(
        { success: false, message: "Invalid Shopify request" },
        { status: 401 }
      );
    }

    const url = new URL(request.url);

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
