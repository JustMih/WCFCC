const {
  buildResponseSummary,
  inferMessage,
  logAuditEvent,
  sanitizeAuditValue,
} = require("../utils/auditLogger");

function getRequestIp(req) {
  return (
    (req.headers["x-forwarded-for"] &&
      String(req.headers["x-forwarded-for"]).split(",")[0].trim()) ||
    req.ip ||
    req.connection?.remoteAddress ||
    null
  );
}

function getApiSegments(req) {
  const path = req.originalUrl || req.url || "";
  const cleanPath = path.split("?")[0];
  const normalized = cleanPath.replace(/^\/+|\/+$/g, "");

  if (!normalized.startsWith("api")) {
    return [];
  }

  return normalized.split("/").slice(1);
}

function isIdentifierSegment(segment) {
  if (!segment) {
    return false;
  }

  return (
    /^[0-9]+$/.test(segment) ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      segment
    )
  );
}

function singularize(segment) {
  if (!segment) {
    return null;
  }

  if (segment.endsWith("ies")) {
    return `${segment.slice(0, -3)}y`;
  }

  if (segment.endsWith("s") && !segment.endsWith("ss")) {
    return segment.slice(0, -1);
  }

  return segment;
}

function inferCategory(req, context = {}) {
  if (context.category) {
    return context.category;
  }

  const [rootSegment] = getApiSegments(req);

  if (!rootSegment) {
    return "api";
  }

  if (rootSegment === "auth") {
    return "authentication";
  }

  if (
    ["ticket", "workflow", "reviewer", "complaints", "ticket-updates"].includes(
      rootSegment
    )
  ) {
    return "workflow";
  }

  if (
    ["users", "extensions", "lookup-tables", "holidays", "emergency"].includes(
      rootSegment
    )
  ) {
    return "configuration";
  }

  if (["reports", "logs", "call-summary", "ticket-summary"].includes(rootSegment)) {
    return "reporting";
  }

  return "api";
}

function inferEntityType(req, context = {}) {
  if (context.entityType) {
    return context.entityType;
  }

  const [rootSegment] = getApiSegments(req);
  return rootSegment ? singularize(rootSegment) : "api";
}

function inferEntityId(req, context = {}) {
  if (context.entityId) {
    return String(context.entityId);
  }

  const body = req.body || {};
  const commonKeys = [
    "id",
    "ticketId",
    "userId",
    "notification_report_id",
    "employer_id",
  ];

  for (const key of commonKeys) {
    if (body[key]) {
      return String(body[key]);
    }
  }

  const segments = getApiSegments(req);
  const idSegment = segments.find((segment) => isIdentifierSegment(segment));
  return idSegment || null;
}

function inferAction(req, context = {}) {
  if (context.action) {
    return context.action;
  }

  const method = String(req.method || "GET").toUpperCase();
  const segments = getApiSegments(req);
  const entityType = inferEntityType(req, context);
  const meaningfulSegments = segments.filter((segment) => !isIdentifierSegment(segment));
  const lastSegment = meaningfulSegments[meaningfulSegments.length - 1];

  if (meaningfulSegments[0] === "auth" && meaningfulSegments[1]) {
    return meaningfulSegments[1].replace(/-/g, "_");
  }

  if (lastSegment && lastSegment !== entityType && lastSegment !== "api") {
    return lastSegment.replace(/-/g, "_");
  }

  const methodMap = {
    GET: "read",
    POST: "create",
    PUT: "update",
    PATCH: "update",
    DELETE: "delete",
  };

  return methodMap[method] || method.toLowerCase();
}

function buildMetadata(req, responseBody, context = {}) {
  const method = String(req.method || "GET").toUpperCase();
  const metadata = {
    ...context.metadata,
    params: sanitizeAuditValue(req.params || {}),
    query: sanitizeAuditValue(req.query || {}),
  };

  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    metadata.body = sanitizeAuditValue(req.body || {});
  }

  const responseSummary = buildResponseSummary(responseBody);
  if (responseSummary !== null) {
    metadata.response = responseSummary;
  }

  return metadata;
}

function auditLogger(req, res, next) {
  const originalJson = res.json.bind(res);
  const originalSend = res.send.bind(res);
  let responseBody;

  res.json = (body) => {
    responseBody = body;
    return originalJson(body);
  };

  res.send = (body) => {
    if (responseBody === undefined) {
      responseBody = body;
    }
    return originalSend(body);
  };

  const onFinish = () => {
    res.removeListener("finish", onFinish);
    res.removeListener("close", onFinish);

    const url = req.originalUrl || req.url || "";
    if (!url.startsWith("/api") || url.startsWith("/api/health")) {
      return;
    }

    if (req.auditLogContext?.skip) {
      return;
    }

    const context = req.auditLogContext || {};
    const user = req.user || {};
    const userId = context.userId || user.userId || user.id || null;
    const role = context.role || user.role || null;
    const status =
      context.status || (res.statusCode >= 400 ? "failure" : "success");
    const action = inferAction(req, context);

    logAuditEvent({
      category: inferCategory(req, context),
      action,
      entityType: inferEntityType(req, context),
      entityId: inferEntityId(req, context),
      status,
      message: inferMessage(action, status, responseBody, context.message),
      userId,
      actorName: context.actorName || null,
      actorEmail: context.actorEmail || null,
      role,
      method: req.method,
      path: req.path || url.split("?")[0],
      requestId: req.requestId || req.headers["x-request-id"] || null,
      ip: getRequestIp(req),
      userAgent: req.headers["user-agent"] || null,
      metadata: buildMetadata(req, responseBody, context),
      beforeState: context.beforeState || null,
      afterState: context.afterState || null,
    });
  };

  res.on("finish", onFinish);
  res.on("close", onFinish);

  next();
}

module.exports = {
  auditLogger,
};
