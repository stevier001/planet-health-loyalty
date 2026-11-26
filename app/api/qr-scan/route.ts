
import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    // Verify the existing staff session.
    const session = request.cookies.get("staff_session")?.value;
    const secret = process.env.STAFF_SESSION_SECRET;

    if (!session || !secret) {
      return NextResponse.json(
        { success: false, message: "Staff access required" },
        { status: 401 }
      );
    }

    const [expires, signature] = session.split(".");

    if (!expires || !signature || !/^\d+$/.test(expires)) {
      return NextResponse.json(
        { success: false, message: "Invalid staff session" },
        { status: 401 }
      );
    }

    if (Date.now() > Number(expires)) {
      return NextResponse.json(
        { success: false, message: "Staff session expired" },
        { status: 401 }
      );
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
      return NextResponse.json(
        { success: false, message: "Invalid staff session" },
        { status: 401 }
      );
    }

    // Check the scanned Shopify customer ID.
    const body = await request.json();
    const customerId = body.customer_id;

    if (
      typeof customerId !== "string" ||
      !/^gid:\/\/shopify\/Customer\/\d+$/.test(customerId)
    ) {
      return NextResponse.json(
        { success: false, message: "Invalid customer ID" },
        { status: 400 }
      );
    }

    // Connect to Supabase.
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      throw new Error("Supabase settings are missing");
    }

    // Record the QR scan only. No stamp is awarded here.
    const activityResponse = await fetch(
      `${supabaseUrl.replace(/\/$/, "")}/rest/v1/loyalty_activity`,
      {
        method: "POST",
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          customer_id: customerId,
          event_type: "qr_scan",
          metadata: {
            source: "staff_portal",
          },
        }),
        cache: "no-store",
      }
    );

    if (!activityResponse.ok) {
      const error = await activityResponse.text();
      console.error("QR scan logging error:", error);
      throw new Error("Unable to record QR scan");
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("QR scan API error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Unable to record QR scan",
      },
      { status: 500 }
    );
  }
}
