import { NextResponse } from "next/server";

export async function GET() {
  try {
    const shop = process.env.SHOPIFY_SHOP;
    const clientId = process.env.SHOPIFY_API_KEY;
    const clientSecret = process.env.SHOPIFY_API_SECRET;

    if (!shop || !clientId || !clientSecret) {
      return NextResponse.json(
        { success: false, message: "Shopify environment variables are missing" },
        { status: 500 }
      );
    }

    const tokenResponse = await fetch(
      `https://${shop}/admin/oauth/access_token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: "client_credentials",
        }),
        cache: "no-store",
      }
    );

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok || !tokenData.access_token) {
      return NextResponse.json(
        {
          success: false,
          message: "Shopify authentication failed",
          status: tokenResponse.status,
        },
        { status: 401 }
      );
    }

    const shopResponse = await fetch(
      `https://${shop}/admin/api/2026-04/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": tokenData.access_token,
        },
        body: JSON.stringify({
          query: "{ shop { name } }",
        }),
        cache: "no-store",
      }
    );

    const shopData = await shopResponse.json();

    if (!shopResponse.ok || shopData.errors) {
      return NextResponse.json(
        { success: false, message: "Authenticated, but Shopify API query failed" },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Connected to Shopify successfully",
      shop: shopData.data.shop.name,
    });
  } catch {
    return NextResponse.json(
      { success: false, message: "Connection error" },
      { status: 500 }
    );
  }
}
