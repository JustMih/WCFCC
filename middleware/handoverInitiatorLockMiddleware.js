const jwt = require("jsonwebtoken");
require("dotenv").config();
const UserHandover = require("../models/UserHandover");

const WHITELIST = [
  { method: "GET", pattern: /^\/users\/handover\/active\/?$/ },
  { method: "POST", pattern: /^\/users\/handover\/[^/]+\/revoke\/?$/ },
  { method: "POST", pattern: /^\/auth\/logout\/?$/ },
];

function normalizeRequestPath(req) {
  const candidates = [
    req.path,
    req.url,
    req.originalUrl,
  ]
    .filter(Boolean)
    .map((value) => String(value).split("?")[0].replace(/\/+$/, "") || "/");

  for (const raw of candidates) {
    const withoutApi = raw.replace(/^\/api(?=\/|$)/, "") || "/";
    if (withoutApi !== raw) {
      candidates.push(withoutApi);
    }
  }

  return [...new Set(candidates)];
}

function isWhitelisted(req) {
  const paths = normalizeRequestPath(req);
  return WHITELIST.some(
    (entry) =>
      entry.method === req.method.toUpperCase() &&
      paths.some((path) => entry.pattern.test(path))
  );
}

const handoverInitiatorLockMiddleware = async (req, res, next) => {
  if (isWhitelisted(req)) {
    return next();
  }

  const token = req.header("Authorization")?.replace("Bearer ", "");
  if (!token) {
    return next();
  }

  let userId;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    userId = decoded.id || decoded.userId;
  } catch {
    return next();
  }

  if (!userId) {
    return next();
  }

  try {
    const activeHandover = await UserHandover.findOne({
      where: { from_user_id: userId, status: "active" },
      attributes: ["id"],
    });

    if (activeHandover) {
      return res.status(403).json({
        message: "Active handover in progress. Revoke handover to continue.",
        code: "HANDOVER_INITIATOR_LOCKED",
      });
    }

    return next();
  } catch (error) {
    console.error("[handoverInitiatorLockMiddleware]", error.message);
    return next();
  }
};

module.exports = { handoverInitiatorLockMiddleware };
