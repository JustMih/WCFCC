const { AuditLog } = require("../models");

const REDACTED = "[REDACTED]";
const MAX_STRING_LENGTH = 1000;
const MAX_ARRAY_ITEMS = 50;
const MAX_JSON_DEPTH = 10;
const SENSITIVE_KEY_PATTERN =
  /(pass(word)?|token|secret|authorization|cookie|credential|api[-_]?key|set-cookie|jwt)/i;
const AUDIT_BODY_SKIP_KEYS = new Set(["allClaims", "attachment", "attachments"]);

function truncateString(value) {
  if (typeof value !== "string") {
    return value;
  }

  if (value.length <= MAX_STRING_LENGTH) {
    return value;
  }

  return `${value.slice(0, MAX_STRING_LENGTH)}...[truncated]`;
}

function sanitizeAuditValue(value, key = "", seen = new WeakSet(), depth = 0) {
  if (depth > MAX_JSON_DEPTH) {
    return "[MaxDepth]";
  }

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
    return value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => sanitizeAuditValue(item, key, seen, depth + 1));
  }

  if (typeof value === "object") {
    if (seen.has(value)) {
      return "[Duplicate]";
    }

    seen.add(value);

    const source =
      value.dataValues && typeof value.dataValues === "object"
        ? value.dataValues
        : value;
    const sanitized = {};

    Object.entries(source).forEach(([entryKey, entryValue]) => {
      if (entryKey.startsWith("_") || entryKey === "uniqno" || entryKey === "isNewRecord") {
        return;
      }
      sanitized[entryKey] = sanitizeAuditValue(
        entryValue,
        entryKey,
        seen,
        depth + 1
      );
    });

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

  if (responseBody.ticket) {
    summary.ticket_id =
      responseBody.ticket.ticket_id ||
      responseBody.ticket.dataValues?.ticket_id ||
      responseBody.ticket.id ||
      null;
  }

  if (responseBody.ticket_id) {
    summary.ticket_id = responseBody.ticket_id;
  }

  if (Object.keys(summary).length > 0) {
    return summary;
  }

  return {
    type: Array.isArray(responseBody) ? "array" : "object",
    count: Array.isArray(responseBody) ? responseBody.length : undefined,
    keys: Object.keys(responseBody).slice(0, 20),
  };
}

function sanitizeRequestBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return sanitizeAuditValue(body);
  }

  const sanitized = {};
  Object.entries(body).forEach(([entryKey, entryValue]) => {
    if (AUDIT_BODY_SKIP_KEYS.has(entryKey)) {
      if (Array.isArray(entryValue)) {
        sanitized[entryKey] = `[${entryValue.length} items omitted]`;
      } else if (typeof entryValue === "string") {
        sanitized[entryKey] = truncateString(entryValue);
      } else {
        sanitized[entryKey] = "[omitted]";
      }
      return;
    }
    sanitized[entryKey] = sanitizeAuditValue(entryValue, entryKey);
  });
  return sanitized;
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
  sanitizeRequestBody,
  buildResponseSummary,
  inferMessage,
  logAuditEvent,
};
