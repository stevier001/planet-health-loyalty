
import { NextRequest, NextResponse } from "next/server";
import { createHmac, randomBytes } from "crypto";

export const runtime = "nodejs";

const SESSION_DURATION = 60 * 60 * 8;
const LOCKOUT_WINDOW_MINUTES = 15;
const MAX_FAILED_ATTEMPTS = 5;

function createOwnerToken(secret: string): string {
  const expires = Math.floor(Date.now() / 1000) + SESSION_DURATION;
  const nonce = randomBytes(32).toString("hex");

  const payload = `owners:v1:${expires}:${nonce}`;

  const signature = createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  return `v1.${expires}.${nonce}.${signature}`;
}

function getClientIp(request: NextRequest): string | null {
  const forwardedFor = request.headers.get("x-forwarded-for");

  if (forwardedFor) {
    const ip = forwardedFor.split(",")[0].trim();
    if (ip) return ip;
  }

  return request.headers.get("x-real-ip") || null;
}

function hashIp(ip: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(`owner-login-ip:${ip}`)
    .digest("hex");
}

async function getFailedAttempts(
  supabaseUrl: string,
  serviceKey: string,
  ipHash: string,
  since: string
): Promise<number> {
  const url = new URL(
    `${supabaseUrl.replace(/\/$/, "")}/rest/v1/owner_login_attempts`
  );

  url.searchParams.set("select", "id");
  url.searchParams.set("ip_hash", `eq.${ipHash}`);
  url.searchParams.set("attempted_at", `gte.${since}`);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Prefer: "count=exact",
      Range: "0-0",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Unable to check login attempts");
  }

  const contentRange = response.headers.get("content-range");

  if (!contentRange) {
    throw new Error("Unable to read login attempt count");
  }

  const count = Number(contentRange.split("/")[1]);

  if (!Number.isFinite(count)) {
    throw new Error("Invalid login attempt count");
  }

  return count;
}

async function recordFailedAttempt(
  supabaseUrl: string,
  serviceKey: string,
  ipHash: string
) {
  const response = await fetch(
    `${supabaseUrl.replace(/\/$/, "")}/rest/v1/owner_login_attempts`,
    {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        ip_hash: ipHash,
      }),
      cache: "no-store",
    }
  );

  if (!response.ok) {
    throw new Error("Unable to record failed login attempt");
  }
}

async function clearFailedAttempts(
  supabaseUrl: string,
  serviceKey: string,
  ipHash: string
) {
  const url = new URL(
    `${supabaseUrl.replace(/\/$/, "")}/rest/v1/owner_login_attempts`
  );

  url.searchParams.set("ip_hash", `eq.${ipHash}`);

  const response = await fetch(url.toString(), {
    method: "DELETE",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Unable to clear login attempts");
  }
}

export async function POST(request: NextRequest) {
  try {
    const { pin } = await request.json();

    const correctPin = process.env.OWNERS_PIN;
    const sessionSecret = process.env.STAFF_SESSION_SECRET;
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (
      !correctPin ||
      !sessionSecret ||
      !supabaseUrl ||
      !serviceKey
    ) {
      console.error("Owner login environment settings are missing");

      return NextResponse.json(
        { success: false, message: "Login settings are missing" },
        { status: 500 }
      );
    }

    if (typeof pin !== "string") {
      return NextResponse.json(
        { success: false, message: "Incorrect PIN" },
        { status: 401 }
      );
    }

    const clientIp = getClientIp(request);

    if (!clientIp) {
      return NextResponse.json(
        { success: false, message: "Unable to verify login request" },
        { status: 503 }
      );
    }

    const ipHash = hashIp(clientIp, sessionSecret);

    const windowStart = new Date(
      Date.now() - LOCKOUT_WINDOW_MINUTES * 60 * 1000
    ).toISOString();

    // Check the number of failed attempts in the last 15 minutes.
    const failedAttempts = await getFailedAttempts(
      supabaseUrl,
      serviceKey,
      ipHash,
      windowStart
    );

    if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Too many incorrect attempts. Please try again in 15 minutes.",
        },
        { status: 429 }
      );
    }

    // Check the owner PIN.
    if (pin !== correctPin) {
      await recordFailedAttempt(
        supabaseUrl,
        serviceKey,
        ipHash
      );

      return NextResponse.json(
        { success: false, message: "Incorrect PIN" },
        { status: 401 }
      );
    }

    // Correct PIN: clear previous failed attempts.
    try {
      await clearFailedAttempts(
        supabaseUrl,
        serviceKey,
        ipHash
      );
    } catch (error) {
      console.error("Unable to clear owner login attempts:", error);

      return NextResponse.json(
        {
          success: false,
          message: "Unable to complete login. Please try again.",
        },
        { status: 503 }
      );
    }

    // Create the signed eight-hour owner session.
    const token = createOwnerToken(sessionSecret);

    const response = NextResponse.json({
      success: true,
    });

    response.cookies.set("owners_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: SESSION_DURATION,
    });

    return response;
  } catch (error) {
    console.error("Owner login error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Unable to log in. Please try again.",
      },
      { status: 500 }
    );
  }
}
