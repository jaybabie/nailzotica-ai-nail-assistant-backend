// src/middleware/requireAuth.js
const { admin } = require("../lib/firebaseAdmin");

async function requireAuth(req, res, next) {
  try {
    // TEMP DEV BYPASS
    if (process.env.NODE_ENV !== "production") {
      req.user = {
        uid: "dev_user",
        email: "dev@nailzotica.com",
        name: "Development User",
        claims: {},
      };

      console.log("⚠️ Auth bypass enabled (development mode)");
      return next();
    }

    const authHeader = req.headers.authorization || "";
    const match = authHeader.match(/^Bearer\s+(.+)$/i);

    if (!match) {
      return res.status(401).json({
        error:
          "Missing Authorization header. Expected: Bearer <Firebase ID token>",
      });
    }

    const idToken = match[1].trim();
    const decoded = await admin.auth().verifyIdToken(idToken);

    req.user = {
      uid: decoded.uid,
      email: decoded.email || null,
      name: decoded.name || null,
      claims: decoded,
    };

    return next();
  } catch (err) {
    return res.status(401).json({
      error: "Invalid or expired Firebase ID token",
      details: err?.message || String(err),
    });
  }
}

module.exports = { requireAuth };