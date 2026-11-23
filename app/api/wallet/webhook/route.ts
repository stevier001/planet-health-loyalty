
import * as crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// Approved Planet Health wallet top-up variants.
// Amounts are stored in pence, never taken from the browser.
const WALLET_TOP_UPS: Record<string, number> = {
  "60663988191577": 1000,
  "60663988224345": 2000,
  "60663988257113": 3000,
  "60663988289881": 4000,
  "60663988322649": 5000,
  "60663988355417": 10000,
};

function verifyShopifyWebhook(
  rawBody: string,
  signature: string | null
): boolean {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;

  if (!secret || !signature) {
    console.error("WALLET WEBHOOK: Missing signing secret or signature");
    return false;
  }

  const calculated = crypto
    .createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("base64");

  const suppliedBuffer = Buffer.from(signature, "base64");
  const expectedBuffer = Buffer.from(calculated, "base64");

  return (
    suppliedBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)
  );
}

function normaliseShopDomain(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");
}

export async function POST(request: NextRequest) {
  try {
    // 1. Read the original request body.
    const rawBody = await request.text();

    // 2. Verify Shopify's webhook signature.
    const signature = request.headers.get(
      "x-shopify-hmac-sha256"
    );

    if (!verifyShopifyWebhook(rawBody, signature)) {
      return NextResponse.json(
        { success: false, message: "Invalid webhook signature" },
        { status: 401 }
      );
    }

    // 3. Verify the Shopify store.
    const shopDomain = request.headers.get(
      "x-shopify-shop-domain"
    );

    const configuredShop = process.env.SHOPIFY_SHOP;

    if (
      !shopDomain ||
      !configuredShop ||
      normaliseShopDomain(shopDomain) !==
        normaliseShopDomain(configuredShop)
    ) {
      return NextResponse.json(
        { success: false, message: "Invalid Shopify store" },
        { status: 401 }
      );
    }

    // 4. Only process successful paid orders.
    const topic = request.headers.get("x-shopify-topic");

    if (topic !== "orders/paid") {
      return NextResponse.json({
        success: true,
        ignored: true,
        message: "Webhook topic not applicable",
      });
    }

    // 5. Read the paid order.
    let order: any;

    try {
      order = JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        { success: false, message: "Invalid order payload" },
        { status: 400 }
      );
    }

    if (
      order.financial_status !== "paid" ||
      order.currency !== "GBP"
    ) {
      return NextResponse.json({
        success: true,
        ignored: true,
        message: "Order is not a paid GBP order",
      });
    }

    const orderId = String(order.id || "");

    if (!/^\d+$/.test(orderId)) {
      return NextResponse.json(
        { success: false, message: "Invalid order ID" },
        { status: 400 }
      );
    }

    // 6. Identify the Shopify customer.
    const customerId = String(order.customer?.id || "");

    if (!/^\d+$/.test(customerId)) {
      console.warn(
        "WALLET WEBHOOK: Paid order has no valid customer ID",
        orderId
      );

      return NextResponse.json({
        success: true,
        ignored: true,
        message: "No registered Shopify customer",
      });
    }

    const customerGid =
      `gid://shopify/Customer/${customerId}`;

    // 7. Find approved wallet top-up variants.
    const lineItems = Array.isArray(order.line_items)
      ? order.line_items
      : [];

    const topUps = lineItems
      .map((item: any) => {
        const variantId = String(item.variant_id || "");
        const unitAmount = WALLET_TOP_UPS[variantId];

        const quantity = Number(item.quantity);
        const lineItemId = String(item.id || "");

        if (
          !unitAmount ||
          !/^\d+$/.test(lineItemId) ||
          !Number.isInteger(quantity) ||
          quantity < 1
        ) {
          return null;
        }

        const amountPence = unitAmount * quantity;

        if (
          !Number.isSafeInteger(amountPence) ||
          amountPence > 1000000
        ) {
          return null;
        }

        return {
          lineItemId,
          unitAmount,
          quantity,
          amountPence,
        };
      })
      .filter(Boolean);

    if (topUps.length === 0) {
      return NextResponse.json({
        success: true,
        ignored: true,
        message: "No approved wallet top-ups found",
      });
    }

    // 8. Connect to Supabase.
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      throw new Error("Supabase settings are missing");
    }

    const baseUrl = supabaseUrl.replace(/\/$/, "");

    const processedTransactions = [];

    // 9. Credit each approved top-up through the existing
    //    central wallet transaction function.
    for (const topUp of topUps) {
      if (!topUp) continue;

      const idempotencyKey =
        `shopify-order-${orderId}-line-${topUp.lineItemId}`;

      const reference =
        `PH-SHOPIFY-${orderId}-${topUp.lineItemId}`;

      const walletResponse = await fetch(
        `${baseUrl}/rest/v1/rpc/process_wallet_transaction`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            p_customer_id: customerGid,
            p_transaction_type: "credit",
            p_amount_pence: topUp.amountPence,
            p_description:
              `Planet Wallet top-up (£${(
                topUp.amountPence / 100
              ).toFixed(2)}) - Shopify order #${order.name || orderId}`,
            p_reference: reference,
            p_idempotency_key: idempotencyKey,
            p_created_by: "shopify_checkout",
          }),
          cache: "no-store",
        }
      );

      const walletData = await walletResponse.json();

      if (
        !walletResponse.ok ||
        walletData?.success !== true
      ) {
        console.error(
          "WALLET WEBHOOK: Supabase transaction failed",
          {
            orderId,
            lineItemId: topUp.lineItemId,
            error: walletData,
          }
        );

        throw new Error(
          "Could not process wallet top-up"
        );
      }

      processedTransactions.push({
        lineItemId: topUp.lineItemId,
        amountPence: topUp.amountPence,
        transactionId: walletData.transaction_id,
        duplicate: walletData.duplicate === true,
        balancePence: walletData.balance_pence,
      });
    }

    // 10. Confirm successful processing.
    console.log(
      "WALLET WEBHOOK: Order processed successfully",
      {
        orderId,
        customerGid,
        transactions: processedTransactions.length,
      }
    );

    return NextResponse.json({
      success: true,
      orderId,
      customerId: customerGid,
      transactions: processedTransactions,
    });
  } catch (error) {
    console.error("WALLET WEBHOOK ERROR:", error);

    // Non-2xx response allows Shopify to retry failed delivery.
    return NextResponse.json(
      {
        success: false,
        message: "Wallet top-up processing failed",
      },
      { status: 500 }
    );
  }
}
