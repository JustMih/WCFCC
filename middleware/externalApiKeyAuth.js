/**
 * Validates API keys for external integrations (e.g. ESSP).
 * Set VALID_API_KEYS in env as comma-separated values.
 */
const externalApiKeyAuth = (req, res, next) => {
  const rawHeader =
    req.headers["x-api-key"] ||
    req.headers["authorization"] ||
    req.headers["Authorization"];

  if (!rawHeader) {
    return res.status(401).json({
      success: false,
      message: "API key is required",
      error: "MISSING_API_KEY",
    });
  }

  const cleanKey = String(rawHeader).replace(/^Bearer\s+/i, "").trim();

  const validKeys = (process.env.VALID_API_KEYS || "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

  if (validKeys.length === 0) {
    console.error("VALID_API_KEYS is not configured");
    return res.status(500).json({
      success: false,
      message: "External API authentication is not configured",
      error: "API_KEYS_NOT_CONFIGURED",
    });
  }

  if (!validKeys.includes(cleanKey)) {
    return res.status(401).json({
      success: false,
      message: "Invalid API key",
      error: "INVALID_API_KEY",
    });
  }

  req.externalApiKeyValid = true;
  next();
};

module.exports = externalApiKeyAuth;
