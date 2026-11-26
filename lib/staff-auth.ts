
import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";

export const STAFF_SESSION_DURATION = 8 * 60 * 60 * 1000;

/**
 * Retrieves and verifies the staff ID from an individual staff session.
 *
 * New session format:
 * v1.staffId.expiry.nonce.signature
 */
export function getStaffId(request: NextRequest): number | null {
  try {
    const session = request.cookies.get("staff_session")?.value;
    const secret = process.env.STAFF_SESSION_SECRET;

    if (!session || !secret) return null;

    const parts = session.split(".");

    if (parts.length !== 5) return null;

    const [version, staffIdString, expiryString, nonce, signature] =
      parts;

    if (
      version !== "v1" ||
      !/^\d{4}$/.test(staffIdString) ||
      !/^\d+$/.test(expiryString) ||
      !/^[a-f0-9]{64}$/.test(nonce) ||
      !/^[a-f0-9]{64}$/.test(signature)
    ) {
      return null;
    }

    const staffId = Number(staffIdString);
    const expires = Number(expiryString);

    if (
      staffId < 1001 ||
      staffId > 1020 ||
      !Number.isSafeInteger(expires) ||
      expires <= Date.now() ||
      expires > Date.now() + STAFF_SESSION_DURATION
    ) {
      return null;
    }

    const payload = `staff:v1:${staffId}:${expires}:${nonce}`;

    const expected = createHmac("sha256", secret)
      .update(payload)
      .digest();

    const received = Buffer.from(signature, "hex");

    if (
      received.length !== expected.length ||
      !timingSafeEqual(received, expected)
    ) {
      return null;
    }

    return staffId;
  } catch {
    return null;
  }
}

/**
 * Verifies a staff session.
 *
 * Individual sessions are preferred.
 * Legacy shared-PIN sessions remain temporarily valid
 * so the existing portal is not interrupted during migration.
 */
export function verifyStaffSession(request: NextRequest): boolean {
  if (getStaffId(request) !== null) {
    return true;
  }

  // Temporary compatibility with the old shared-PIN session.
  try {
    const session = request.cookies.get("staff_session")?.value;
    const secret = process.env.STAFF_SESSION_SECRET;

    if (!session || !secret) return false;

    const parts = session.split(".");

    if (parts.length !== 2) return false;

    const [expires, signature] = parts;

    if (
      !expires ||
      !signature ||
      !/^\d+$/.test(expires) ||
      !/^[a-f0-9]{64}$/.test(signature)
    ) {
      return false;
    }

    if (Date.now() > Number(expires)) {
      return false;
    }

    const expected = createHmac("sha256", secret)
      .update(expires)
      .digest();

    const received = Buffer.from(signature, "hex");

    return (
      received.length === expected.length &&
      timingSafeEqual(received, expected)
    );
  } catch {
    return false;
  }
}

export function unauthorizedResponse() {
  return NextResponse.json(
    { success: false, message: "Staff login required" },
    { status: 401 }
  );
}
