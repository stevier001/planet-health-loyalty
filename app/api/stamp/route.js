export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const cid = searchParams.get("cid");

  if (!cid) {
    return new Response(
      JSON.stringify({ error: "Missing customer ID" }),
      { status: 400 }
    );
  }

  return new Response(
    JSON.stringify({
      success: true,
      message: `Stamp would be added for customer ${cid}`
    }),
    { status: 200 }
  );
}
