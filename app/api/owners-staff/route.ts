
import { NextRequest, NextResponse } from "next/server";
import {
  createHmac,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "crypto";
import { promisify } from "util";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const scrypt = promisify(scryptCallback);
const SESSION_DURATION = 60 * 60 * 8;

function verifyOwnerSession(token: string, secret: string): boolean {
  try {
    const parts = token.split(".");
    if (parts.length !== 4) return false;

    const [version, expiryString, nonce, signature] = parts;

    if (
      version !== "v1" ||
      !/^\d+$/.test(expiryString) ||
      !/^[a-f0-9]{64}$/.test(nonce) ||
      !/^[a-f0-9]{64}$/.test(signature)
    ) {
      return false;
    }

    const expires = Number(expiryString);
    const now = Math.floor(Date.now() / 1000);

    if (
      !Number.isSafeInteger(expires) ||
      expires <= now ||
      expires > now + SESSION_DURATION
    ) {
      return false;
    }

    const payload = `owners:v1:${expires}:${nonce}`;

    const expected = createHmac("sha256", secret)
      .update(payload)
      .digest();

    const supplied = Buffer.from(signature, "hex");

    return (
      supplied.length === expected.length &&
      timingSafeEqual(supplied, expected)
    );
  } catch {
    return false;
  }
}

async function hashPin(pin: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");

  const derived = (await scrypt(
    pin,
    salt,
    64
  )) as Buffer;

  return `scrypt$${salt}$${derived.toString("hex")}`;
}

async function isOwner(request: NextRequest): Promise<boolean> {
  const token = request.cookies.get("owners_session")?.value;
  const secret = process.env.STAFF_SESSION_SECRET;

  if (!token || !secret) return false;

  return verifyOwnerSession(token, secret);
}

function getDatabaseSettings() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase settings are missing");
  }

  return {
    baseUrl: url.replace(/\/$/, ""),
    key,
  };
}

function databaseHeaders(key: string) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

export async function GET(request: NextRequest) {
  try {
    if (!(await isOwner(request))) {
      return NextResponse.json(
        { success: false, message: "Owner access required" },
        { status: 401 }
      );
    }

    const { baseUrl, key } = getDatabaseSettings();

    // If a staff ID is supplied, return that person's access history.
    const requestedStaffId = request.nextUrl.searchParams.get("staffId");

    if (requestedStaffId !== null) {
      const staffId = Number(requestedStaffId);

      if (
        !Number.isInteger(staffId) ||
        staffId < 1001 ||
        staffId > 1020
      ) {
        return NextResponse.json(
          { success: false, message: "Invalid staff ID" },
          { status: 400 }
        );
      }

      const historyUrl = new URL(
        `${baseUrl}/rest/v1/staff_access_activity`
      );

      historyUrl.searchParams.set(
        "select",
        "id,staff_id,event_type,occurred_at"
      );
      historyUrl.searchParams.set("staff_id", `eq.${staffId}`);
      historyUrl.searchParams.set("order", "occurred_at.desc");
      historyUrl.searchParams.set("limit", "100");

      const historyResponse = await fetch(historyUrl.toString(), {
        headers: databaseHeaders(key),
        cache: "no-store",
      });

      if (!historyResponse.ok) {
        const error = await historyResponse.text();
        console.error("Staff access history error:", error);
        throw new Error("Unable to retrieve staff access history");
      }

      const activity = await historyResponse.json();

      return NextResponse.json({
        success: true,
        activity,
      });
    }

    // Existing behaviour: return all staff accounts.
    const response = await fetch(
      `${baseUrl}/rest/v1/staff_accounts?select=staff_id,is_active,pin_hash,created_at,updated_at,last_login_at&order=staff_id.asc`,
      {
        headers: databaseHeaders(key),
        cache: "no-store",
      }
    );

    if (!response.ok) {
      throw new Error("Unable to retrieve staff accounts");
    }

    const accounts = await response.json();

    const staff = accounts.map((account: {
      staff_id: number;
      is_active: boolean;
      pin_hash: string | null;
      created_at: string;
      updated_at: string;
      last_login_at: string | null;
    }) => ({
      staff_id: account.staff_id,
      is_active: account.is_active,
      has_pin: Boolean(account.pin_hash),
      created_at: account.created_at,
      updated_at: account.updated_at,
      last_login_at: account.last_login_at,
    }));

    return NextResponse.json({
      success: true,
      staff,
    });
  } catch (error) {
    console.error("Owners staff GET error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Unable to load staff accounts.",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    if (!(await isOwner(request))) {
      return NextResponse.json(
        { success: false, message: "Owner access required" },
        { status: 401 }
      );
    }

    const body = await request.json();

    const staffId = Number(body.staffId);

    if (
      !Number.isInteger(staffId) ||
      staffId < 1001 ||
      staffId > 1020
    ) {
      return NextResponse.json(
        { success: false, message: "Invalid staff ID" },
        { status: 400 }
      );
    }

    const { baseUrl, key } = getDatabaseSettings();

    const lookupResponse = await fetch(
      `${baseUrl}/rest/v1/staff_accounts?select=staff_id,is_active,pin_hash&staff_id=eq.${staffId}&limit=1`,
      {
        headers: databaseHeaders(key),
        cache: "no-store",
      }
    );

    if (!lookupResponse.ok) {
      throw new Error("Unable to retrieve staff account");
    }

    const accounts = await lookupResponse.json();
    const account = accounts[0];

    if (!account) {
      return NextResponse.json(
        { success: false, message: "Staff account not found" },
        { status: 404 }
      );
    }

    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (body.action === "set_pin") {
      if (
        typeof body.pin !== "string" ||
        !/^\d{4,8}$/.test(body.pin)
      ) {
        return NextResponse.json(
          {
            success: false,
            message: "PIN must contain between 4 and 8 digits.",
          },
          { status: 400 }
        );
      }

      update.pin_hash = await hashPin(body.pin);
      update.is_active = true;
    } else if (body.action === "activate") {
      if (!account.pin_hash) {
        return NextResponse.json(
          {
            success: false,
            message: "Assign a PIN before activating this account.",
          },
          { status: 400 }
        );
      }

      update.is_active = true;
    } else if (body.action === "deactivate") {
      update.is_active = false;
    } else {
      return NextResponse.json(
        { success: false, message: "Invalid staff action" },
        { status: 400 }
      );
    }

    const updateResponse = await fetch(
      `${baseUrl}/rest/v1/staff_accounts?staff_id=eq.${staffId}`,
      {
        method: "PATCH",
        headers: {
          ...databaseHeaders(key),
          Prefer: "return=minimal",
        },
        body: JSON.stringify(update),
        cache: "no-store",
      }
    );

    if (!updateResponse.ok) {
      throw new Error("Unable to update staff account");
    }

    return NextResponse.json({
      success: true,
      message:
        body.action === "set_pin"
          ? "PIN saved and staff account activated."
          : body.action === "activate"
            ? "Staff account activated."
            : "Staff account deactivated.",
    });
  } catch (error) {
    console.error("Owners staff PATCH error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Unable to update staff account.",
      },
      { status: 500 }
    );
  }
}
