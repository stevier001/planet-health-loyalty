import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const session = request.cookies.get("staff_session")?.value;
  const secret = process.env.STAFF_SESSION_SECRET;

  if (!session || !secret) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const [expires, signature] = session.split(".");

  if (!expires || !signature || !/^\d+$/.test(expires)) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  if (Date.now() > Number(expires)) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
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
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  return NextResponse.json({ authenticated: true });
}
