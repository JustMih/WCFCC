const express = require("express");
const { Op } = require("sequelize");
const { HttpLog } = require("../models");
const { authMiddleware } = require("../middleware/authMiddleware");
const { roleMiddleware } = require("../middleware/roleMiddleware");

const router = express.Router();

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

      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) {
          where.createdAt[Op.gte] = new Date(startDate);
        }
        if (endDate) {
          // Include the whole end day
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          where.createdAt[Op.lte] = end;
        }
      }

      const pageNum = Math.max(1, Number(page) || 1);
      const limit = Math.min(100, Math.max(1, Number(pageSize) || 20));
      const offset = (pageNum - 1) * limit;

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

module.exports = router;

