import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const cid = url.searchParams.get("cid");

  return NextResponse.json({
    success: true,
    customer_id: cid
  });
}
