const express = require("express");
const { Op } = require("sequelize");
const { HttpLog, AuditLog, User } = require("../models");
const { authMiddleware } = require("../middleware/authMiddleware");
const { roleMiddleware } = require("../middleware/roleMiddleware");

const router = express.Router();

const parsePagination = (page, pageSize) => {
  const pageNum = Math.max(1, Number(page) || 1);
  const limit = Math.min(100, Math.max(1, Number(pageSize) || 20));

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

// GET /logs/audit - paginated, filtered audit logs (admin/super-admin only)
router.get(
  "/audit",
  authMiddleware,
  roleMiddleware(["admin", "super-admin"]),
  async (req, res) => {
    try {
      const {
        page = 1,
        pageSize = 20,
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
      } = req.query;

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

      const { pageNum, limit, offset } = parsePagination(page, pageSize);

      const { rows, count } = await AuditLog.findAndCountAll({
        where,
        include: [
          {
            model: User,
            as: "actor",
            attributes: ["id", "full_name", "email"],
            required: false,
          },
        ],
        order: [["createdAt", "DESC"]],
        limit,
        offset,
      });

      const data = rows.map((log) => {
        const plainLog = log.toJSON();
        return {
          ...plainLog,
          actorName:
            plainLog.actorName || plainLog.actor?.full_name || plainLog.userId || "-",
          actorEmail: plainLog.actorEmail || plainLog.actor?.email || null,
        };
      });

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

