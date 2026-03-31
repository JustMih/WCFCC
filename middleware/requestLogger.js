const { logRequestToDb } = require("../utils/logger");

/**
 * Express middleware to log every HTTP request/response to the database.
 * - Measures duration
 * - Captures method, URL, status, IP, user (if available), user-agent
 * - Never blocks or throws – DB failures are logged to console only
 */
function requestLogger(req, res, next) {
  const start = Date.now();

  // Optionally skip very noisy endpoints here (example: health checks)
  const url = req.originalUrl || req.url || "";
  if (url.startsWith("/health")) {
    return next();
  }

  const onFinish = () => {
    res.removeListener("finish", onFinish);
    res.removeListener("close", onFinish);

    const durationMs = Date.now() - start;
    const ip =
      (req.headers["x-forwarded-for"] &&
        String(req.headers["x-forwarded-for"]).split(",")[0].trim()) ||
      req.ip ||
      req.connection?.remoteAddress ||
      null;

    const fullUrl = `${req.protocol || "http"}://${req.get
      ? req.get("host")
      : ""}${url}`;

    const user = req.user || {};
    const userId = user.userId || user.id || null;
    const role = user.role || null;

    // Fire-and-forget – no await
    logRequestToDb({
      method: req.method,
      path: req.path || url,
      fullUrl,
      statusCode: res.statusCode,
      durationMs,
      ip,
      userId,
      role,
      userAgent: req.headers["user-agent"],
      requestId: req.headers["x-request-id"] || null,
    });
  };

  res.on("finish", onFinish);
  res.on("close", onFinish);

  next();
}

module.exports = {
  requestLogger,
};

