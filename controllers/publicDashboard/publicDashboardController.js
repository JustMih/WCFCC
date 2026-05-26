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
  DEDUP_WINDOW_SECONDS,
  normalizeCaller,
  callerMatchKey,
  dedupeLostCalls,
  dedupeIncomingLostCdrs,
} = require("../../utils/missedCallHelper");
const { getCdrSessionIdExpr } = require("../../utils/cdrSchemaHelper");

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
       LOST CALL INSERTION (KEEP AS-IS)
    ====================================================== */
    const sessionIdExpr = await getCdrSessionIdExpr(sequelize, "c");
    const lostCdrsRaw = await sequelize.query(
      `
      SELECT
        ${sessionIdExpr} AS session_id,
        MIN(
          COALESCE(
            NULLIF(TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(c.clid, '<', -1), '>', 1)), ''),
            NULLIF(TRIM(c.src), ''),
            NULLIF(TRIM(c.clid), '')
          )
        ) AS caller,
        MIN(c.cdrstarttime) AS call_time
      FROM cdr c
      WHERE DATE(c.cdrstarttime) = CURDATE()
        AND c.disposition = 'NO ANSWER'
        AND c.lastapp = 'Queue'
        AND (c.clid IS NOT NULL OR c.src IS NOT NULL)
      GROUP BY ${sessionIdExpr}
      ORDER BY call_time DESC
      LIMIT 200
      `,
      { type: QueryTypes.SELECT }
    );

    const lostCdrs = dedupeIncomingLostCdrs(lostCdrsRaw);

    for (const cdr of lostCdrs) {
      const caller = normalizeCaller(cdr.caller);
      if (caller === "UNKNOWN") continue;

      const matchKey = callerMatchKey(caller);
      const existingRows = await sequelize.query(
        `
        SELECT id, caller, time
        FROM MissedCalls
        WHERE DATE(time) = CURDATE()
          AND (archived = 0 OR archived IS NULL)
          AND ABS(TIMESTAMPDIFF(SECOND, time, :time)) <= :windowSec
        `,
        {
          replacements: {
            time: cdr.call_time,
            windowSec: DEDUP_WINDOW_SECONDS,
          },
          type: QueryTypes.SELECT,
        }
      );

      const duplicate = existingRows.some(
        (row) => callerMatchKey(row.caller) === matchKey
      );
      if (duplicate) continue;

      const linkedExists = await sequelize.query(
        `
        SELECT id FROM MissedCalls
        WHERE DATE(time) = CURDATE()
          AND linkedid = :linkedid
          AND linkedid IS NOT NULL
        LIMIT 1
        `,
        {
          replacements: { linkedid: cdr.session_id },
          type: QueryTypes.SELECT,
        }
      );
      if (linkedExists.length > 0) continue;

      await sequelize.query(
        `
        INSERT INTO MissedCalls
          (caller, time, agentId, linkedid, status, createdAt, updatedAt)
        VALUES
          (:caller, :time, NULL, :linkedid, 'pending', NOW(), NOW())
        `,
        {
          replacements: {
            caller,
            time: cdr.call_time,
            linkedid: cdr.session_id,
          },
          type: QueryTypes.INSERT,
        }
      );
    }

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
    for (const row of events) {
      const key = row.linkedid || row.uniqueid;
      if (!key) continue;
 
      calls[key] ??= {
        linkedid: key,
        caller: row.cid_num || "-",
        callee: row.exten || row.cid_dnid || "-",
        agent_extension: null, // 👈 starts empty
        call_start: null,
        call_answered: null,
        call_end: null,
        queue_entry_time: null,
        status: "calling",
      };

      const c = calls[key];
      switch (row.eventtype) {
        case "CHAN_START":
          c.call_start ??= row.eventtime;
          break;
        case "APP_START":
          if (row.appname === "Queue" || row.appname === "AppQueue")
            c.queue_entry_time ??= row.eventtime;
          break;
       case "ANSWER":
        case "BRIDGE_ENTER": {
          c.call_answered ??= row.eventtime;
          c.status = "active";

          // ✅ Extract agent extension ONLY here
          if (!c.agent_extension) {
            const src = row.channel || row.peer || "";
            const match = src.match(/\/(\d+)-/);
            if (match) {
              c.agent_extension = match[1];
            }
          }
          break;
        }

        case "HANGUP":
          c.call_end = row.eventtime;
          if (!c.call_answered && c.queue_entry_time) c.status = "lost";
          else if (!c.call_answered) c.status = "dropped";
          else c.status = "ended";
          break;
      }
    }

    const allCalls = Object.values(calls);
    const liveCalls = allCalls.filter((c) => !c.call_end);
    const activeCalls = liveCalls.filter((c) => c.status === "active");
   
  const inQueueCalls = liveCalls.filter(
  c => c.queue_entry_time && !c.call_answered
).length;


    const droppedCalls = allCalls.filter((c) => c.status === "dropped");
// Collect unique agent extensions from active calls
const agentExtensions = [
  ...new Set(
    activeCalls
      .map(c => c.agent_extension)
      .filter(ext => ext && ext.length >= 3)
  )
];

let agentsMap = {};

if (agentExtensions.length > 0) {
  const agents = await User.findAll({
    where: {
      extension: agentExtensions,
    },
    attributes: ["extension", "full_name", "username"],
    raw: true,
  });

        agents.forEach(a => {
          agentsMap[a.extension] = a.full_name || a.username || `Agent ${a.extension}`;
        });
      }
      const enrichedActiveCalls = activeCalls.map(call => ({
        ...call,
        agent_name: call.agent_extension
          ? agentsMap[call.agent_extension] || "Unknown Agent"
          : "Unknown Agent",
      }));

  
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


    const [{ count: lostCount }] = await sequelize.query(
      `
      SELECT COUNT(*) AS count
      FROM cdr
      WHERE DATE(cdrstarttime)=CURDATE()
        AND disposition='NO ANSWER'
        AND lastapp='Queue'
      `,
      { type: QueryTypes.SELECT }
    );
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
    dropped: droppedCalls.length,
    lost: Number(lostCount || 0),
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
    const rows = await sequelize.query(
      `
      SELECT
        mc.id,
        mc.caller,
        mc.time AS lost_time,
        mc.status,
        mc.called_back_at,
        mc.called_back_by,
        mc.billsec,
        COALESCE(u.full_name, u.username, mc.called_back_by, '—') AS agent_name
      FROM MissedCalls mc
      LEFT JOIN Users u ON u.extension = mc.called_back_by
      WHERE DATE(mc.time)=CURDATE()
        AND mc.archived=0
      ORDER BY mc.time DESC
      `,
      { type: QueryTypes.SELECT }
    );
    res.json(dedupeLostCalls(rows, "lost_time"));
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
