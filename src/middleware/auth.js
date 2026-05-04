const jwt = require("jsonwebtoken");
const { getCollections } = require("../config/database");

// ── Verify Access Token ───────────────────────────────────────────────────────
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, message: "No token provided" });
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ success: false, message: "Token expired", code: "TOKEN_EXPIRED" });
    }
    return res.status(401).json({ success: false, message: "Invalid token" });
  }
}

// ── Role Guard ────────────────────────────────────────────────────────────────
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ success: false, message: "Unauthenticated" });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required role: ${roles.join(" or ")}`,
      });
    }
    next();
  };
}

// ── Audit Logger ──────────────────────────────────────────────────────────────
function auditLog(action) {
  return (req, res, next) => {
    const { auditLogs } = getCollections();
    const origJson = res.json.bind(res);

    res.json = function (data) {
      if (res.statusCode < 400) {
        auditLogs.insert({
          action,
          userId: req.user?.id,
          username: req.user?.username,
          role: req.user?.role,
          ip: req.ip,
          method: req.method,
          path: req.path,
          body: sanitizeBody(req.body),
          timestamp: new Date().toISOString(),
          statusCode: res.statusCode,
        });
      }
      return origJson(data);
    };
    next();
  };
}

function sanitizeBody(body) {
  if (!body) return {};
  const clean = { ...body };
  delete clean.password;
  delete clean.newPassword;
  delete clean.currentPassword;
  return clean;
}

module.exports = { authenticate, authorize, auditLog };
