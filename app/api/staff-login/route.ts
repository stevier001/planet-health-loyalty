import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const { pin } = await request.json();

    const staffPin = process.env.STAFF_PIN;
    const sessionSecret = process.env.STAFF_SESSION_SECRET;

    if (!staffPin || !sessionSecret) {
      return NextResponse.json(
        { success: false, message: "Staff login is not configured" },
        { status: 500 }
      );
    }

    if (typeof pin !== "string") {
      return NextResponse.json(
        { success: false, message: "Please enter your PIN" },
        { status: 400 }
      );
    }

    const submitted = Buffer.from(pin);
    const correct = Buffer.from(staffPin);

    if (
      submitted.length !== correct.length ||
      !timingSafeEqual(submitted, correct)
    ) {
      return NextResponse.json(
        { success: false, message: "Incorrect PIN" },
        { status: 401 }
      );
    }

    const expires = Date.now() + 8 * 60 * 60 * 1000;

    const signature = createHmac("sha256", sessionSecret)
      .update(String(expires))
      .digest("hex");

    const response = NextResponse.json({ success: true });

    response.cookies.set("staff_session", `${expires}.${signature}`, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 8 * 60 * 60,
    });

    return response;
  } catch {
    return NextResponse.json(
      { success: false, message: "Unable to process login" },
      { status: 400 }
    );
  }
}
