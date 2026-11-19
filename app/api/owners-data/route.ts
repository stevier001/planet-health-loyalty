
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type ShopifyCustomer = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  metafield: {
    value: string;
  } | null;
};

type ActivityRecord = {
  customer_id: string;
  event_type: string;
  created_at: string;
  metadata?: {
    stamps?: number;
  };
};

export async function GET(request: NextRequest) {
  try {
    // Owners only — staff cannot access business analytics.
    const ownerSession = request.cookies.get("owners_session")?.value;
    const sessionSecret = process.env.STAFF_SESSION_SECRET;

    if (
      !ownerSession ||
      !sessionSecret ||
      ownerSession !== sessionSecret
    ) {
      return NextResponse.json(
        { success: false, message: "Owner access required" },
        { status: 401 }
      );
    }

    const shop = process.env.SHOPIFY_SHOP;
    const clientId = process.env.SHOPIFY_API_KEY;
    const clientSecret = process.env.SHOPIFY_API_SECRET;

    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!shop || !clientId || !clientSecret) {
      throw new Error("Shopify settings are missing");
    }

    if (!supabaseUrl || !serviceKey) {
      throw new Error("Supabase settings are missing");
    }

    // Get Shopify access token.
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
      throw new Error("Shopify authentication failed");
    }

    const endpoint =
      `https://${shop}/admin/api/2026-04/graphql.json`;

    const headers = {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": tokenData.access_token,
    };

    // Get every Shopify customer and their current stamp balance.
    const customers: ShopifyCustomer[] = [];
    let cursor: string | null = null;
    let hasNextPage = true;

    while (hasNextPage) {
      const customerResponse = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          query: `
            query GetCustomers($after: String) {
              customers(first: 100, after: $after) {
                edges {
                  cursor
                  node {
                    id
                    firstName
                    lastName
                    email
                    metafield(
                      namespace: "loyalty"
                      key: "stamps"
                    ) {
                      value
                    }
                  }
                }
                pageInfo {
                  hasNextPage
                }
              }
            }
          `,
          variables: { after: cursor },
        }),
        cache: "no-store",
      });

      const customerData = await customerResponse.json();

      if (!customerResponse.ok || customerData.errors) {
        throw new Error("Unable to retrieve Shopify customers");
      }

      const connection = customerData.data?.customers;

      if (!connection) {
        throw new Error("Shopify returned no customer data");
      }

      for (const edge of connection.edges) {
        customers.push(edge.node);
      }

      hasNextPage = connection.pageInfo.hasNextPage;

      if (hasNextPage && connection.edges.length > 0) {
        cursor = connection.edges[
          connection.edges.length - 1
        ].cursor;
      } else {
        hasNextPage = false;
      }
    }

    // Prepare customer data for the dashboard.
    const dashboardCustomers = customers.map((customer) => {
      const name = [
        customer.firstName,
        customer.lastName,
      ]
        .filter(Boolean)
        .join(" ");

      return {
        id: customer.id,
        name: name || "Unnamed customer",
        email: customer.email || "",
        stamps: Math.max(
          0,
          Number(customer.metafield?.value || 0) || 0
        ),
      };
    });

    // Get recent loyalty activity from Supabase.
    const activityResponse = await fetch(
      `${supabaseUrl.replace(/\/$/, "")}/rest/v1/loyalty_activity?select=customer_id,event_type,created_at,metadata&order=created_at.desc&limit=100`,
      {
        method: "GET",
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
        },
        cache: "no-store",
      }
    );

    if (!activityResponse.ok) {
      const error = await activityResponse.text();
      console.error("Supabase activity error:", error);
      throw new Error("Unable to retrieve loyalty activity");
    }

    const activity: ActivityRecord[] =
      await activityResponse.json();
// Get the lifetime total of all stamps awarded.
const stampCountResponse = await fetch(
  `${supabaseUrl.replace(/\/$/, "")}/rest/v1/loyalty_activity?select=id&event_type=eq.stamp_awarded`,
  {
    method: "GET",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Prefer: "count=exact",
      Range: "0-0",
    },
    cache: "no-store",
  }
);

if (!stampCountResponse.ok) {
  throw new Error("Unable to retrieve total stamps awarded");
}

const stampCountRange =
  stampCountResponse.headers.get("content-range");

if (!stampCountRange) {
  throw new Error("Unable to read total stamps count");
}

const totalStampsAwarded = Number(
  stampCountRange.split("/")[1]
);
    // Match activity records with Shopify customer details.
    const customerLookup = new Map(
      dashboardCustomers.map((customer) => [
        customer.id,
        customer,
      ])
    );

    const dashboardActivity = activity.map((item) => {
      const customer = customerLookup.get(item.customer_id);

      return {
        ...item,
        customer_name: customer?.name || "Customer",
        customer_email: customer?.email || "",
      };
    });

    return NextResponse.json({
  success: true,
  customers: dashboardCustomers,
  activity: dashboardActivity,
  totalStampsAwarded,
});

  } catch (error) {
    console.error("Owners dashboard API error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Unable to load business data. Please try again.",
      },
      { status: 500 }
    );
  }
}
