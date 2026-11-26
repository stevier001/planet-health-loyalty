
import { NextRequest, NextResponse } from "next/server";
import {
  verifyStaffSession,
  getStaffId,
} from "../../../lib/staff-auth";

export const runtime = "nodejs";

async function recordActivity(
  customerId: string,
  stamps: number,
  staffId: number | null,
  eventTypes: string[]
) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error("Supabase environment variables are missing");
    return;
  }

  const rows = eventTypes.map((eventType) => ({
    customer_id: customerId,
    event_type: eventType,
    metadata: {
      stamps,
      staff_id: staffId,
      source: "staff_portal",
    },
  }));

  try {
    const response = await fetch(
      `${supabaseUrl.replace(/\/$/, "")}/rest/v1/loyalty_activity`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          Prefer: "return=minimal",
        },
        body: JSON.stringify(rows),
        cache: "no-store",
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error("Supabase activity logging failed:", error);
    }
  } catch (error) {
    console.error("Supabase activity logging error:", error);
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!verifyStaffSession(request)) {
      return NextResponse.json(
        { success: false, message: "Staff access required" },
        { status: 401 }
      );
    }

    const staffId = getStaffId(request);

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
      Number(customerData.data.customer.metafield?.value || 0) || 0
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

    // Record the successful activity in Supabase.
    // Shopify remains the source of truth for stamp balances.
    const events = ["stamp_awarded"];

    if (newStamps === 6) {
      events.push("reward_unlocked");
    }

    await recordActivity(customerId, newStamps, staffId, events);

    return NextResponse.json({
      success: true,
      stamps: newStamps,
      reward: newStamps >= 6,
      message:
        newStamps >= 6
          ? "Reward unlocked!"
          : "Stamp successfully added.",
    });
  } catch (error) {
    console.error("Stamp API error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Unable to add stamp. Please try again.",
      },
      { status: 500 }
    );
  }
}
