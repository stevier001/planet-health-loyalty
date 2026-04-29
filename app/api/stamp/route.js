import { NextResponse } from "next/server";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const cid = searchParams.get("cid");

    if (!cid) {
      return NextResponse.json(
        { error: "Missing customer id" },
        { status: 400 }
      );
    }

    const token = process.env.SHOPIFY_ADMIN_TOKEN;

    if (!token) {
      return NextResponse.json(
        { error: "Missing Shopify token" },
        { status: 500 }
      );
    }

    // TEMP: we are not calling Shopify yet (safe placeholder)
    return NextResponse.json({
      success: true,
      message: `Ready to stamp customer ${cid}`,
    });

  } catch (err: any) {
    return NextResponse.json(
      {
        error: "Server error",
        details: err.message,
      },
      { status: 500 }
    );
  }
}
