const { HttpLog } = require("../models");

/**
 * Lightweight, fire-and-forget DB logger for HTTP requests.
 * Never throws: failures are printed to console and ignored.
 */
async function logRequestToDb(payload) {
  try {
    if (!HttpLog) {
      console.warn("[HttpLog] Model not available, skipping DB logging.");
      return;
    }

    // Basic shape & truncation safety
    const safePayload = {
      method: payload.method || "",
      path: payload.path || "",
      fullUrl: payload.fullUrl || null,
      statusCode: payload.statusCode ?? 0,
      durationMs: payload.durationMs ?? null,
      ip: payload.ip || null,
      userId: payload.userId || null,
      role: payload.role || null,
      userAgent: payload.userAgent
        ? String(payload.userAgent).slice(0, 500)
        : null,
      requestId: payload.requestId ? String(payload.requestId).slice(0, 100) : null,
    };

    // Fire-and-forget insert; don't await in callers if not needed
    await HttpLog.create(safePayload);
  } catch (err) {
    // Never rethrow from logger
    console.error("[HttpLog] Failed to write request log:", err.message || err);
  }
}

module.exports = {
  logRequestToDb,
};

