
function verifyShopifyProxy(request: NextRequest): boolean {
  const params = new URL(request.url).searchParams;

  const signature = params.get("signature");

  const secrets = [
    process.env.SHOPIFY_API_SECRET,
    process.env.SHOPIFY_API_SECRET_OLD,
  ].filter((secret): secret is string => Boolean(secret));

  if (!signature) {
    console.error("LOYALTY AUTH: Missing signature");
    return false;
  }

  if (secrets.length === 0) {
    console.error("LOYALTY AUTH: No Shopify secrets configured");
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
    .map(([key, values]) => `${key}=${values.join(",")}`)
    .sort()
    .join("");

  if (!/^[a-f0-9]{64}$/i.test(signature)) {
    console.error("LOYALTY AUTH: Invalid signature format");
    return false;
  }

  const supplied = Buffer.from(signature, "hex");

  for (const secret of secrets) {
    const calculated = crypto
      .createHmac("sha256", secret)
      .update(message)
      .digest("hex");

    const expected = Buffer.from(calculated, "hex");

    if (
      supplied.length === expected.length &&
      crypto.timingSafeEqual(supplied, expected)
    ) {
      console.log("LOYALTY AUTH: Shopify proxy verified");
      return true;
    }
  }

  console.error("LOYALTY AUTH: Signature mismatch with both secrets");
  return false;
}
