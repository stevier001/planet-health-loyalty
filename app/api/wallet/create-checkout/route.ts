
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// Approved Planet Health wallet top-up variants.
const WALLET_TOP_UPS: Record<string, number> = {
  "60663988191577": 10,
  "60663988224345": 20,
  "60663988257113": 30,
  "60663988289881": 40,
  "60663988322649": 50,
  "60663988355417": 100,
};

// Your actual Shopify storefront domain.
// Keep checkout on this domain so the customer's
// existing Shopify login session can be retained.
const STORE_URL = "https://planethealthclub.co.uk";

export async function POST(request: NextRequest) {
  try {
    // 1. Read the selected variant.
    const body = await request.json();

    const variantId = String(body.variantId || "");

    // 2. Only allow the six approved top-up options.
    const amount = WALLET_TOP_UPS[variantId];

    if (!amount) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid wallet top-up selection.",
        },
        { status: 400 }
      );
    }

    // 3. Create a Shopify cart permalink.
    // Quantity is always one. The customer cannot
    // supply their own price or credit amount.
    const checkoutUrl =
      `${STORE_URL}/cart/${variantId}:1?checkout`;

    // 4. Return the Shopify checkout URL.
    return NextResponse.json(
      {
        success: true,
        amount,
        variantId,
        checkoutUrl,
      },
      {
        headers: {
          "Cache-Control": "no-store, private",
        },
      }
    );
  } catch (error) {
    console.error("Wallet checkout creation error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Unable to create wallet checkout.",
      },
      { status: 500 }
    );
  }
}
