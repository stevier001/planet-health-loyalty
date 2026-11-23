
import * as crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The exact Shopify product allowed to create wallet credits.
const WALLET_PRODUCT_ID = "16823166435673";

// Approved variants and their fixed wallet credit amounts in pence.
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

// Convert a Shopify decimal price into integer pence without
// relying on floating-point multiplication.
function toPence(value: unknown): number | null {
  const price = String(value ?? "").trim();

  if (!/^\d+(?:\.\d{1,2})?$/.test(price)) {
    return null;
  }

  const parts = price.split(".");
  const pounds = Number(parts[0]);
  const pence = Number((parts[1] || "").padEnd(2, "0"));

  const result = pounds * 100 + pence;

  return Number.isSafeInteger(result) ? result : null;
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

    // 3. Verify the originating Shopify store.
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

    // 4. Only process Shopify's paid-order event.
    const topic = request.headers.get("x-shopify-topic");

    if (topic !== "orders/paid") {
      return NextResponse.json({
        success: true,
        ignored: true,
        message: "Webhook topic not applicable",
      });
    }

    // 5. Parse the order.
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

    // 6. Require an actual registered Shopify customer.
    const customerId = String(order.customer?.id || "");

    if (!/^\d+$/.test(customerId)) {
      console.error(
        "WALLET WEBHOOK: Paid wallet order has no valid customer",
        orderId
      );

      // Return an error so the failed delivery is visible and
      // Shopify can retry. Do not silently discard a paid top-up.
      throw new Error(
        `Paid order ${orderId} has no registered Shopify customer`
      );
    }

    const customerGid =
      `gid://shopify/Customer/${customerId}`;

    // 7. Find line items belonging to the actual wallet product.
    const lineItems = Array.isArray(order.line_items)
      ? order.line_items
      : [];

    const walletProductLines = lineItems.filter(
      (item: any) =>
        String(item.product_id || "") === WALLET_PRODUCT_ID
    );

    if (walletProductLines.length === 0) {
      return NextResponse.json({
        success: true,
        ignored: true,
        message: "No Planet Health wallet product found",
      });
    }

    // 8. Validate every wallet product line before crediting anything.
    const topUps: Array<{
      lineItemId: string;
      variantId: string;
      amountPence: number;
    }> = [];

    for (const item of walletProductLines) {
      const variantId = String(item.variant_id || "");
      const lineItemId = String(item.id || "");

      const amountPence = WALLET_TOP_UPS[variantId];

      if (!amountPence) {
        throw new Error(
          `Unapproved wallet variant in order ${orderId}`
        );
      }

      if (!/^\d+$/.test(lineItemId)) {
        throw new Error(
          `Invalid wallet line item ID in order ${orderId}`
        );
      }

      // Only allow one of the six fixed-value top-ups per line.
      const quantity = Number(item.quantity);

      if (quantity !== 1) {
        throw new Error(
          `Invalid wallet top-up quantity in order ${orderId}`
        );
      }

      // Verify the actual Shopify line price matches the fixed
      // advertised top-up price. Shopify prices include VAT here.
      const actualPricePence = toPence(item.price);

      if (actualPricePence !== amountPence) {
        throw new Error(
          `Wallet line price mismatch in order ${orderId}`
        );
      }

      // Do not issue full-value wallet credits for discounted items.
      const totalDiscountPence = toPence(
        item.total_discount ?? "0.00"
      );

      if (totalDiscountPence === null || totalDiscountPence !== 0) {
        throw new Error(
          `Discounted wallet top-up rejected in order ${orderId}`
        );
      }

      // Also check any explicitly allocated line discounts.
      const discountAllocations = Array.isArray(
        item.discount_allocations
      )
        ? item.discount_allocations
        : [];

      const hasAllocatedDiscount = discountAllocations.some(
        (allocation: any) => {
          const allocated = toPence(allocation.amount);

          return allocated === null || allocated !== 0;
        }
      );

      if (hasAllocatedDiscount) {
        throw new Error(
          `Wallet discount allocation rejected in order ${orderId}`
        );
      }

      topUps.push({
        lineItemId,
        variantId,
        amountPence,
      });
    }

    if (topUps.length === 0) {
      return NextResponse.json({
        success: true,
        ignored: true,
        message: "No valid wallet top-ups found",
      });
    }

    // 9. Connect to Supabase.
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      throw new Error("Supabase settings are missing");
    }

    const baseUrl = supabaseUrl.replace(/\/$/, "");

    const processedTransactions = [];

    // 10. Credit each validated top-up through the existing
    //     central wallet transaction function.
    for (const topUp of topUps) {
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

      let walletData: any;

      try {
        walletData = await walletResponse.json();
      } catch {
        throw new Error(
          `Invalid Supabase response for order ${orderId}`
        );
      }

      if (!walletResponse.ok || walletData?.success !== true) {
        console.error(
          "WALLET WEBHOOK: Supabase transaction failed",
          {
            orderId,
            lineItemId: topUp.lineItemId,
            error: walletData,
          }
        );

        throw new Error(
          `Could not process wallet top-up for order ${orderId}`
        );
      }

      processedTransactions.push({
        lineItemId: topUp.lineItemId,
        variantId: topUp.variantId,
        amountPence: topUp.amountPence,
        transactionId: walletData.transaction_id,
        duplicate: walletData.duplicate === true,
        balancePence: walletData.balance_pence,
      });
    }

    // 11. Confirm successful processing.
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
