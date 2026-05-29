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
const {
  countTodayMissedCalls,
  countQueueDroppedInRange,
  ensureLostAbandonsInMissedCalls,
  getTodayLostCallsList,
  isLostWaitSeconds,
} = require("../../utils/missedCallHelper");
const {
  buildAgentsNameMap,
  resolveAgentForCall,
} = require("../../utils/agentExtensionHelper");
const {
  loadSupervisorExtensionSet,
  applyCelRowToCall,
  filterCallsForDisplay,
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

/* ================= PUBLIC DASHBOARD ================= */
const getPublicDashboardData = async (req, res) => {
  try {
    /* ---------- AGENT STATUS ---------- */
    const [onlineCount, offlineCount] = await Promise.all([
      User.count({ where: { role: "agent", status: "online" } }),
      User.count({
        where: {
          role: "agent",
          [Op.or]: [{ status: "offline" }, { status: null }],
        },
      }),
    ]);

    /* ---------- QUEUE STATUS ---------- */
    const queueStatus = QueueStatus
      ? (await QueueStatus.findAll({ order: [["queue", "ASC"]] })).map((q) =>
          q.toJSON()
        )
      : [];

    /* =====================================================
       CALLBACK DETECTION (KEEP AS-IS)
    ====================================================== */
    const callbackCdrs = await sequelize.query(
      `
      SELECT uniqueid, src, dst, channel, lastdata, billsec,
             cdrstarttime AS callback_time
      FROM cdr
      WHERE DATE(cdrstarttime) = CURDATE()
        AND disposition = 'ANSWERED'
        AND (lastapp IN ('Dial','PJSIP','SIP')
             OR lastdata LIKE '%@%'
             OR lastdata LIKE '%,%')
        AND cdrstarttime > DATE_SUB(NOW(), INTERVAL 2 HOUR)
      ORDER BY cdrstarttime DESC
      LIMIT 100
      `,
      { type: QueryTypes.SELECT }
    );

    for (const cb of callbackCdrs) {
      let agentExt = "";
      const chanMatch = (cb.channel || "").match(/\/(\d+)-/);
      if (chanMatch) agentExt = chanMatch[1];
      else {
        const dataMatch =
          (cb.lastdata || "").match(/PJSIP\/(\d+)/) ||
          (cb.lastdata || "").match(/^(\d+),/);
        if (dataMatch) agentExt = dataMatch[1];
      }

      let calledNumber = (cb.dst || "").replace(/[^0-9+]/g, "");
      if (calledNumber.startsWith("255")) calledNumber = "0" + calledNumber.slice(3);
      if (calledNumber.startsWith("+255")) calledNumber = "0" + calledNumber.slice(4);
      if (calledNumber.startsWith("+")) calledNumber = calledNumber.slice(1);

      if (!agentExt || agentExt.length < 3 || calledNumber.length < 9) continue;

     await sequelize.query(
  `
  UPDATE IGNORE MissedCalls
  SET
    status = 'called_back',
    called_back_at = :callback_time,
    called_back_by = :agent_ext,
    agentId = :agent_ext,
    billsec = :billsec,
    updatedAt = NOW()
  WHERE
    status = 'pending'
    AND (called_back_by IS NULL OR called_back_by = '')
    AND DATE(time) = CURDATE()
    AND :callback_time > time
    AND (caller = :calledNumber OR caller LIKE CONCAT('%', :calledNumber, '%'))
  ORDER BY time DESC
  LIMIT 1
  `,
  {
    replacements: {
      calledNumber,
      callback_time: cb.callback_time,
      agent_ext: agentExt,
      billsec: cb.billsec || 0,
    },
    type: QueryTypes.UPDATE,
  }
);

    }

    /* =====================================================
       CEL LIVE CALL TRACKING (DASHBOARD)
    ====================================================== */
    const events = await CEL.findAll({
      where: {
        eventtype: [
          "CHAN_START",
          "ANSWER",
          "HANGUP",
          "APP_START",
          "BRIDGE_ENTER",
        ],
        eventtime: {
          [Op.gte]: moment().utcOffset("+03:00").subtract(20, "minutes").toDate(),
        },
      },
      order: [["eventtime", "ASC"]],
      limit: 1000,
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
    const liveCalls = allCalls.filter((c) => !c.call_end);
    const activeCalls = liveCalls.filter((c) => c.status === "active");
   
  const inQueueCalls = liveCalls.filter(
  c => c.queue_entry_time && !c.call_answered
).length;


    const droppedCalls = allCalls.filter((c) => c.status === "dropped");
const extensionCandidates = [];
      activeCalls.forEach((c) => {
        if (c.agent_extension) extensionCandidates.push(c.agent_extension);
        if (c.caller) extensionCandidates.push(c.caller);
      });
      const agentsMap = await buildAgentsNameMap(User, extensionCandidates);

      const enrichedActiveCalls = activeCalls.map((call) => {
        const resolved = resolveAgentForCall(call, agentsMap);
        return {
          ...call,
          agent_extension: resolved.agent_extension,
          agent_name: resolved.agent_name,
        };
      });

  
    /* =====================================================
       CALL STATISTICS (RESTORED OLD SHAPE)
    ====================================================== */
const totalCounts = await sequelize.query(
  `
  SELECT disposition, COUNT(*) AS count
  FROM cdr
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
  GROUP BY disposition
  `,
  { type: QueryTypes.SELECT }
);


  const dailyCounts = await sequelize.query(
  `
  SELECT disposition, COUNT(*) AS count
  FROM cdr
  WHERE DATE(cdrstarttime)=CURDATE()
  GROUP BY disposition
  `,
  { type: QueryTypes.SELECT }
);


    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    const dayStart = `${y}-${m}-${d} 00:00:00`;
    const dayEnd = `${y}-${m}-${d} 23:59:59`;

    await ensureLostAbandonsInMissedCalls(sequelize);

    const [lostCount, droppedCount] = await Promise.all([
      countTodayMissedCalls(sequelize),
      countQueueDroppedInRange(sequelize, dayStart, dayEnd),
    ]);

      const totalRows = dailyCounts.reduce(
        (sum, row) => sum + Number(row.count || 0),
        0
      );


    /* ================= FINAL PAYLOAD ================= */
   const payload = {
  agentStatus: { onlineCount, offlineCount },
  liveCalls: enrichedActiveCalls,
  callStatusSummary: {
    active: activeCalls.length,
    inQueue: inQueueCalls,
    answered: activeCalls.length,
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
  timestamp: new Date().toISOString(),
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
  }, 2000);
};

/* ================= EXPORTS ================= */
module.exports = {
  getPublicDashboardData,
  getLostCallsToday,
  setSocketInstance,
  startPeriodicUpdates,
};
