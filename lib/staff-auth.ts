import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";

export function verifyStaffSession(request: NextRequest): boolean {
  const session = request.cookies.get("staff_session")?.value;
  const secret = process.env.STAFF_SESSION_SECRET;

  if (!session || !secret) {
    return false;
  }

  const [expires, signature] = session.split(".");

  if (!expires || !signature || !/^\d+$/.test(expires)) {
    return false;
  }

  if (Date.now() > Number(expires)) {
    return false;
  }

  const expected = createHmac("sha256", secret)
    .update(expires)
    .digest("hex");

  const receivedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (
    receivedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(receivedBuffer, expectedBuffer)
  ) {
    return false;
  }

  return true;
}

export function unauthorizedResponse() {
  return NextResponse.json(
    { success: false, message: "Staff login required" },
    { status: 401 }
  );
}
