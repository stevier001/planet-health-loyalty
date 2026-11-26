
import { NextRequest, NextResponse } from "next/server";
import { getStaffId } from "../../../lib/staff-auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const staffId = getStaffId(request);

    // Record the logout before clearing the staff session.
    if (staffId !== null) {
      const supabaseUrl = process.env.SUPABASE_URL;
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      if (supabaseUrl && serviceKey) {
        try {
          const activityResponse = await fetch(
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
                event_type: "logout",
              }),
              cache: "no-store",
            }
          );

          if (!activityResponse.ok) {
            console.error(
              "Staff logout logging failed:",
              await activityResponse.text()
            );
          }
        } catch (error) {
          console.error("Staff logout logging error:", error);
        }
      } else {
        console.error("Supabase environment settings are missing");
      }
    }

    // Clear the staff session as before.
    const response = NextResponse.json({ success: true });

    response.cookies.set("staff_session", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 0,
    });

    return response;
  } catch (error) {
    console.error("Staff logout error:", error);

    // Still clear the cookie if an unexpected error occurs.
    const response = NextResponse.json({ success: true });

    response.cookies.set("staff_session", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 0,
    });

    return response;
  }
}
