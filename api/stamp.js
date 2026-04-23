export default async function handler(req, res) {
  const { cid } = req.query;

  if (!cid) {
    return res.status(400).json({ error: "Missing customer ID" });
  }

  // 🔥 TEMP TEST RESPONSE
  return res.status(200).json({
    success: true,
    message: `Stamp would be added for customer ${cid}`
  });
}
