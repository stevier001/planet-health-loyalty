
import { NextRequest, NextResponse } from "next/server";
import { getStaffId } from "../../../lib/staff-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    // Verify the individual staff session.
    const staffId = getStaffId(request);

    if (staffId === null) {
      return NextResponse.json(
        { success: false, message: "Staff access required" },
        { status: 401 }
      );
    }

    // Connect to Supabase.
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      throw new Error("Supabase settings are missing");
    }

    const supabaseHeaders = {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    };

    // Confirm that this staff account is still active.
    const staffCheckUrl = new URL(
      `${supabaseUrl.replace(/\/$/, "")}/rest/v1/staff_accounts`
    );

    staffCheckUrl.searchParams.set("staff_id", `eq.${staffId}`);
    staffCheckUrl.searchParams.set("select", "is_active");
    staffCheckUrl.searchParams.set("limit", "1");

    const staffResponse = await fetch(staffCheckUrl.toString(), {
      method: "GET",
      headers: supabaseHeaders,
      cache: "no-store",
    });

    if (!staffResponse.ok) {
      console.error(
        "Staff account check error:",
        await staffResponse.text()
      );

      throw new Error("Unable to verify staff account");
    }

    const staffAccounts = await staffResponse.json();

    if (
      !Array.isArray(staffAccounts) ||
      staffAccounts.length === 0 ||
      staffAccounts[0].is_active !== true
    ) {
      return NextResponse.json(
        { success: false, message: "Staff account is inactive" },
        { status: 403 }
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

    // Record the QR scan. No stamp is awarded here.
    const activityResponse = await fetch(
      `${supabaseUrl.replace(/\/$/, "")}/rest/v1/loyalty_activity`,
      {
        method: "POST",
        headers: {
          ...supabaseHeaders,
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          customer_id: customerId,
          event_type: "qr_scan",
          metadata: {
            source: "staff_portal",
            staff_id: staffId,
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

    return NextResponse.json({
      success: true,
      staffId,
    });

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
