
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

function jsonResponse(
  body: Record<string, unknown>,
  status = 200
) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, private",
      Pragma: "no-cache",
    },
  });
}

function isValidBirthday(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    return false;
  }

  const today = new Date().toISOString().slice(0, 10);

  return value <= today;
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

export async function POST(request: NextRequest) {
  try {
    // 1. Only accept requests from this application.

    const origin = request.headers.get("origin");

    if (!origin || origin !== request.nextUrl.origin) {
      return jsonResponse(
        { success: false, error: "Invalid request origin." },
        403
      );
    }

    // 2. Verify the customer's My Planet session.

    const customerGid = await getCustomerGid(request);

    if (!customerGid) {
      return jsonResponse(
        {
          success: false,
          authenticated: false,
          error: "Your session has expired. Please log in again.",
        },
        401
      );
    }

    // 3. Read and validate the requested birthday.

    const body = await request.json();
    const dateOfBirth = body?.dateOfBirth;

    if (!isValidBirthday(dateOfBirth)) {
      return jsonResponse(
        {
          success: false,
          error: "Please enter a valid date of birth. Future dates are not allowed.",
        },
        400
      );
    }

    // 4. Authenticate with Shopify.

    const accessToken = await getShopifyAccessToken();

    // 5. Save or update the customer's birthday metafield.

    const mutation = `
      mutation SaveMyPlanetBirthday($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields {
            namespace
            key
            value
            type
            updatedAt
          }
          userErrors {
            field
            message
            code
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
          query: mutation,
          variables: {
            metafields: [
              {
                ownerId: customerGid,
                namespace: "custom",
                key: "date_of_birth",
                type: "date",
                value: dateOfBirth,
              },
            ],
          },
        }),
        cache: "no-store",
      }
    );

    if (!shopifyResponse.ok) {
      throw new Error("Shopify birthday update failed");
    }

    const shopifyData = await shopifyResponse.json();

    if (shopifyData.errors?.length) {
      console.error(
        "My Planet birthday Shopify errors:",
        shopifyData.errors
      );

      throw new Error("Shopify birthday update failed");
    }

    const result = shopifyData.data?.metafieldsSet;

    if (!result) {
      throw new Error("Shopify returned no birthday update result");
    }

    if (result.userErrors?.length) {
      console.error(
        "My Planet birthday user errors:",
        result.userErrors
      );

      return jsonResponse(
        {
          success: false,
          error: "Shopify could not save your birthday. Please try again.",
        },
        422
      );
    }

    const savedMetafield = result.metafields?.[0];

    if (
      !savedMetafield ||
      savedMetafield.value !== dateOfBirth
    ) {
      throw new Error("Birthday could not be verified after saving");
    }

    // 6. Confirm the saved birthday.

    return jsonResponse({
      success: true,
      message: "Your birthday has been saved successfully.",
      dateOfBirth: savedMetafield.value,
      updatedAt: savedMetafield.updatedAt,
    });
  } catch (error) {
    console.error("MY PLANET: Birthday update error", error);

    return jsonResponse(
      {
        success: false,
        error: "Unable to save your birthday. Please try again.",
      },
      500
    );
  }
}
