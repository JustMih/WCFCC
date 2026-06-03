const sequelize = require("../../config/mysql_connection");
const { Op, QueryTypes } = require("sequelize");
const User = require("../../models/User");
const moment = require("moment");
const db = require("../../models");
const CEL = require("../../models/CEL")(
  sequelize,
  require("sequelize").DataTypes
);
const QueueStatus = db.QueueStatus;
const QueueLog = require("../../models/QueueLog")(
  sequelize,
  require("sequelize").DataTypes
);
const {
  getAgentAvailabilityMetrics,
} = require("../../utils/agentAvailabilityHelper");
const {
  countTodayMissedCalls,
  countQueueDroppedInRange,
  getTodayLostCallsList,
  isLostWaitSeconds,
  getTodayBounds,
} = require("../../utils/missedCallHelper");
const { buildCdrDestinationWhere } = require("../../utils/callSummaryReportHelper");
const {
  buildAgentsNameMap,
  resolveAgentForCall,
  extractExtensionFromQueueAgent,
} = require("../../utils/agentExtensionHelper");
const {
  loadSupervisorExtensionSet,
  applyCelRowToCall,
  filterCallsForDisplay,
  summarizeLiveCallBuckets,
} = require("../../utils/liveCallCelHelper");

/* ================= SOCKET.IO ================= */
let ioInstance = null;

const setSocketInstance = (io) => {
  ioInstance = io;
};

const emitDashboardUpdate = (payload) => {
  if (!ioInstance) return;
  ioInstance.emit("public_dashboard_update", payload);
};

/** Fresh lost/dropped totals for today (same logic as reports). */
async function fetchTodayLostDroppedCounts() {
  const { start: dayStart, end: dayEnd } = getTodayBounds();
  let lost = 0;
  let dropped = 0;
  try {
    [lost, dropped] = await Promise.all([
      countTodayMissedCalls(sequelize),
      countQueueDroppedInRange(sequelize, dayStart, dayEnd),
    ]);
  } catch (err) {
    console.error(
      "[publicDashboard] lost/dropped counts failed:",
      err?.message || err
    );
  }
  return {
    lost: Number(lost || 0),
    dropped: Number(dropped || 0),
    dayStart,
    dayEnd,
    timestamp: new Date().toISOString(),
  };
}

/* ================= LOST / DROPPED STATS (lightweight poll) ================= */
const getPublicDashboardCallStats = async (req, res) => {
  try {
    res.json(await fetchTodayLostDroppedCounts());
  } catch (err) {
    console.error("dashboard-call-stats:", err);
    res.status(500).json({ error: "Failed to fetch call stats" });
  }
};

/* ================= PUBLIC DASHBOARD ================= */
const getPublicDashboardData = async (req, res) => {
  try {
    /* ---------- LOST / DROPPED FIRST (always fresh even if CEL fails) ---------- */
    const todayStats = await fetchTodayLostDroppedCounts();
    const lostCount = todayStats.lost;
    const droppedCount = todayStats.dropped;

    /* ---------- AGENT STATUS ---------- */
    const [onlineCount, pauseCount, offlineCount] = await Promise.all([
      User.count({ where: { role: "agent", status: "online" } }),
      User.count({ where: { role: "agent", status: "pause" } }),
      User.count({
        where: {
          role: "agent",
          [Op.or]: [{ status: "offline" }, { status: null }],
        },
      }),
    ]);
    const availability = getAgentAvailabilityMetrics(onlineCount, pauseCount);

    /* ---------- QUEUE STATUS ---------- */
    const queueStatus = QueueStatus
      ? (await QueueStatus.findAll({ order: [["queue", "ASC"]] })).map((q) =>
          q.toJSON()
        )
      : [];

    /* Lost sync runs inside countTodayMissedCalls (throttled) — avoid duplicate work every 2s. */

    /* =====================================================
       CEL LIVE CALL TRACKING (DASHBOARD)
    ====================================================== */
    let enrichedLiveCalls = [];
    let liveBuckets = { active: 0, inQueue: 0, total: 0 };
    try {
    const events = await CEL.findAll({
      where: {
        eventtype: [
          "CHAN_START",
          "ANSWER",
          "HANGUP",
          "APP_START",
          "APP_END",
          "BRIDGE_ENTER",
        ],
        eventtime: {
          [Op.gte]: moment().utcOffset("+03:00").subtract(30, "minutes").toDate(),
        },
      },
      order: [["eventtime", "ASC"]],
      limit: 2000,
    });

    const calls = {};
    const supervisorExts = await loadSupervisorExtensionSet(User);

    for (const row of events) {
      const key = row.linkedid || row.uniqueid;
      if (!key) continue;

      calls[key] ??= {
        linkedid: key,
        caller: row.cid_num || "-",
        callee: row.exten || row.cid_dnid || "-",
        agent_extension: null,
        call_start: null,
        call_answered: null,
        call_end: null,
        queue_entry_time: null,
        status: "calling",
      };

      applyCelRowToCall(calls[key], row, supervisorExts, { isLostWaitSeconds });
    }

    const allCalls = filterCallsForDisplay(Object.values(calls), supervisorExts);
    let liveCalls = allCalls.filter((c) => !c.call_end);

    const liveCallIds = liveCalls
      .map((c) => String(c.linkedid || ""))
      .filter(Boolean);
    if (liveCallIds.length > 0 && QueueLog) {
      try {
        const agentConnects = await QueueLog.findAll({
          where: {
            callid: { [Op.in]: liveCallIds },
            event: { [Op.in]: ["CONNECT", "AGENTCONNECT"] },
            agent: { [Op.ne]: null },
          },
          order: [["time", "DESC"]],
          attributes: ["callid", "agent"],
        });
        for (const row of agentConnects) {
          const call = liveCalls.find(
            (c) => String(c.linkedid) === String(row.callid)
          );
          if (!call) continue;
          const ext = extractExtensionFromQueueAgent(row.agent);
          if (ext && !call.agent_extension) {
            call.agent_extension = ext;
          }
          if (ext) {
            call.call_answered = call.call_answered || new Date();
            call.status = "active";
          }
        }
      } catch (qlErr) {
        console.warn(
          "[publicDashboard] queue_log agent lookup skipped:",
          qlErr?.message || qlErr
        );
      }
    }

    const extensionCandidates = [];
    liveCalls.forEach((c) => {
      if (c.agent_extension) extensionCandidates.push(c.agent_extension);
      if (c.caller) extensionCandidates.push(c.caller);
    });
    const agentsMap = await buildAgentsNameMap(User, extensionCandidates);

    enrichedLiveCalls = liveCalls.map((call) => {
      const resolved = resolveAgentForCall(call, agentsMap);
      return {
        ...call,
        agent_extension: resolved.agent_extension,
        agent_name: resolved.agent_name,
      };
    });

    liveBuckets = summarizeLiveCallBuckets(enrichedLiveCalls);
    } catch (celErr) {
      console.error(
        "[publicDashboard] live calls (CEL) failed:",
        celErr?.message || celErr
      );
    }

    /* =====================================================
       CALL STATISTICS (RESTORED OLD SHAPE)
    ====================================================== */
    const cdrStatsDestFilter = buildCdrDestinationWhere("", "dst");
const totalCounts = await sequelize.query(
  `
  SELECT disposition, COUNT(*) AS count
  FROM cdr
  WHERE ${cdrStatsDestFilter.sql}
  GROUP BY disposition
  `,
  { type: QueryTypes.SELECT }
);


const monthlyCounts = await sequelize.query(
  `
  SELECT disposition, COUNT(*) AS count
  FROM cdr
  WHERE YEAR(cdrstarttime)=YEAR(CURDATE())
    AND MONTH(cdrstarttime)=MONTH(CURDATE())
    AND ${cdrStatsDestFilter.sql}
  GROUP BY disposition
  `,
  { type: QueryTypes.SELECT }
);


  const dailyCounts = await sequelize.query(
  `
  SELECT disposition, COUNT(*) AS count
  FROM cdr
  WHERE DATE(cdrstarttime)=CURDATE()
    AND ${cdrStatsDestFilter.sql}
  GROUP BY disposition
  `,
  { type: QueryTypes.SELECT }
);


      const totalRows = dailyCounts.reduce(
        (sum, row) => sum + Number(row.count || 0),
        0
      );


    /* ================= FINAL PAYLOAD ================= */
   const payload = {
  agentStatus: {
    onlineCount,
    pauseCount,
    offlineCount,
    totalActive: availability.totalActive,
    onlinePercent: availability.onlinePercent,
    pausePercent: availability.pausePercent,
  },
  liveCalls: enrichedLiveCalls,
  callStatusSummary: {
    active: liveBuckets.active,
    inQueue: liveBuckets.inQueue,
    answered: liveBuckets.active,
    dropped: Number(droppedCount || 0),
    lost: Number(lostCount || 0),
  },
  callStatistics: {
    lost: Number(lostCount || 0),
    dropped: Number(droppedCount || 0),
  },
  callStats: {
    totalCounts,
    monthlyCounts,
    dailyCounts,
    totalRows,
  },
  queueStatus,
  timestamp: todayStats.timestamp,
  callStatsDay: {
    start: todayStats.dayStart,
    end: todayStats.dayEnd,
  },
};


    emitDashboardUpdate(payload);
    res.json(payload);
  } catch (err) {
    console.error("❌ Dashboard Error", err);
    res.status(500).json({ error: "Dashboard failed" });
  }
};

/* ================= LOST CALLS LIST ================= */
const getLostCallsToday = async (req, res) => {
  try {
    const rows = await getTodayLostCallsList(sequelize);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch lost calls" });
  }
};

/* ================= PERIODIC UPDATES ================= */
const startPeriodicUpdates = () => {
  setInterval(async () => {
    try {
      const fakeReq = {};
      const fakeRes = { json: () => {} };
      await getPublicDashboardData(fakeReq, fakeRes);
    } catch (err) {
      console.error("Periodic update error:", err);
    }
  }, 10000);
};

/* ================= EXPORTS ================= */
module.exports = {
  getPublicDashboardData,
  getPublicDashboardCallStats,
  getLostCallsToday,
  setSocketInstance,
  startPeriodicUpdates,
};
