
import { NextRequest, NextResponse } from "next/server";
import { getStaffId } from "../../../../lib/staff-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const staffId = getStaffId(request);

  if (staffId === null) {
    return NextResponse.json(
      { authenticated: false },
      { status: 401 }
    );
  }

  return NextResponse.json({
    authenticated: true,
    staffId,
  });
}
