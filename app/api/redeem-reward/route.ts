
import { NextRequest, NextResponse } from "next/server";
import { verifyStaffSession } from "../../../lib/staff-auth";

export const runtime = "nodejs";

async function recordRedemption(
  customerId: string,
  stampsBefore: number
) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error("Supabase environment variables are missing");
    return;
  }

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
        body: JSON.stringify({
          customer_id: customerId,
          event_type: "reward_redeemed",
          metadata: {
            stamps_before: stampsBefore,
            stamps_after: 0,
            source: "staff_portal",
          },
        }),
        cache: "no-store",
      }
    );

    if (!response.ok) {
      console.error(
        "Redemption activity logging failed:",
        await response.text()
      );
    }
  } catch (error) {
    console.error("Redemption activity logging error:", error);
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

    const body = await request.json();
    const customerId = body.customerId;

    if (
      typeof customerId !== "string" ||
      !/^gid:\/\/shopify\/Customer\/\d+$/.test(customerId)
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

    // Check the customer's current stamp balance.
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

    const stampsBefore = Math.max(
      0,
      Number(
        customerData.data.customer.metafield?.value || 0
      ) || 0
    );

    if (stampsBefore < 6) {
      return NextResponse.json(
        {
          success: false,
          message: "This customer has not unlocked a reward.",
          stamps: stampsBefore,
        },
        { status: 400 }
      );
    }

    // Reset the Shopify stamp balance after redemption.
    const saveResponse = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        query: `
          mutation ResetCustomerStamps(
            $metafields: [MetafieldsSetInput!]!
          ) {
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
              value: "0",
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
      throw new Error("Unable to reset customer stamps");
    }

    // Record redemption after Shopify confirms the reset.
    await recordRedemption(customerId, stampsBefore);

    return NextResponse.json({
      success: true,
      stamps: 0,
      message: "Reward redeemed successfully. Stamp card reset.",
    });
  } catch (error) {
    console.error("Redemption API error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Unable to redeem reward. Please try again.",
      },
      { status: 500 }
    );
  }
}
