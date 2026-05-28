"use strict";

const sequelize = require("../config/mysql_connection");
const moment = require("moment");

/**
 * Queue stats for supervisor dashboard (replaces amiServer :5075 route).
 */
async function getQueueCallStats(req, res) {
  try {
    const since = moment().subtract(30, "minutes").format("YYYY-MM-DD HH:mm:ss");

    const rows = await sequelize.query(
      `
      SELECT callid, queuename, agent, event, time, data1
      FROM queue_log
      WHERE time >= :since
      ORDER BY time DESC
      LIMIT 500
      `,
      {
        replacements: { since },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    const calls = {};

    for (const row of rows) {
      const id = row.callid;
      if (!id) continue;
      calls[id] ??= {
        callid: id,
        caller: row.data1 || "Unknown",
        queue: row.queuename || "unknown",
        joinedAt: row.time,
        answered: false,
        leftAt: null,
      };

      const c = calls[id];
      const ev = String(row.event || "").toUpperCase();

      if (ev === "QUEUEENTRY" || ev === "ENTERQUEUE") {
        c.joinedAt = c.joinedAt || row.time;
      }
      if (ev === "AGENTCONNECT" || ev === "CONNECT") {
        c.answered = true;
        c.leftAt = row.time;
        c.agent = row.agent;
      }
      if (ev === "ABANDON" || ev === "EXITWITHTIMEOUT" || ev === "COMPLETEAGENT") {
        c.leftAt = c.leftAt || row.time;
      }
    }

    const inQueue = [];
    const dropped = [];
    const lost = [];
    const answered = [];

    for (const call of Object.values(calls)) {
      const joined = new Date(call.joinedAt);
      const left = call.leftAt ? new Date(call.leftAt) : null;
      const waitSeconds = left ? (left - joined) / 1000 : null;

      if (!call.leftAt && !call.answered) {
        inQueue.push(call);
      } else if (call.answered) {
        answered.push({ ...call, waitSeconds });
      } else if (left) {
        if (waitSeconds != null && waitSeconds < 30) {
          dropped.push({ ...call, waitSeconds });
        } else {
          lost.push({ ...call, waitSeconds });
        }
      }
    }

    res.json({ inQueue, dropped, lost, answered });
  } catch (err) {
    console.error("queue-call-stats error:", err.message);
    res.status(500).json({ error: "Failed to fetch queue stats" });
  }
}

module.exports = { getQueueCallStats };
