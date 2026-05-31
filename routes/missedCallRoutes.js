const express = require("express");
const router = express.Router();
const sequelize = require("../config/mysql_connection");
const { MissedCall, User } = require("../models");
const { Op, QueryTypes } = require("sequelize");
const { Sequelize } = require("sequelize");
const moment = require("moment");

const AGENT_MISSED_DEDUP_SECONDS = 120;
const DEFAULT_LIST_LIMIT = 200;

function isDuplicateKeyError(err) {
  const code = err?.parent?.code || err?.original?.code;
  const errno = err?.parent?.errno || err?.original?.errno;
  return (
    err?.name === "SequelizeUniqueConstraintError" ||
    code === "ER_DUP_ENTRY" ||
    errno === 1062
  );
}

/** Match MySQL DATETIME storage (server TZ +03:00). */
function formatCallTimeForDb(callTime) {
  return moment(callTime).utcOffset("+03:00").format("YYYY-MM-DD HH:mm:ss");
}

async function findMissedCallRow(caller, agentId, callTime) {
  const timeStr = formatCallTimeForDb(callTime);

  const rows = await sequelize.query(
    `
    SELECT id FROM MissedCalls
    WHERE caller = :caller
      AND agentId = :agentId
      AND time = :time
    LIMIT 1
    `,
    {
      replacements: { caller, agentId, time: timeStr },
      type: QueryTypes.SELECT,
    }
  );

  if (rows[0]?.id) {
    return MissedCall.findByPk(rows[0].id, {
      include: [
        {
          model: User,
          as: "agent",
          attributes: ["full_name", "extension"],
          required: false,
        },
      ],
    });
  }

  return MissedCall.findOne({
    where: { caller, agentId },
    order: [["time", "DESC"]],
    include: [
      {
        model: User,
        as: "agent",
        attributes: ["full_name", "extension"],
        required: false,
      },
    ],
  });
}

function toMissedCallPayload(mc) {
  if (!mc) return null;
  const row = mc.toJSON ? mc.toJSON() : mc;
  row.agent_name = row.agent ? row.agent.full_name : null;
  delete row.agent;
  return row;
}

// POST — INSERT IGNORE so duplicate SIP events never crash the API
router.post("/", async (req, res) => {
  try {
    const { caller, time, agentId } = req.body;

    if (!caller || !time || !agentId) {
      return res.status(400).json({
        error: "Missing required fields: caller, time, agentId",
      });
    }

    const callTime = new Date(time);
    if (Number.isNaN(callTime.getTime())) {
      return res.status(400).json({ error: "Invalid time value" });
    }

    const timeStr = formatCallTimeForDb(callTime);

    let existing = await findMissedCallRow(caller, agentId, callTime);
    if (existing) {
      return res.status(200).json(toMissedCallPayload(existing));
    }

    const recentDuplicate = await MissedCall.findOne({
      where: {
        caller,
        agentId,
        [Op.and]: [
          Sequelize.where(
            Sequelize.fn("DATE", Sequelize.col("time")),
            Sequelize.fn("CURDATE")
          ),
          {
            time: {
              [Op.gte]: new Date(
                callTime.getTime() - AGENT_MISSED_DEDUP_SECONDS * 1000
              ),
            },
          },
        ],
      },
      order: [["time", "DESC"]],
    });

    if (recentDuplicate) {
      return res.status(200).json(toMissedCallPayload(recentDuplicate));
    }

    await sequelize.query(
      `
      INSERT IGNORE INTO MissedCalls
        (caller, time, agentId, status, createdAt, updatedAt)
      VALUES
        (:caller, :time, :agentId, 'pending', NOW(), NOW())
      `,
      {
        replacements: { caller, time: timeStr, agentId },
        type: QueryTypes.INSERT,
      }
    );

    existing = await findMissedCallRow(caller, agentId, callTime);
    if (existing) {
      return res.status(201).json(toMissedCallPayload(existing));
    }

    return res.status(200).json({ ok: true, duplicate: true });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      const { caller, time, agentId } = req.body || {};
      const row = await findMissedCallRow(
        caller,
        agentId,
        new Date(time)
      );
      if (row) {
        return res.status(200).json(toMissedCallPayload(row));
      }
      return res.status(200).json({ ok: true, duplicate: true });
    }
    console.error("❌ Error saving missed call:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/", async (req, res) => {
  try {
    const { agentId, startDate, endDate, status } = req.query;
    const limit = Math.min(
      parseInt(req.query.limit, 10) || DEFAULT_LIST_LIMIT,
      500
    );

    const where = {};

    if (agentId) {
      where.agentId = agentId;
    }

    if (status) {
      where.status = status;
    }

    if (startDate && endDate) {
      where.time = {
        [Op.between]: [new Date(startDate), new Date(endDate)],
      };
    } else if (startDate) {
      where.time = { [Op.gte]: new Date(startDate) };
    } else if (endDate) {
      where.time = { [Op.lte]: new Date(endDate) };
    } else if (agentId) {
      where[Op.and] = [
        Sequelize.where(
          Sequelize.fn("DATE", Sequelize.col("time")),
          Sequelize.fn("CURDATE")
        ),
      ];
    }

    const missedCalls = await MissedCall.findAll({
      where,
      order: [["time", "DESC"]],
      limit,
      include: [
        {
          model: User,
          as: "agent",
          attributes: ["full_name", "extension"],
          required: false,
        },
      ],
    });

    res.json(missedCalls.map(toMissedCallPayload));
  } catch (err) {
    console.error("❌ Error fetching missed calls:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { status, called_back_by, called_back_at, billsec } = req.body;

    if (!status) {
      return res.status(400).json({
        error: "Missing required field: status",
      });
    }

    const validStatuses = ["pending", "called_back", "ignored"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: "Invalid status value" });
    }

    const missedCall = await MissedCall.findByPk(id);
    if (!missedCall) {
      return res.status(404).json({ error: "Missed call not found" });
    }

    const updatePayload = { status };

    if (status === "called_back") {
      updatePayload.called_back_by =
        called_back_by ?? missedCall.called_back_by;
      updatePayload.called_back_at = called_back_at
        ? new Date(called_back_at)
        : new Date();
      updatePayload.billsec =
        typeof billsec === "number" ? billsec : missedCall.billsec;
    }

    await missedCall.update(updatePayload);
    res.json(missedCall);
  } catch (error) {
    console.error("❌ Error updating missed call:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
