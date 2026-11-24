
import * as crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_LIFETIME_SECONDS = 30 * 24 * 60 * 60;

const ALLOWED_ORIGINS = [
  "https://planethealthclub.co.uk",
  "https://www.planethealthclub.co.uk",
  "https://planet-health-loyalty.vercel.app",
];

const MY_PLANET_URL =
  "https://planet-health-loyalty.vercel.app/my-planet/";

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function isAllowedOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");

  return Boolean(origin && ALLOWED_ORIGINS.includes(origin));
}

export async function POST(request: NextRequest) {
  try {
    // Only accept requests originating from our own storefront or app.
    if (!isAllowedOrigin(request)) {
      return NextResponse.json(
        { success: false, error: "Request origin not allowed." },
        { status: 403 }
      );
    }

    // Support both the browser form handoff and existing JSON requests.
    const contentType = request.headers.get("content-type") || "";

    let ticket: unknown;
    let browserHandoff = false;

    if (
      contentType.includes("application/x-www-form-urlencoded") ||
      contentType.includes("multipart/form-data")
    ) {
      const formData = await request.formData();
      ticket = formData.get("ticket");
      browserHandoff = true;
    } else if (contentType.includes("application/json")) {
      const body = await request.json().catch(() => null);
      ticket = body?.ticket;
    } else {
      return NextResponse.json(
        { success: false, error: "Unsupported request format." },
        { status: 415 }
      );
    }

    if (typeof ticket !== "string" || !/^[a-f0-9]{64}$/.test(ticket)) {
      return NextResponse.json(
        { success: false, error: "Invalid login ticket." },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      throw new Error("Supabase configuration is missing");
    }

    const baseUrl = supabaseUrl.replace(/\/$/, "");

    const headers = {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    };

    // Hash the ticket. The original ticket is never stored.
    const tokenHash = hashToken(ticket);
    const now = new Date().toISOString();

    // Atomically consume the ticket.
    // It can only be used once and only before expiry.
    const consumeResponse = await fetch(
      `${baseUrl}/rest/v1/customer_login_tickets?token_hash=eq.${tokenHash}&consumed_at=is.null&expires_at=gt.${encodeURIComponent(now)}&select=customer_gid`,
      {
        method: "PATCH",
        headers: {
          ...headers,
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          consumed_at: now,
        }),
        cache: "no-store",
      }
    );

    if (!consumeResponse.ok) {
      console.error(
        "MY PLANET: Ticket consumption failed",
        consumeResponse.status
      );

      return NextResponse.json(
        { success: false, error: "Unable to verify login ticket." },
        { status: 502 }
      );
    }

    const consumedTickets = await consumeResponse.json();

    if (!Array.isArray(consumedTickets) || consumedTickets.length !== 1) {
      return NextResponse.json(
        {
          success: false,
          error: "This login link has expired or has already been used.",
        },
        { status: 401 }
      );
    }

    const customerGid = consumedTickets[0].customer_gid;

    if (
      typeof customerGid !== "string" ||
      !/^gid:\/\/shopify\/Customer\/\d+$/.test(customerGid)
    ) {
      throw new Error("Invalid customer identity in login ticket");
    }

    // Generate a new independent customer session token.
    const sessionToken = crypto.randomBytes(32).toString("hex");
    const sessionHash = hashToken(sessionToken);

    const sessionExpiresAt = new Date(
      Date.now() + SESSION_LIFETIME_SECONDS * 1000
    ).toISOString();

    const sessionResponse = await fetch(
      `${baseUrl}/rest/v1/customer_sessions`,
      {
        method: "POST",
        headers: {
          ...headers,
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          token_hash: sessionHash,
          customer_gid: customerGid,
          expires_at: sessionExpiresAt,
          last_seen_at: now,
        }),
        cache: "no-store",
      }
    );

    if (!sessionResponse.ok) {
      console.error(
        "MY PLANET: Session creation failed",
        sessionResponse.status
      );

      return NextResponse.json(
        { success: false, error: "Unable to create customer session." },
        { status: 502 }
      );
    }

    // Browser handoff: set the session cookie and redirect to My Planet.
    // JSON callers retain the original JSON response behaviour.
    const response = browserHandoff
      ? NextResponse.redirect(MY_PLANET_URL, 303)
      : NextResponse.json(
          {
            success: true,
            expiresIn: SESSION_LIFETIME_SECONDS,
          },
          {
            headers: {
              "Cache-Control": "no-store, private",
              Pragma: "no-cache",
            },
          }
        );

    response.headers.set("Cache-Control", "no-store, private");
    response.headers.set("Pragma", "no-cache");

    response.cookies.set({
      name: "__Host-myplanet_session",
      value: sessionToken,
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_LIFETIME_SECONDS,
    });

    return response;
  } catch (error) {
    console.error("MY PLANET: Session exchange error", error);

    return NextResponse.json(
      {
        success: false,
        error: "Unable to complete My Planet login.",
      },
      { status: 500 }
    );
  }
}
