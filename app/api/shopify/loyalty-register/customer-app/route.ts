
import * as crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STORE_DOMAIN = "5ieyjg-ax.myshopify.com";
const TICKET_LIFETIME_SECONDS = 60;

function verifyShopifyProxy(request: NextRequest): boolean {
  const params = request.nextUrl.searchParams;
  const signature = params.get("signature");

  if (!signature || !/^[a-f0-9]{64}$/i.test(signature)) {
    return false;
  }

  const secrets = [
    process.env.SHOPIFY_API_SECRET,
    process.env.SHOPIFY_API_SECRET_OLD,
  ].filter((value): value is string => Boolean(value));

  if (secrets.length === 0) {
    console.error("MY PLANET: Shopify secrets missing");
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

  const supplied = Buffer.from(signature, "hex");

  return secrets.some((secret) => {
    const expected = crypto
      .createHmac("sha256", secret)
      .update(message)
      .digest();

    return (
      supplied.length === expected.length &&
      crypto.timingSafeEqual(supplied, expected)
    );
  });
}

function getVerifiedCustomer(request: NextRequest): string | null {
  const params = request.nextUrl.searchParams;

  const timestamp = Number(params.get("timestamp"));
  const shop = params.get("shop");
  const customerId = params.get("logged_in_customer_id");

  if (
    !Number.isFinite(timestamp) ||
    Math.abs(Date.now() / 1000 - timestamp) > 300 ||
    shop !== STORE_DOMAIN ||
    !customerId ||
    !/^\d+$/.test(customerId)
  ) {
    return null;
  }

  return `gid://shopify/Customer/${customerId}`;
}

export async function GET(request: NextRequest) {
  try {
    if (!verifyShopifyProxy(request)) {
      return NextResponse.json(
        { success: false, error: "Invalid Shopify signature" },
        { status: 401 }
      );
    }

    const customerGid = getVerifiedCustomer(request);

    if (!customerGid) {
      return NextResponse.json(
        {
          success: false,
          error: "Please log in to your Planet Health account.",
        },
        { status: 401 }
      );
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      throw new Error("Supabase configuration is missing");
    }

    // Generate a cryptographically secure, single-use ticket.
    const ticket = crypto.randomBytes(32).toString("hex");

    // Only the SHA-256 hash is stored in Supabase.
    const tokenHash = crypto
      .createHash("sha256")
      .update(ticket)
      .digest("hex");

    const expiresAt = new Date(
      Date.now() + TICKET_LIFETIME_SECONDS * 1000
    ).toISOString();

    const baseUrl = supabaseUrl.replace(/\/$/, "");

    const response = await fetch(
      `${baseUrl}/rest/v1/customer_login_tickets`,
      {
        method: "POST",
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          token_hash: tokenHash,
          customer_gid: customerGid,
          expires_at: expiresAt,
        }),
        cache: "no-store",
      }
    );

    if (!response.ok) {
      console.error(
        "MY PLANET: Could not create login ticket",
        response.status
      );

      return NextResponse.json(
        { success: false, error: "Unable to start My Planet login." },
        { status: 502 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        ticket,
        expiresIn: TICKET_LIFETIME_SECONDS,
      },
      {
        headers: {
          "Cache-Control": "no-store, private",
          "Pragma": "no-cache",
        },
      }
    );
  } catch (error) {
    console.error("MY PLANET: Login ticket error", error);

    return NextResponse.json(
      { success: false, error: "Unable to start My Planet login." },
      { status: 500 }
    );
  }
}
