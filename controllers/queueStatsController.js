"use strict";

const sequelize = require("../config/mysql_connection");
const moment = require("moment");
const {
  isLostWaitSeconds,
  isDroppedWaitSeconds,
  parseQueueLogWaitSeconds,
} = require("../utils/missedCallHelper");
const { extractExtensionFromQueueAgent } = require("../utils/agentExtensionHelper");

const COMPLETE_EVENTS = new Set([
  "COMPLETEAGENT",
  "COMPLETECALLER",
  "ABANDON",
  "EXITWITHTIMEOUT",
]);

/**
 * Build live waiting + active calls from queue_log (independent of CEL).
 * Does not classify dropped/lost — only returns calls still on the wallboard.
 */
async function getLiveCallsFromQueueLog() {
  const since = moment().subtract(30, "minutes").format("YYYY-MM-DD HH:mm:ss");

  const rows = await sequelize.query(
    `
    SELECT callid, queuename, agent, event, time, data1
    FROM queue_log
    WHERE time >= :since
    ORDER BY time ASC
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
      linkedid: id,
      caller: row.data1 || "Unknown",
      callee: row.queuename || "unknown",
      joinedAt: row.time,
      queue_entry_time: row.time,
      call_start: row.time,
      answered: false,
      ended: false,
      agent: null,
    };

    const c = calls[id];
    const ev = String(row.event || "").toUpperCase();

    if (ev === "QUEUEENTRY" || ev === "ENTERQUEUE") {
      c.joinedAt = c.joinedAt || row.time;
      c.queue_entry_time = c.queue_entry_time || row.time;
      c.call_start = c.call_start || row.time;
      if (row.data1) c.caller = row.data1;
    }
    if (ev === "AGENTCONNECT" || ev === "CONNECT") {
      c.answered = true;
      c.call_answered = row.time;
      c.agent = row.agent;
    }
    if (COMPLETE_EVENTS.has(ev)) {
      c.ended = true;
      c.call_end = row.time;
    }
    if (ev === "LEAVE" && !c.answered) {
      c.ended = true;
      c.call_end = row.time;
    }
  }

  const live = [];
  for (const call of Object.values(calls)) {
    if (call.ended) continue;
    const agentExt = extractExtensionFromQueueAgent(call.agent);
    live.push({
      linkedid: call.linkedid,
      caller: call.caller,
      callee: call.callee,
      status: call.answered ? "active" : "calling",
      call_start: call.call_start,
      queue_entry_time: call.queue_entry_time,
      call_answered: call.call_answered || null,
      call_end: null,
      agent_extension: agentExt,
      agent_name: agentExt ? `Ext ${agentExt}` : "Waiting for agent",
    });
  }

  return live;
}

function sumQueueStatusCounts(queueStatus) {
  const rows = Array.isArray(queueStatus) ? queueStatus : [];
  return {
    waiting: rows.reduce((sum, q) => sum + Number(q.callers || 0), 0),
    active: rows.reduce((sum, q) => sum + Number(q.busyAgents || 0), 0),
  };
}

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
        const logWait = parseQueueLogWaitSeconds(row);
        if (logWait != null) c.queueWaitSeconds = logWait;
      }
    }

    const inQueue = [];
    const dropped = [];
    const lost = [];
    const answered = [];

    for (const call of Object.values(calls)) {
      const joined = new Date(call.joinedAt);
      const left = call.leftAt ? new Date(call.leftAt) : null;
      const elapsedWait = left ? (left - joined) / 1000 : null;
      const waitSeconds =
        call.queueWaitSeconds != null
          ? Math.max(call.queueWaitSeconds, elapsedWait || 0)
          : elapsedWait;

      if (!call.leftAt && !call.answered) {
        inQueue.push(call);
      } else if (call.answered) {
        answered.push({ ...call, waitSeconds });
      } else if (left) {
        if (waitSeconds != null && isDroppedWaitSeconds(waitSeconds)) {
          dropped.push({ ...call, waitSeconds });
        } else if (waitSeconds != null && isLostWaitSeconds(waitSeconds)) {
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

module.exports = {
  getQueueCallStats,
  getLiveCallsFromQueueLog,
  sumQueueStatusCounts,
};
