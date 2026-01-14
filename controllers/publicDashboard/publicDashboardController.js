 const sequelize = require("../../config/mysql_connection");
const { Op } = require("sequelize");
const User = require("../../models/User");
const CEL = require("../../models/CEL")(
  sequelize,
  require("sequelize").DataTypes
);
const moment = require("moment");
const db = require("../../models");

const QueueStatus = db.QueueStatus;

/* ======================================================
   SOCKET.IO
====================================================== */

let ioInstance = null;

const setSocketInstance = (io) => {
  ioInstance = io;
};

const emitDashboardUpdate = (data) => {
  if (ioInstance) {
    ioInstance.emit("public_dashboard_update", data);
  }
};

/* ======================================================
   HELPERS
====================================================== */

const normalizeNumber = (val) => {
  if (!val) return null;
  const match = val.toString().match(/\d+/g);
  return match ? match.join("") : null;
};

/* ======================================================
   MISSED CALL INSERT
====================================================== */

const insertMissedCall = async ({ caller, time, linkedid }) => {
  const normalizedCaller = normalizeNumber(caller);
  if (!normalizedCaller || !time || !linkedid) return;

  await sequelize.query(
    `
    INSERT INTO MissedCalls
      (caller, time, status, linkedid, createdAt, updatedAt)
    SELECT
      :caller, :time, 'pending', :linkedid, NOW(), NOW()
    FROM DUAL
    WHERE NOT EXISTS (
      SELECT 1 FROM MissedCalls WHERE linkedid = :linkedid
    )
    `,
    {
      replacements: {
        caller: normalizedCaller,
        time,
        linkedid,
      },
    }
  );
};

/* ======================================================
   MISSED CALL UPDATE (CALLBACK)
====================================================== */

const updateMissedCallOnCallback = async ({
  agentExt,
  caller,
  callbackTime,
  billsec,
}) => {
  if (!agentExt || !caller || !callbackTime) return;

  await sequelize.query(
    `
    UPDATE MissedCalls
    SET
      status = 'called_back',
      called_back_by = :agentExt,
      called_back_at = :callbackTime,
      billsec = :billsec,
      updatedAt = NOW()
    WHERE
      status = 'pending'
      AND archived = 0
      AND caller = :caller
      AND time < :callbackTime
    ORDER BY time DESC
    LIMIT 1
    `,
    {
      replacements: {
        agentExt,
        caller,
        callbackTime,
        billsec: billsec || 0,
      },
    }
  );
};

/* ======================================================
   PUBLIC DASHBOARD CONTROLLER
====================================================== */

const getPublicDashboardData = async (req, res) => {
  try {
    /* ---------- AGENT STATUS ---------- */

    const onlineCount = await User.count({
      where: { status: "online", role: "agent" },
    });

    const offlineCount = await User.count({
      where: {
        role: "agent",
        [Op.or]: [{ status: "offline" }, { status: null }],
      },
    });

    /* ---------- CEL EVENTS ---------- */

    const events = await CEL.findAll({
      where: {
        eventtype: [
          "CHAN_START",
          "ANSWER",
          "HANGUP",
          "APP_START",
          "BRIDGE_ENTER",
        ],
        eventtime: { [Op.gte]: moment().subtract(5, "minutes").toDate() },
      },
      order: [["eventtime", "ASC"]],
      limit: 1000,
    });

    const calls = {};

    for (const row of events) {
      const key = row.linkedid || row.uniqueid;

      if (!calls[key]) {
        calls[key] = {
          linkedid: key,
          caller: row.cid_num || null,
          channel: row.channame || null,
          call_start: null,
          call_answered: null,
          call_end: null,
          queue_entry_time: null,
          status: "calling",
        };
      }

      const c = calls[key];

      switch (row.eventtype) {
        case "CHAN_START":
          if (!c.call_start) c.call_start = row.eventtime;
          break;

        case "APP_START":
          if (row.appname === "Queue" && !c.queue_entry_time) {
            c.queue_entry_time = row.eventtime;
          }
          break;

        case "ANSWER":
          if (!c.call_answered) {
            c.call_answered = row.eventtime;

            await updateMissedCallOnCallback({
              agentExt: row.src || row.peer,
              caller: normalizeNumber(row.exten || row.cid_num),
              callbackTime: row.eventtime,
              billsec: row.billsec,
            });
          }
          break;

        case "BRIDGE_ENTER":
          c.status = "active";
          break;

        case "HANGUP":
          c.call_end = row.eventtime;

          if (!c.call_answered && c.queue_entry_time) {
            c.status = "lost";

            await insertMissedCall({
              caller: c.caller,
              time: row.eventtime,
              linkedid: c.linkedid,
            });
          } else if (!c.call_answered) {
            c.status = "dropped";
          } else {
            c.status = "ended";
          }
          break;
      }
    }

    /* ---------- LIVE CALLS ---------- */

    const liveCalls = Object.values(calls).filter(
      (c) => c.status === "active"
    );

    /* ---------- LOST COUNT ---------- */

    const lostResult = await sequelize.query(
      `
      SELECT COUNT(*) AS count
      FROM cdr
      WHERE DATE(cdrstarttime) = CURDATE()
        AND disposition = 'NO ANSWER'
        AND lastapp = 'Queue'
      `,
      { type: sequelize.QueryTypes.SELECT }
    );

    const lostCount = parseInt(lostResult[0]?.count || 0);

    /* ---------- QUEUE STATUS ---------- */

    const queueStatus = QueueStatus
      ? (await QueueStatus.findAll({ order: [["queue", "ASC"]] })).map((q) =>
          q.toJSON()
        )
      : [];

    /* ---------- RESPONSE ---------- */

    const dashboardData = {
      agentStatus: { onlineCount, offlineCount },
      liveCalls,
      callStatusSummary: {
        active: liveCalls.length,
        lost: lostCount,
      },
      queueStatus,
      timestamp: new Date().toISOString(),
    };

    emitDashboardUpdate(dashboardData);
    res.json(dashboardData);
  } catch (err) {
    console.error("Dashboard error:", err);
    res.status(500).json({ error: "Dashboard failed" });
  }
};

/* ======================================================
   PERIODIC UPDATES
====================================================== */

const startPeriodicUpdates = () => {
  setInterval(async () => {
    try {
      const data = await getPublicDashboardData(
        { internal: true },
        { json: () => {} }
      );
      emitDashboardUpdate(data);
    } catch (err) {
      console.error("Periodic update failed:", err);
    }
  }, 2000);
};

/* ======================================================
   EXPORTS
====================================================== */

module.exports = {
  getPublicDashboardData,
  setSocketInstance,
  startPeriodicUpdates,
};
