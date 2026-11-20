
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

type EventType =
  | "qr_scan"
  | "stamp_awarded"
  | "reward_unlocked"
  | "reward_redeemed";

const EVENT_TYPES: EventType[] = [
  "qr_scan",
  "stamp_awarded",
  "reward_unlocked",
  "reward_redeemed",
];

function getMonday(date: Date) {
  const result = new Date(date);
  result.setUTCHours(0, 0, 0, 0);

  const day = result.getUTCDay();
  const daysSinceMonday = (day + 6) % 7;

  result.setUTCDate(result.getUTCDate() - daysSinceMonday);

  return result;
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function buildBuckets(
  period: "daily" | "weekly" | "monthly",
  now: Date
) {
  const count =
    period === "daily" ? 30 : 12;

  const buckets = [];

  for (let i = count - 1; i >= 0; i--) {
    let date: Date;
    let key: string;
    let label: string;

    if (period === "daily") {
      date = new Date(now);
      date.setUTCHours(0, 0, 0, 0);
      date.setUTCDate(date.getUTCDate() - i);

      key = dateKey(date);
      label = date.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      });
    } else if (period === "weekly") {
      date = getMonday(now);
      date.setUTCDate(date.getUTCDate() - i * 7);

      key = dateKey(date);
      label = date.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      });
    } else {
      date = new Date(
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth() - i,
          1
        )
      );

      key = `${date.getUTCFullYear()}-${String(
        date.getUTCMonth() + 1
      ).padStart(2, "0")}`;

      label = date.toLocaleDateString("en-GB", {
        month: "short",
        year: "2-digit",
        timeZone: "UTC",
      });
    }

    buckets.push({
      key,
      label,
      qr_scan: 0,
      stamp_awarded: 0,
      reward_unlocked: 0,
      reward_redeemed: 0,
    });
  }

  return buckets;
}

function getEventBucketKey(
  date: Date,
  period: "daily" | "weekly" | "monthly"
) {
  if (period === "daily") {
    return dateKey(date);
  }

  if (period === "weekly") {
    return dateKey(getMonday(date));
  }

  return `${date.getUTCFullYear()}-${String(
    date.getUTCMonth() + 1
  ).padStart(2, "0")}`;
}

function createActivitySummary(
  records: ActivityRecord[],
  now: Date,
  period: "daily" | "weekly" | "monthly"
) {
  const buckets = buildBuckets(period, now);
  const bucketLookup = new Map(
    buckets.map((bucket) => [bucket.key, bucket])
  );

  for (const record of records) {
    if (!EVENT_TYPES.includes(record.event_type as EventType)) {
      continue;
    }

    const eventDate = new Date(record.created_at);

    if (Number.isNaN(eventDate.getTime())) {
      continue;
    }

    const key = getEventBucketKey(eventDate, period);
    const bucket = bucketLookup.get(key);

    if (bucket) {
      bucket[record.event_type as EventType]++;
    }
  }

  return buckets.map(({ key, ...bucket }) => bucket);
}

async function getLifetimeCount(
  supabaseUrl: string,
  serviceKey: string,
  eventType: string
) {
  const response = await fetch(
    `${supabaseUrl.replace(/\/$/, "")}/rest/v1/loyalty_activity?select=id&event_type=eq.${eventType}`,
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

  if (!response.ok) {
    throw new Error(`Unable to retrieve ${eventType} total`);
  }

  const range = response.headers.get("content-range");

  if (!range) {
    throw new Error(`Unable to read ${eventType} count`);
  }

  const total = Number(range.split("/")[1]);

  if (!Number.isFinite(total)) {
    throw new Error(`Invalid ${eventType} count`);
  }

  return total;
}

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

    const baseUrl = supabaseUrl.replace(/\/$/, "");

    // Get the latest 100 events for the recent activity list.
    const activityResponse = await fetch(
      `${baseUrl}/rest/v1/loyalty_activity?select=customer_id,event_type,created_at,metadata&order=created_at.desc&limit=100`,
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
      throw new Error("Unable to retrieve recent loyalty activity");
    }

    const activity: ActivityRecord[] =
      await activityResponse.json();

    // Get all activity from the last 12 months for reporting.
    const now = new Date();

    const twelveMonthsAgo = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth() - 11,
        1
      )
    );

    const reportParams = new URLSearchParams({
      select: "event_type,created_at",
      created_at: `gte.${twelveMonthsAgo.toISOString()}`,
      event_type: "in.(qr_scan,stamp_awarded,reward_unlocked,reward_redeemed)",
      order: "created_at.asc",
    });

    const reportRecords: ActivityRecord[] = [];
    let reportOffset = 0;
    const pageSize = 1000;

    while (true) {
      const reportResponse = await fetch(
        `${baseUrl}/rest/v1/loyalty_activity?${reportParams.toString()}`,
        {
          method: "GET",
          headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            Range: `${reportOffset}-${reportOffset + pageSize - 1}`,
          },
          cache: "no-store",
        }
      );

      if (!reportResponse.ok) {
        throw new Error("Unable to retrieve activity reporting data");
      }

      const page: ActivityRecord[] = await reportResponse.json();

      reportRecords.push(...page);

      if (page.length < pageSize) {
        break;
      }

      reportOffset += pageSize;
    }

    // Create daily, weekly and monthly activity summaries.
    const activitySummary = {
      daily: createActivitySummary(reportRecords, now, "daily"),
      weekly: createActivitySummary(reportRecords, now, "weekly"),
      monthly: createActivitySummary(reportRecords, now, "monthly"),
    };

    // Lifetime totals.
    const [totalStampsAwarded, totalQrScans] = await Promise.all([
      getLifetimeCount(baseUrl, serviceKey, "stamp_awarded"),
      getLifetimeCount(baseUrl, serviceKey, "qr_scan"),
    ]);

    // Match recent activity with Shopify customer details.
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
      totalQrScans,
      activitySummary,
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
