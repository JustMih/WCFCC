const express = require("express");
const router = express.Router();
const { MissedCall, User } = require("../models");
const { Op } = require("sequelize");
const { Sequelize } = require("sequelize");

const AGENT_MISSED_DEDUP_SECONDS = 120;

// ✅ POST a new missed call
router.post("/", async (req, res) => {
  try {
    const { caller, time, agentId } = req.body;

    // Debug: Log received data
    console.log("🔁 Incoming POST /missed-calls:", { caller, time, agentId });

    // Basic validation
    if (!caller || !time || !agentId) {
      console.warn("⚠️ Missing fields in POST /missed-calls");
      return res.status(400).json({ error: "Missing required fields: caller, time, agentId" });
    }

    const callTime = new Date(time);
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
      await recentDuplicate.update({ time: callTime, updatedAt: new Date() });
      console.log("✅ Missed call deduped (updated time):", recentDuplicate.toJSON());
      return res.status(200).json(recentDuplicate);
    }

    const missedCall = await MissedCall.create({
      caller,
      time: callTime,
      agentId,
    });

    console.log("✅ Missed call saved:", missedCall.toJSON());
    res.status(201).json(missedCall);
  } catch (error) {
    console.error("❌ Error saving missed call:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});


// 🔁 GET all or filtered missed calls by erassing called_back
 
 router.get("/", async (req, res) => {
  try {
    console.log("📥 GET /missed-calls called with query:", req.query);

    const { agentId, startDate, endDate, status } = req.query;

    const where = {};

    if (agentId) {
      where.agentId = agentId;
    }

    // ✅ STATUS FILTER (THIS WAS MISSING)
    if (status) {
      where.status = status;
    }

    if (startDate && endDate) {
      where.time = {
        [Op.between]: [new Date(startDate), new Date(endDate)],
      };
    } else if (startDate) {
      where.time = {
        [Op.gte]: new Date(startDate),
      };
    } else if (endDate) {
      where.time = {
        [Op.lte]: new Date(endDate),
      };
    }

    const missedCalls = await MissedCall.findAll({
      where,
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

    const payload = missedCalls.map((mc) => {
      const row = mc.toJSON();
      row.agent_name = row.agent ? row.agent.full_name : null;
      delete row.agent;
      return row;
    });

    res.json(payload);
  } catch (err) {
    console.error("❌ Error fetching missed calls:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.put("/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const {
      status,
      called_back_by,
      called_back_at,
      billsec,
    } = req.body;

    console.log("🔄 PUT /missed-calls/:id/status:", {
      id,
      status,
      called_back_by,
      called_back_at,
      billsec,
    });

    if (!status) {
      return res.status(400).json({
        error: "Missing required field: status",
      });
    }

    const validStatuses = ["pending", "called_back", "ignored"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        error: "Invalid status value",
      });
    }

    const missedCall = await MissedCall.findByPk(id);
    if (!missedCall) {
      return res.status(404).json({
        error: "Missed call not found",
      });
    }

    // ✅ Build update payload dynamically
    const updatePayload = { status };

    if (status === "called_back") {
      updatePayload.called_back_by =
        called_back_by ?? missedCall.called_back_by;

      updatePayload.called_back_at =
        called_back_at ? new Date(called_back_at) : new Date();

      updatePayload.billsec =
        typeof billsec === "number" ? billsec : missedCall.billsec;
    }

    await missedCall.update(updatePayload);

    console.log("✅ Missed call fully updated:", missedCall.toJSON());

    res.json(missedCall);
  } catch (error) {
    console.error("❌ Error updating missed call:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;