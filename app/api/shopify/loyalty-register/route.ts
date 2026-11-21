
function verifyShopifyProxy(request: NextRequest): boolean {
  const params = new URL(request.url).searchParams;

  const signature = params.get("signature");
  const secret = process.env.SHOPIFY_API_SECRET;

  if (!signature) {
    console.error("LOYALTY AUTH: Missing signature");
    return false;
  }

  if (!secret) {
    console.error("LOYALTY AUTH: SHOPIFY_API_SECRET missing");
    return false;
  }

  const grouped = new Map<string, string[]>();

  params.forEach((value, key) => {
    if (key === "signature") return;

    const values = grouped.get(key) || [];
    values.push(value);
    grouped.set(key, values);
  });

  const message = Array.from(grouped.entries())
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, values]) => `${key}=${values.join(",")}`)
    .join("");

  const calculated = crypto
    .createHmac("sha256", secret)
    .update(message)
    .digest("hex");

  if (!/^[a-f0-9]{64}$/i.test(signature)) {
    console.error("LOYALTY AUTH: Invalid signature format");
    return false;
  }

  const supplied = Buffer.from(signature, "hex");
  const expected = Buffer.from(calculated, "hex");

  if (
    supplied.length !== expected.length ||
    !crypto.timingSafeEqual(supplied, expected)
  ) {
    console.error("LOYALTY AUTH: Signature mismatch");
    return false;
  }

  const timestamp = Number(params.get("timestamp"));

  if (!Number.isFinite(timestamp)) {
    console.error("LOYALTY AUTH: Invalid timestamp");
    return false;
  }

  const age = Math.floor(Date.now() / 1000) - timestamp;

  if (age > 300 || age < -60) {
    console.error("LOYALTY AUTH: Timestamp outside allowed window");
    return false;
  }

  const expectedShop = process.env.SHOPIFY_SHOP;
  const actualShop = params.get("shop");

  if (!expectedShop || actualShop !== expectedShop) {
    console.error("LOYALTY AUTH: Shop mismatch");
    return false;
  }

  console.log("LOYALTY AUTH: Shopify proxy verified");

  return true;
}
