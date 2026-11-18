
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

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

    const response = NextResponse.json({ success: true });

    response.cookies.set("owners_session", sessionSecret, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 60 * 60 * 8,
    });

    return response;
  } catch {
    return NextResponse.json(
      { success: false, message: "Unable to log in" },
      { status: 500 }
    );
  }
}
