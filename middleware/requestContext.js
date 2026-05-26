const crypto = require("crypto");

function generateRequestId() {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return crypto.randomBytes(16).toString("hex");
}

function attachRequestContext(req, res, next) {
  const inboundRequestId = req.headers["x-request-id"];
  const requestId =
    typeof inboundRequestId === "string" && inboundRequestId.trim()
      ? inboundRequestId.trim()
      : generateRequestId();

  req.requestId = requestId;
  res.setHeader("x-request-id", requestId);

  req.auditLogContext = {
    metadata: {},
  };

  req.setAuditContext = (updates = {}) => {
    if (!req.auditLogContext) {
      req.auditLogContext = { metadata: {} };
    }

    const nextContext = { ...updates };
    const existingMetadata = req.auditLogContext.metadata || {};
    const newMetadata = nextContext.metadata || {};

    delete nextContext.metadata;

    req.auditLogContext = {
      ...req.auditLogContext,
      ...nextContext,
      metadata: {
        ...existingMetadata,
        ...newMetadata,
      },
    };
  };

  req.addAuditMetadata = (metadata = {}) => {
    req.setAuditContext({ metadata });
  };

  next();
}

module.exports = {
  attachRequestContext,
};
