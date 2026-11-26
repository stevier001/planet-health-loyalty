
import { NextRequest, NextResponse } from "next/server";
import {
  createHmac,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "crypto";
import { promisify } from "util";

export const runtime = "nodejs";

const scrypt = promisify(scryptCallback);

const SESSION_DURATION = 8 * 60 * 60 * 1000;
const LOCKOUT_WINDOW_MINUTES = 15;
const MAX_FAILED_ATTEMPTS = 5;

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
    .update(`staff-login-ip:${ip}`)
    .digest("hex");
}

async function getFailedAttempts(
  supabaseUrl: string,
  serviceKey: string,
  staffId: number,
  ipHash: string,
  since: string
): Promise<number> {
  const url = new URL(
    `${supabaseUrl.replace(/\/$/, "")}/rest/v1/staff_login_attempts`
  );

  url.searchParams.set("select", "id");
  url.searchParams.set("staff_id", `eq.${staffId}`);
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
    throw new Error("Unable to check staff login attempts");
  }

  const range = response.headers.get("content-range");

  if (!range) {
    throw new Error("Unable to read staff login attempt count");
  }

  const count = Number(range.split("/")[1]);

  if (!Number.isFinite(count)) {
    throw new Error("Invalid staff login attempt count");
  }

  return count;
}

async function recordFailedAttempt(
  supabaseUrl: string,
  serviceKey: string,
  staffId: number,
  ipHash: string
) {
  const response = await fetch(
    `${supabaseUrl.replace(/\/$/, "")}/rest/v1/staff_login_attempts`,
    {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        staff_id: staffId,
        ip_hash: ipHash,
      }),
      cache: "no-store",
    }
  );

  if (!response.ok) {
    throw new Error("Unable to record failed staff login");
  }
}

async function clearFailedAttempts(
  supabaseUrl: string,
  serviceKey: string,
  staffId: number,
  ipHash: string
) {
  const url = new URL(
    `${supabaseUrl.replace(/\/$/, "")}/rest/v1/staff_login_attempts`
  );

  url.searchParams.set("staff_id", `eq.${staffId}`);
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
    throw new Error("Unable to clear staff login attempts");
  }
}

// Record successful staff access in Supabase.
async function recordStaffAccess(
  supabaseUrl: string,
  serviceKey: string,
  staffId: number,
  eventType: "login" | "logout"
) {
  const response = await fetch(
    `${supabaseUrl.replace(/\/$/, "")}/rest/v1/staff_access_activity`,
    {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        staff_id: staffId,
        event_type: eventType,
      }),
      cache: "no-store",
    }
  );

  if (!response.ok) {
    console.error(
      "Staff access logging failed:",
      await response.text()
    );
  }
}

async function verifyPin(
  submittedPin: string,
  storedHash: string
): Promise<boolean> {
  try {
    const parts = storedHash.split("$");

    if (parts.length !== 3 || parts[0] !== "scrypt") {
      return false;
    }

    const [, salt, expectedHex] = parts;

    if (
      !/^[a-f0-9]{32,128}$/i.test(salt) ||
      !/^[a-f0-9]{128}$/i.test(expectedHex)
    ) {
      return false;
    }

    const expected = Buffer.from(expectedHex, "hex");

    const derived = (await scrypt(
      submittedPin,
      salt,
      64
    )) as Buffer;

    return (
      derived.length === expected.length &&
      timingSafeEqual(derived, expected)
    );
  } catch {
    return false;
  }
}

function createStaffToken(
  secret: string,
  staffId: number
): string {
  const expires = Date.now() + SESSION_DURATION;
  const nonce = randomBytes(32).toString("hex");

  const payload = `staff:v1:${staffId}:${expires}:${nonce}`;

  const signature = createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  return `v1.${staffId}.${expires}.${nonce}.${signature}`;
}

export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const sessionSecret = process.env.STAFF_SESSION_SECRET;

    if (!supabaseUrl || !serviceKey || !sessionSecret) {
      console.error("Staff login environment settings are missing");

      return NextResponse.json(
        {
          success: false,
          message: "Staff login is not configured",
        },
        { status: 500 }
      );
    }

    const body = await request.json();

    const staffIdValue = body.staffId;
    const pin = body.pin;

    const staffId =
      typeof staffIdValue === "number"
        ? staffIdValue
        : typeof staffIdValue === "string" &&
            /^\d{4}$/.test(staffIdValue)
          ? Number(staffIdValue)
          : NaN;

    if (
      !Number.isInteger(staffId) ||
      staffId < 1001 ||
      staffId > 1020 ||
      typeof pin !== "string" ||
      !/^\d{4,8}$/.test(pin)
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Incorrect staff ID or PIN",
        },
        { status: 401 }
      );
    }

    const clientIp = getClientIp(request);

    if (!clientIp) {
      return NextResponse.json(
        {
          success: false,
          message: "Unable to verify login request",
        },
        { status: 503 }
      );
    }

    const ipHash = hashIp(clientIp, sessionSecret);

    const windowStart = new Date(
      Date.now() - LOCKOUT_WINDOW_MINUTES * 60 * 1000
    ).toISOString();

    const failedAttempts = await getFailedAttempts(
      supabaseUrl,
      serviceKey,
      staffId,
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

    const accountUrl = new URL(
      `${supabaseUrl.replace(/\/$/, "")}/rest/v1/staff_accounts`
    );

    accountUrl.searchParams.set(
      "select",
      "staff_id,pin_hash,is_active"
    );
    accountUrl.searchParams.set("staff_id", `eq.${staffId}`);
    accountUrl.searchParams.set("limit", "1");

    const accountResponse = await fetch(accountUrl.toString(), {
      method: "GET",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
      cache: "no-store",
    });

    if (!accountResponse.ok) {
      throw new Error("Unable to retrieve staff account");
    }

    const accounts = await accountResponse.json();
    const account = accounts[0];

    if (
      !account ||
      account.is_active !== true ||
      typeof account.pin_hash !== "string"
    ) {
      await recordFailedAttempt(
        supabaseUrl,
        serviceKey,
        staffId,
        ipHash
      );

      return NextResponse.json(
        {
          success: false,
          message: "Incorrect staff ID or PIN",
        },
        { status: 401 }
      );
    }

    const pinIsValid = await verifyPin(pin, account.pin_hash);

    if (!pinIsValid) {
      await recordFailedAttempt(
        supabaseUrl,
        serviceKey,
        staffId,
        ipHash
      );

      return NextResponse.json(
        {
          success: false,
          message: "Incorrect staff ID or PIN",
        },
        { status: 401 }
      );
    }

    await clearFailedAttempts(
      supabaseUrl,
      serviceKey,
      staffId,
      ipHash
    );

    const updateResponse = await fetch(
      `${supabaseUrl.replace(/\/$/, "")}/rest/v1/staff_accounts?staff_id=eq.${staffId}`,
      {
        method: "PATCH",
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          last_login_at: new Date().toISOString(),
        }),
        cache: "no-store",
      }
    );

    if (!updateResponse.ok) {
      throw new Error("Unable to update staff login time");
    }

    // Record the successful login for this staff member.
    await recordStaffAccess(
      supabaseUrl,
      serviceKey,
      staffId,
      "login"
    );

    const token = createStaffToken(sessionSecret, staffId);

    const response = NextResponse.json({
      success: true,
      staffId,
    });

    response.cookies.set("staff_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: SESSION_DURATION / 1000,
    });

    return response;
  } catch (error) {
    console.error("Staff login error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Unable to process staff login. Please try again.",
      },
      { status: 500 }
    );
  }
}
