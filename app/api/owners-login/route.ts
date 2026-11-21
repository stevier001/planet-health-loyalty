
import { NextRequest, NextResponse } from "next/server";
import { createHmac, randomBytes } from "crypto";

export const runtime = "nodejs";

const SESSION_DURATION = 60 * 60 * 8;

function createOwnerToken(secret: string): string {
  const expires = Math.floor(Date.now() / 1000) + SESSION_DURATION;
  const nonce = randomBytes(32).toString("hex");

  const payload = `owners:v1:${expires}:${nonce}`;

  const signature = createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  return `v1.${expires}.${nonce}.${signature}`;
}

export async function POST(request: NextRequest) {
  try {
    const { pin } = await request.json();

    const correctPin = process.env.OWNERS_PIN;
    const sessionSecret = process.env.STAFF_SESSION_SECRET;

    if (!correctPin || !sessionSecret) {
      return NextResponse.json(
        { success: false, message: "Login settings are missing" },
        { status: 500 }
      );
    }

    if (typeof pin !== "string" || pin !== correctPin) {
      return NextResponse.json(
        { success: false, message: "Incorrect PIN" },
        { status: 401 }
      );
    }

    const token = createOwnerToken(sessionSecret);

    const response = NextResponse.json({ success: true });

    response.cookies.set("owners_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: SESSION_DURATION,
    });

    return response;
  } catch {
    return NextResponse.json(
      { success: false, message: "Unable to log in" },
      { status: 500 }
    );
  }
}
