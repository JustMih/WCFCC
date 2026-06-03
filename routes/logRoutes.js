const express = require("express");
const { Op } = require("sequelize");
const { HttpLog, AuditLog, User } = require("../models");
const { authMiddleware } = require("../middleware/authMiddleware");
const { roleMiddleware } = require("../middleware/roleMiddleware");

const router = express.Router();

const parsePagination = (page, pageSize, maxPageSize = 1000) => {
  const pageNum = Math.max(1, Number(page) || 1);
  const limit = Math.min(maxPageSize, Math.max(1, Number(pageSize) || 20));

  return {
    pageNum,
    limit,
    offset: (pageNum - 1) * limit,
  };
};

const applyDateFilter = (where, startDate, endDate) => {
  if (!startDate && !endDate) {
    return;
  }

  where.createdAt = {};

  if (startDate) {
    where.createdAt[Op.gte] = new Date(startDate);
  }

  if (endDate) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    where.createdAt[Op.lte] = end;
  }
};

// GET /logs/http - paginated, filtered HTTP request logs (admin/super-admin only)
router.get(
  "/http",
  authMiddleware,
  roleMiddleware(["admin", "super-admin"]),
  async (req, res) => {
    try {
      const {
        page = 1,
        pageSize = 20,
        method,
        statusCode,
        role,
        userId,
        path,
        startDate,
        endDate,
      } = req.query;

      const where = {};

      if (method) {
        where.method = method.toUpperCase();
      }

      if (statusCode) {
        // Support single code (e.g. 200) or ranges like "4xx"
        if (/^\d{3}$/.test(statusCode)) {
          where.statusCode = Number(statusCode);
        } else if (/^[1-5]xx$/.test(statusCode)) {
          const first = Number(statusCode[0]);
          where.statusCode = {
            [Op.between]: [first * 100, first * 100 + 99],
          };
        }
      }

      if (role) {
        where.role = role;
      }

      if (userId) {
        where.userId = userId;
      }

      if (path) {
        where.path = { [Op.like]: `%${path}%` };
      }

      applyDateFilter(where, startDate, endDate);

      const { pageNum, limit, offset } = parsePagination(page, pageSize);

      const { rows, count } = await HttpLog.findAndCountAll({
        where,
        order: [["createdAt", "DESC"]],
        limit,
        offset,
      });

      res.json({
        data: rows,
        page: pageNum,
        pageSize: limit,
        total: count,
        totalPages: Math.ceil(count / limit),
      });
    } catch (err) {
      console.error("Error fetching HTTP logs:", err);
      res.status(500).json({ message: "Failed to fetch logs" });
    }
  }
);

const auditLogInclude = [
  {
    model: User,
    as: "actor",
    attributes: ["id", "full_name", "email"],
    required: false,
  },
];

const buildAuditLogWhere = (query) => {
  const {
    category,
    action,
    status,
    role,
    userId,
    entityType,
    entityId,
    path,
    requestId,
    method,
    search,
    startDate,
    endDate,
  } = query;

  const where = {};

  if (category) {
    where.category = category;
  }

  if (action) {
    where.action = { [Op.like]: `%${action}%` };
  }

  if (status) {
    where.status = status;
  }

  if (role) {
    where.role = role;
  }

  if (userId) {
    where.userId = userId;
  }

  if (entityType) {
    where.entityType = entityType;
  }

  if (entityId) {
    where.entityId = { [Op.like]: `%${entityId}%` };
  }

  if (path) {
    where.path = { [Op.like]: `%${path}%` };
  }

  if (requestId) {
    where.requestId = { [Op.like]: `%${requestId}%` };
  }

  if (method) {
    where.method = method.toUpperCase();
  }

  applyDateFilter(where, startDate, endDate);

  if (search) {
    where[Op.or] = [
      { action: { [Op.like]: `%${search}%` } },
      { category: { [Op.like]: `%${search}%` } },
      { entityType: { [Op.like]: `%${search}%` } },
      { entityId: { [Op.like]: `%${search}%` } },
      { message: { [Op.like]: `%${search}%` } },
      { actorName: { [Op.like]: `%${search}%` } },
      { actorEmail: { [Op.like]: `%${search}%` } },
      { path: { [Op.like]: `%${search}%` } },
      { requestId: { [Op.like]: `%${search}%` } },
    ];
  }

  return where;
};

const mapAuditLogRow = (log) => {
  const plainLog = log.toJSON ? log.toJSON() : log;
  return {
    ...plainLog,
    actorName:
      plainLog.actorName || plainLog.actor?.full_name || plainLog.userId || "-",
    actorEmail: plainLog.actorEmail || plainLog.actor?.email || null,
  };
};

const AUDIT_EXPORT_ATTRIBUTES = [
  "id",
  "createdAt",
  "action",
  "category",
  "entityType",
  "entityId",
  "status",
  "actorName",
  "actorEmail",
  "role",
  "method",
  "path",
  "requestId",
  "message",
  "userId",
];

const EXPORT_PAGE_SIZE_DEFAULT = 500;
const EXPORT_PAGE_SIZE_MAX = 500;
const EXPORT_MAX_PAGES = 20;

const parseExportPageSize = (exportPageSize) => {
  const parsed = Number(exportPageSize) || EXPORT_PAGE_SIZE_DEFAULT;
  return Math.min(EXPORT_PAGE_SIZE_MAX, Math.max(1, parsed));
};

const parseExportPage = (exportPage) => Math.max(1, Number(exportPage) || 1);

const mapAuditLogExportRow = (log) => {
  const mapped = mapAuditLogRow(log);
  return {
    id: mapped.id,
    createdAt: mapped.createdAt,
    action: mapped.action,
    category: mapped.category,
    entityType: mapped.entityType,
    entityId: mapped.entityId,
    status: mapped.status,
    actorName: mapped.actorName,
    actorEmail: mapped.actorEmail,
    role: mapped.role,
    method: mapped.method,
    path: mapped.path,
    requestId: mapped.requestId,
    message: mapped.message,
    userId: mapped.userId,
  };
};

// GET /logs/audit/export - paginated export (500 rows per page, lean payload)
router.get(
  "/audit/export",
  authMiddleware,
  roleMiddleware(["admin", "super-admin"]),
  async (req, res) => {
    try {
      const where = buildAuditLogWhere(req.query);
      const pageSize = parseExportPageSize(req.query.exportPageSize);
      const page = parseExportPage(req.query.exportPage);

      if (page > EXPORT_MAX_PAGES) {
        return res.status(400).json({
          message: `Export page cannot exceed ${EXPORT_MAX_PAGES} (${EXPORT_MAX_PAGES * pageSize} rows max)`,
        });
      }

      const offset = (page - 1) * pageSize;

      const rows = await AuditLog.findAll({
        where,
        attributes: AUDIT_EXPORT_ATTRIBUTES,
        include: auditLogInclude,
        order: [["createdAt", "DESC"]],
        limit: pageSize,
        offset,
      });

      const data = rows.map(mapAuditLogExportRow);

      res.json({
        data,
        total: data.length,
        page,
        pageSize,
        hasMore: data.length === pageSize,
        maxPages: EXPORT_MAX_PAGES,
      });
    } catch (err) {
      console.error("Error exporting audit logs:", err);
      res.status(500).json({ message: "Failed to export audit logs" });
    }
  }
);

// GET /logs/audit - paginated, filtered audit logs (admin/super-admin only)
router.get(
  "/audit",
  authMiddleware,
  roleMiddleware(["admin", "super-admin"]),
  async (req, res) => {
    try {
      const { page = 1, pageSize = 20 } = req.query;
      const where = buildAuditLogWhere(req.query);
      const { pageNum, limit, offset } = parsePagination(page, pageSize);

      const { rows, count } = await AuditLog.findAndCountAll({
        where,
        include: auditLogInclude,
        order: [["createdAt", "DESC"]],
        limit,
        offset,
      });

      const data = rows.map(mapAuditLogRow);

      res.json({
        data,
        page: pageNum,
        pageSize: limit,
        total: count,
        totalPages: Math.ceil(count / limit),
      });
    } catch (err) {
      console.error("Error fetching audit logs:", err);
      res.status(500).json({ message: "Failed to fetch audit logs" });
    }
  }
);

module.exports = router;

