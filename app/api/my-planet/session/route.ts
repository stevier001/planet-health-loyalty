
import * as crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_COOKIE = "__Host-myplanet_session";

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function GET(request: NextRequest) {
  try {
    const sessionToken = request.cookies.get(SESSION_COOKIE)?.value;

    if (
      !sessionToken ||
      !/^[a-f0-9]{64}$/.test(sessionToken)
    ) {
      return NextResponse.json(
        { success: false, authenticated: false },
        { status: 401 }
      );
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
      `${baseUrl}/rest/v1/customer_sessions?token_hash=eq.${tokenHash}&revoked_at=is.null&expires_at=gt.${encodeURIComponent(now)}&select=expires_at`,
      {
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
        },
        cache: "no-store",
      }
    );

    if (!response.ok) {
      console.error(
        "MY PLANET: Session verification failed",
        response.status
      );

      return NextResponse.json(
        {
          success: false,
          authenticated: false,
          error: "Unable to verify customer session.",
        },
        { status: 502 }
      );
    }

    const sessions = await response.json();

    if (!Array.isArray(sessions) || sessions.length !== 1) {
      const result = NextResponse.json(
        { success: true, authenticated: false },
        {
          headers: {
            "Cache-Control": "no-store, private",
          },
        }
      );

      result.cookies.set({
        name: SESSION_COOKIE,
        value: "",
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: 0,
      });

      return result;
    }

    // Update last activity without making authentication
    // dependent on this non-essential update.
    fetch(
      `${baseUrl}/rest/v1/customer_sessions?token_hash=eq.${tokenHash}&revoked_at=is.null`,
      {
        method: "PATCH",
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          last_seen_at: now,
        }),
        cache: "no-store",
      }
    ).catch((error) => {
      console.error("MY PLANET: Last activity update failed", error);
    });

    return NextResponse.json(
      {
        success: true,
        authenticated: true,
        expiresAt: sessions[0].expires_at,
      },
      {
        headers: {
          "Cache-Control": "no-store, private",
          Pragma: "no-cache",
        },
      }
    );
  } catch (error) {
    console.error("MY PLANET: Session verification error", error);

    return NextResponse.json(
      {
        success: false,
        authenticated: false,
        error: "Unable to verify customer session.",
      },
      { status: 500 }
    );
  }
}
