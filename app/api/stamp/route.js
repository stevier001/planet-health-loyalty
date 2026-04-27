export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const cid = searchParams.get("cid");

  if (!cid) {
    return new Response(JSON.stringify({ error: "Missing customer ID" }), { status: 400 });
  }

  const store = process.env.SHOPIFY_STORE;
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;

  try {
    // 🔐 STEP 1 — GET ACCESS TOKEN
    const tokenRes = await fetch(`https://${store}/admin/oauth/access_token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    if (!accessToken) {
      return new Response(JSON.stringify({ error: "Failed to get token", tokenData }), { status: 500 });
    }

    // 🔍 STEP 2 — GET CUSTOMER
    const customerRes = await fetch(
      `https://${store}/admin/api/2023-10/customers/${cid}.json`,
      {
        headers: {
          "X-Shopify-Access-Token": accessToken,
          "Content-Type": "application/json",
        },
      }
    );

    const customerData = await customerRes.json();
    const customer = customerData.customer;

    let stamps = 0;

    if (customer.note && customer.note.includes("stamps:")) {
      stamps = parseInt(customer.note.split("stamps:")[1]) || 0;
    }

    stamps += 1;

    // ✏️ STEP 3 — UPDATE CUSTOMER
    await fetch(
      `https://${store}/admin/api/2023-10/customers/${cid}.json`,
      {
        method: "PUT",
        headers: {
          "X-Shopify-Access-Token": accessToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          customer: {
            id: cid,
            note: `stamps:${stamps}`,
          },
        }),
      }
    );

    return new Response(
      JSON.stringify({
        success: true,
        stamps,
      }),
      { status: 200 }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Server error", details: err.message }),
      { status: 500 }
    );
  }
}
