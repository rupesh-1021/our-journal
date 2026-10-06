import jwt from "jsonwebtoken";
export function verifyToken(raw) {
  return jwt.verify(raw, process.env.JWT_SECRET);
}
export function auth(req, res, next) {
  const raw = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!raw) return res.status(401).json({ error: "Authentication required" });
  try {
    req.user = verifyToken(raw);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired session" });
  }
}
