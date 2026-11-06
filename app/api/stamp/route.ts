
import { NextRequest, NextResponse } from "next/server";
import { verifyStaffSession } from "@/lib/staff-auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    // Only authenticated staff can award stamps.
    if (!verifyStaffSession(request)) {
      return NextResponse.json(
        { success: false, message: "Staff access required" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const customerId = body.customerId;

    if (
      typeof customerId !== "string" ||
      !customerId.startsWith("gid://shopify/Customer/")
    ) {
      return NextResponse.json(
        { success: false, message: "Invalid customer ID" },
        { status: 400 }
      );
    }

    const shop = process.env.SHOPIFY_SHOP;
    const clientId = process.env.SHOPIFY_API_KEY;
    const clientSecret = process.env.SHOPIFY_API_SECRET;

    if (!shop || !clientId || !clientSecret) {
      throw new Error("Shopify settings are missing");
    }

    // Get a Shopify access token.
    const tokenResponse = await fetch(
      `https://${shop}/admin/oauth/access_token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
      throw new Error("Shopify authentication failed");
    }

    const endpoint =
      `https://${shop}/admin/api/2026-04/graphql.json`;

    const headers = {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": tokenData.access_token,
    };

    // Retrieve the customer's current stamp count.
    const customerResponse = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        query: `
          query GetCustomerStamps($id: ID!) {
            customer(id: $id) {
              id
              metafield(namespace: "loyalty", key: "stamps") {
                value
              }
            }
          }
        `,
        variables: { id: customerId },
      }),
      cache: "no-store",
    });

    const customerData = await customerResponse.json();

    if (
      !customerResponse.ok ||
      customerData.errors ||
      !customerData.data?.customer
    ) {
      throw new Error("Unable to retrieve customer");
    }

    const currentStamps = Math.max(
      0,
      Number(
        customerData.data.customer.metafield?.value || 0
      ) || 0
    );

    if (currentStamps >= 6) {
      return NextResponse.json({
        success: false,
        message: "This customer has already reached 6 stamps.",
        stamps: 6,
        reward: true,
      });
    }

    const newStamps = currentStamps + 1;

    // Save the new stamp count to Shopify.
    const saveResponse = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        query: `
          mutation SaveCustomerStamp($metafields: [MetafieldsSetInput!]!) {
            metafieldsSet(metafields: $metafields) {
              metafields {
                value
              }
              userErrors {
                field
                message
              }
            }
          }
        `,
        variables: {
          metafields: [
            {
              ownerId: customerId,
              namespace: "loyalty",
              key: "stamps",
              type: "number_integer",
              value: String(newStamps),
            },
          ],
        },
      }),
      cache: "no-store",
    });

    const saveData = await saveResponse.json();

    if (
      !saveResponse.ok ||
      saveData.errors ||
      saveData.data?.metafieldsSet?.userErrors?.length
    ) {
      throw new Error("Unable to save customer stamp");
    }

    return NextResponse.json({
      success: true,
      stamps: newStamps,
      reward: newStamps >= 6,
      message:
        newStamps >= 6
          ? "Reward unlocked!"
          : "Stamp successfully added.",
    });
  } catch {
    return NextResponse.json(
      {
        success: false,
        message: "Unable to add stamp. Please try again.",
      },
      { status: 500 }
    );
  }
}
