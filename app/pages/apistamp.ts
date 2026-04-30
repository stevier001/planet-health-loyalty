export default function handler(req, res) {
  const { cid } = req.query;

  res.status(200).json({
    success: true,
    customer_id: cid,
  });
}
