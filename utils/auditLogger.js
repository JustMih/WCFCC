const { AuditLog } = require("../models");

const REDACTED = "[REDACTED]";
const MAX_STRING_LENGTH = 1000;
const MAX_ARRAY_ITEMS = 50;
const SENSITIVE_KEY_PATTERN =
  /(pass(word)?|token|secret|authorization|cookie|credential|api[-_]?key|set-cookie|jwt)/i;

function truncateString(value) {
  if (typeof value !== "string") {
    return value;
  }

  if (value.length <= MAX_STRING_LENGTH) {
    return value;
  }

  return `${value.slice(0, MAX_STRING_LENGTH)}...[truncated]`;
}

function sanitizeAuditValue(value, key = "", seen = new WeakSet()) {
  if (value === null || value === undefined) {
    return value;
  }

  if (SENSITIVE_KEY_PATTERN.test(key)) {
    return REDACTED;
  }

  if (typeof value === "string") {
    return truncateString(value);
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Buffer.isBuffer(value)) {
    return "[Buffer]";
  }

  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_ITEMS).map((item) => sanitizeAuditValue(item, "", seen));
  }

  if (typeof value === "object") {
    if (seen.has(value)) {
      return "[Circular]";
    }

    seen.add(value);
    const sanitized = {};

    Object.entries(value).forEach(([entryKey, entryValue]) => {
      sanitized[entryKey] = sanitizeAuditValue(entryValue, entryKey, seen);
    });

    seen.delete(value);
    return sanitized;
  }

  return truncateString(String(value));
}

function compactObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const compacted = {};

  Object.entries(value).forEach(([key, entryValue]) => {
    if (
      entryValue !== undefined &&
      entryValue !== null &&
      entryValue !== "" &&
      !(typeof entryValue === "object" && !Array.isArray(entryValue) && Object.keys(entryValue).length === 0)
    ) {
      compacted[key] = entryValue;
    }
  });

  return Object.keys(compacted).length > 0 ? compacted : null;
}

function buildResponseSummary(responseBody) {
  if (responseBody === undefined || responseBody === null) {
    return null;
  }

  if (typeof responseBody === "string") {
    return truncateString(responseBody);
  }

  if (typeof responseBody !== "object") {
    return responseBody;
  }

  const candidateKeys = [
    "message",
    "error",
    "code",
    "success",
    "url",
    "status",
  ];
  const summary = {};

  candidateKeys.forEach((key) => {
    if (responseBody[key] !== undefined) {
      summary[key] = sanitizeAuditValue(responseBody[key], key);
    }
  });

  if (Object.keys(summary).length > 0) {
    return summary;
  }

  return sanitizeAuditValue(responseBody);
}

function inferMessage(action, status, responseBody, explicitMessage) {
  if (explicitMessage) {
    return truncateString(explicitMessage);
  }

  if (responseBody && typeof responseBody === "object") {
    if (responseBody.message) {
      return truncateString(String(responseBody.message));
    }
    if (responseBody.error) {
      return truncateString(String(responseBody.error));
    }
  }

  return `${action} ${status}`;
}

async function logAuditEvent(payload) {
  try {
    if (!AuditLog) {
      console.warn("[AuditLog] Model not available, skipping audit logging.");
      return;
    }

    const safePayload = {
      category: truncateString(payload.category || "api"),
      action: truncateString(payload.action || "unknown"),
      entityType: payload.entityType ? truncateString(payload.entityType) : null,
      entityId: payload.entityId ? truncateString(String(payload.entityId)) : null,
      status: truncateString(payload.status || "success"),
      message: payload.message ? truncateString(payload.message) : null,
      userId: payload.userId || null,
      actorName: payload.actorName ? truncateString(payload.actorName) : null,
      actorEmail: payload.actorEmail ? truncateString(payload.actorEmail) : null,
      role: payload.role ? truncateString(payload.role) : null,
      method: payload.method ? truncateString(payload.method) : null,
      path: payload.path ? truncateString(payload.path) : null,
      requestId: payload.requestId ? truncateString(payload.requestId) : null,
      ip: payload.ip ? truncateString(payload.ip) : null,
      userAgent: payload.userAgent ? truncateString(payload.userAgent) : null,
      metadata: compactObject(sanitizeAuditValue(payload.metadata || null)),
      beforeState: sanitizeAuditValue(payload.beforeState || null),
      afterState: sanitizeAuditValue(payload.afterState || null),
    };

    await AuditLog.create(safePayload);
  } catch (error) {
    console.error("[AuditLog] Failed to write audit log:", error.message || error);
  }
}

module.exports = {
  REDACTED,
  sanitizeAuditValue,
  buildResponseSummary,
  inferMessage,
  logAuditEvent,
};
