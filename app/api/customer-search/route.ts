
import { NextRequest, NextResponse } from "next/server";
import { verifyStaffSession } from "../../../lib/staff-auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    if (!verifyStaffSession(request)) {
      return NextResponse.json(
        { success: false, message: "Staff access required" },
        { status: 401 }
      );
    }

    const term = request.nextUrl.searchParams.get("q")?.trim();

    if (!term || term.length < 2 || term.length > 100) {
      return NextResponse.json(
        { success: false, message: "Enter at least 2 characters" },
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

    let graphqlQuery: string;
    let variables: Record<string, string>;

    // QR code / numeric Shopify customer ID lookup
    if (/^\d+$/.test(term)) {
      graphqlQuery = `
        query SearchCustomerById($id: ID!) {
          node(id: $id) {
            ... on Customer {
              id
              firstName
              lastName
              email
              metafield(namespace: "loyalty", key: "stamps") {
                value
              }
            }
          }
        }
      `;

      variables = {
        id: `gid://shopify/Customer/${term}`,
      };
    } else {
      // Normal name or email search
      const searchTerm = term
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"');

      const searchQuery = term.includes("@")
        ? `email:${searchTerm}`
        : `first_name:${searchTerm}* OR last_name:${searchTerm}* OR email:${searchTerm}`;

      graphqlQuery = `
        query SearchCustomers($query: String!) {
          customers(first: 10, query: $query) {
            nodes {
              id
              firstName
              lastName
              email
              metafield(namespace: "loyalty", key: "stamps") {
                value
              }
            }
          }
        }
      `;

      variables = { query: searchQuery };
    }

    const shopifyResponse = await fetch(
      `https://${shop}/admin/api/2026-04/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": tokenData.access_token,
        },
        body: JSON.stringify({
          query: graphqlQuery,
          variables,
        }),
        cache: "no-store",
      }
    );

    const result = await shopifyResponse.json();

    if (!shopifyResponse.ok || result.errors) {
      throw new Error("Customer search failed");
    }

    const foundCustomers = /^\d+$/.test(term)
      ? result.data?.node
        ? [result.data.node]
        : []
      : result.data?.customers?.nodes || [];

    const customers = foundCustomers.map((customer: any) => ({
      id: customer.id,
      firstName: customer.firstName || "",
      lastName: customer.lastName || "",
      email: customer.email || "",
      stamps: Math.min(
        6,
        Math.max(0, Number(customer.metafield?.value || 0) || 0)
      ),
    }));

    return NextResponse.json({
      success: true,
      customers,
    });
  } catch {
    return NextResponse.json(
      {
        success: false,
        message: "Unable to search Shopify customers",
      },
      { status: 500 }
    );
  }
}
