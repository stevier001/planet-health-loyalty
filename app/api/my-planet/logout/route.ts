
import * as crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_COOKIE = "__Host-myplanet_session";

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function POST(request: NextRequest) {
  try {
    const sessionToken = request.cookies.get(SESSION_COOKIE)?.value;

    const response = NextResponse.json(
      { success: true, loggedOut: true },
      {
        headers: {
          "Cache-Control": "no-store, private",
          Pragma: "no-cache",
        },
      }
    );

    // Always clear the browser cookie.
    response.cookies.set({
      name: SESSION_COOKIE,
      value: "",
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });

    if (!sessionToken || !/^[a-f0-9]{64}$/.test(sessionToken)) {
      return response;
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      throw new Error("Supabase configuration is missing");
    }

    const tokenHash = hashToken(sessionToken);
    const baseUrl = supabaseUrl.replace(/\/$/, "");

    const revokeResponse = await fetch(
      `${baseUrl}/rest/v1/customer_sessions?token_hash=eq.${tokenHash}&revoked_at=is.null`,
      {
        method: "PATCH",
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          revoked_at: new Date().toISOString(),
        }),
        cache: "no-store",
      }
    );

    if (!revokeResponse.ok) {
      console.error(
        "MY PLANET: Could not revoke customer session",
        revokeResponse.status
      );

      return NextResponse.json(
        {
          success: false,
          loggedOut: false,
          error: "Unable to complete logout. Please try again.",
        },
        { status: 502 }
      );
    }

    return response;
  } catch (error) {
    console.error("MY PLANET: Logout error", error);

    return NextResponse.json(
      {
        success: false,
        loggedOut: false,
        error: "Unable to complete logout.",
      },
      { status: 500 }
    );
  }
}
