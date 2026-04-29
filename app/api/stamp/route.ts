// update

import { NextResponse } from "next/server";

export async function GET(req: any) {
  try {
    const { searchParams } = new URL(req.url);
    const cid = searchParams.get("cid");

    if (!cid) {
      return NextResponse.json({ error: "Missing customer id" }, { status: 400 });
    }

    const shop = process.env.SHOPIFY_SHOP;
    const token = process.env.SHOPIFY_ADMIN_TOKEN;

    if (!shop || !token) {
      return NextResponse.json({ error: "Missing Shopify config" }, { status: 500 });
    }

    const metafieldRes = await fetch(
      `https://${shop}/admin/api/2024-01/customers/${cid}/metafields.json`,
      {
        headers: {
          "X-Shopify-Access-Token": token,
        },
      }
    );

    const metafieldsData = await metafieldRes.json();

    const stampsField = metafieldsData.metafields?.find(
      (m: any) => m.namespace === "loyalty" && m.key === "stamps"
    );

    const currentStamps = stampsField ? parseInt(stampsField.value) : 0;
    const newStamps = currentStamps + 1;

    const updateRes = await fetch(
      `https://${shop}/admin/api/2024-01/customers/${cid}/metafields.json`,
      {
        method: "POST",
        headers: {
          "X-Shopify-Access-Token": token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          metafield: {
            namespace: "loyalty",
            key: "stamps",
            type: "number_integer",
            value: newStamps,
          },
        }),
      }
    );

    if (!updateRes.ok) {
      const err = await updateRes.text();
      throw new Error(err);
    }

    return NextResponse.json({
      success: true,
      customerId: cid,
      previousStamps: currentStamps,
      newStamps,
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
