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

      if (c.call_start && c.call_end) {
        c.duration_secs = Math.floor(
          (new Date(c.call_end) - new Date(c.call_start)) / 1000
        );
      }
      if (c.queue_entry_time && c.call_answered) {
        c.estimated_wait_time = Math.floor(
          (new Date(c.call_answered) - new Date(c.queue_entry_time)) / 1000
        );
      }

      if (c.call_start)
        c.call_start = moment(c.call_start).format("YYYY-MM-DD HH:mm:ss");
      if (c.call_answered)
        c.call_answered = moment(c.call_answered).format("YYYY-MM-DD HH:mm:ss");
      if (c.call_end)
        c.call_end = moment(c.call_end).format("YYYY-MM-DD HH:mm:ss");
      if (c.queue_entry_time)
        c.queue_entry_time = moment(c.queue_entry_time).format(
          "YYYY-MM-DD HH:mm:ss"
        );
    }

    const liveCalls = Object.values(calls).sort((a, b) => {
      if (a.status === "active" && b.status !== "active") return -1;
      if (b.status === "active" && a.status !== "active") return 1;
      return new Date(b.call_start || 0) - new Date(a.call_start || 0);
    });

    // Get call statistics
    const totalCounts = await sequelize.query(
      "SELECT disposition, COUNT(*) AS count FROM cdr GROUP BY disposition"
    );
    const monthlyCounts = await sequelize.query(
      "SELECT disposition, COUNT(*) AS count FROM cdr WHERE YEAR(cdrstarttime) = YEAR(CURDATE()) AND MONTH(cdrstarttime) = MONTH(CURDATE()) GROUP BY disposition"
    );
    const dailyCounts = await sequelize.query(
      "SELECT disposition, COUNT(*) AS count FROM cdr WHERE DATE(cdrstarttime) = CURDATE() GROUP BY disposition"
    );
    const totalRows = await sequelize.query(
      "SELECT COUNT(*) AS total FROM cdr"
    );

    // Get queue status
    
    if (QueueStatus) {
      queueStatus = await QueueStatus.findAll({
        order: [["queue", "ASC"]],
      });
    }

    // Categorize calls by status
    // Active calls: Currently being handled (BRIDGE_ENTER occurred)
    const activeCalls = liveCalls.filter((call) => call.status === "active");

    // In Queue: Calls that are currently calling, have queue_entry_time (entered queue), but haven't been answered yet
    // This means customer/agent is waiting for an agent to pick up the phone
    // Important: Must have queue_entry_time AND status is still "calling" (not active/ended) AND no call_end
    const inQueueCalls = liveCalls.filter((call) => {
      const hasQueueEntry =
        call.queue_entry_time && call.queue_entry_time !== "-";
      const isStillCalling = call.status === "calling";
      const notAnswered = !call.call_answered || call.call_answered === "-";
      const notEnded = !call.call_end || call.call_end === "-";
      return hasQueueEntry && isStillCalling && notAnswered && notEnded;
    });

    // Answered calls: Calls that were answered (have call_answered timestamp or are active)
    const answeredCalls = liveCalls.filter(
      (call) =>
        call.status === "active" ||
        (call.status === "calling" && call.call_answered)
    );

    // Dropped calls: Calls that hung up without answer and were NOT in queue
    const droppedCalls = liveCalls.filter((call) => call.status === "dropped");

    // Lost calls: Calls that hung up without answer BUT were in queue (waiting for agent)
    // This is the key: lost = in queue but not picked up by agent
    // We'll get this count from CEL events for today

    // Get lost calls count from CDR for today
    // Lost = calls that were in queue (lastapp = 'Queue') but not answered (disposition = 'NO ANSWER')
    const lostCallsToday = await sequelize.query(
      `SELECT COUNT(*) AS count 
       FROM cdr 
       WHERE DATE(cdrstarttime) = CURDATE() 
         AND disposition = 'NO ANSWER' 
         AND lastapp = 'Queue'`,
      { type: sequelize.QueryTypes.SELECT }
    );

   const lostCallsCountToday = parseInt(lostCallsToday[0]?.count || 0);

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
      active: activeCalls.length,
      inQueue: inQueueCalls.length,
      answered: answeredCalls.length,
      dropped: droppedCalls.length,
      lost: lostCallsCountToday,
    },

      callStats: {
        totalCounts: totalCounts[0] || [],
        monthlyCounts: monthlyCounts[0] || [],
        dailyCounts: dailyCounts[0] || [],
        totalRows: totalRows[0]?.[0]?.total || 0,
      },
      queueStatus: queueStatus.map((q) => q.toJSON()),
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
      // Fetch fresh data - simplified version for real-time updates
      const onlineCount = await User.count({
        where: { status: "online", role: "agent" },
      });

      const offlineCount = await User.count({
        where: {
          role: "agent",
          [Op.or]: [{ status: "offline" }, { status: null }],
        },
      });

      // Get live calls with status
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
        limit: 500,
      });

      const calls = {};
      for (const row of events) {
        const key = row.linkedid || row.uniqueid;
        if (!calls[key]) {
          calls[key] = {
            caller: row.cid_num || "-",
            callee: row.cid_dnid || row.peer || row.exten || "-",
            channel: row.channame || "-",
            linkedid: key,
            call_start: null,
            call_answered: null,
            call_end: null,
            status: "calling",
            queue_entry_time: null,
          };
        }

        const c = calls[key];
        switch (row.eventtype) {
          case "CHAN_START":
            if (!c.call_start) {
              c.call_start = row.eventtime;
              // Don't set queue_entry_time here - only when APP_START with Queue
            }
            c.status = "calling";
            break;
          case "ANSWER":
            if (!c.call_answered) {
              c.call_answered = row.eventtime;
              c.status = "calling";
            }
            break;
          case "BRIDGE_ENTER":
            c.status = "active";
            break;
          case "HANGUP":
            c.call_end = row.eventtime;
            if (!c.call_answered && c.queue_entry_time) {
              c.status = "lost";
            } else if (!c.call_answered && !c.queue_entry_time) {
              c.status = "dropped";
            } else {
              c.status = "ended";
            }
            break;
          case "APP_START":
            if (row.appname === "Queue") {
              if (!c.queue_entry_time) {
                c.queue_entry_time = row.eventtime;
              }
              // Keep status as "calling" when in queue
            }
            break;
        }

        // Calculate duration and wait time
        if (c.call_start && c.call_end) {
          c.duration_secs = Math.floor(
            (new Date(c.call_end) - new Date(c.call_start)) / 1000
          );
        }
        if (c.queue_entry_time && c.call_answered) {
          c.estimated_wait_time = Math.floor(
            (new Date(c.call_answered) - new Date(c.queue_entry_time)) / 1000
          );
        }

        // Format timestamps
        if (c.call_start)
          c.call_start = moment(c.call_start).format("YYYY-MM-DD HH:mm:ss");
        if (c.call_answered)
          c.call_answered = moment(c.call_answered).format(
            "YYYY-MM-DD HH:mm:ss"
          );
        if (c.call_end)
          c.call_end = moment(c.call_end).format("YYYY-MM-DD HH:mm:ss");
        if (c.queue_entry_time)
          c.queue_entry_time = moment(c.queue_entry_time).format(
            "YYYY-MM-DD HH:mm:ss"
          );
      }

      const liveCallsArray = Object.values(calls);
      const activeCalls = liveCallsArray.filter((c) => c.status === "active");
      // In Queue: Currently waiting for agent (calling status, in queue, not answered, not ended)
      const inQueueCalls = liveCallsArray.filter((c) => {
        const hasQueueEntry = c.queue_entry_time && c.queue_entry_time !== "-";
        const isStillCalling = c.status === "calling";
        const notAnswered = !c.call_answered || c.call_answered === "-";
        const notEnded = !c.call_end || c.call_end === "-";
        return hasQueueEntry && isStillCalling && notAnswered && notEnded;
      });
      const answeredCalls = liveCallsArray.filter(
        (c) =>
          c.status === "active" || (c.status === "calling" && c.call_answered)
      );
      const droppedCalls = liveCallsArray.filter((c) => c.status === "dropped");

      // Get lost calls count from CDR for today
      // Lost = calls that were in queue (lastapp = 'Queue') but not answered (disposition = 'NO ANSWER')
      const lostCallsToday = await sequelize.query(
        `SELECT COUNT(*) AS count 
         FROM cdr 
         WHERE DATE(cdrstarttime) = CURDATE() 
           AND disposition = 'NO ANSWER' 
           AND lastapp = 'Queue'`,
        { type: sequelize.QueryTypes.SELECT }
      );
      const lostCallsCountToday = parseInt(lostCallsToday[0]?.count || 0);

      // Get call stats
      const totalCounts = await sequelize.query(
        "SELECT disposition, COUNT(*) AS count FROM cdr GROUP BY disposition"
      );
      const monthlyCounts = await sequelize.query(
        "SELECT disposition, COUNT(*) AS count FROM cdr WHERE YEAR(cdrstarttime) = YEAR(CURDATE()) AND MONTH(cdrstarttime) = MONTH(CURDATE()) GROUP BY disposition"
      );
      const dailyCounts = await sequelize.query(
        "SELECT disposition, COUNT(*) AS count FROM cdr WHERE DATE(cdrstarttime) = CURDATE() GROUP BY disposition"
      );

      // Get queue status
      let queueStatus = [];
      if (QueueStatus) {
        queueStatus = await QueueStatus.findAll({
          order: [["queue", "ASC"]],
        });
      }

      const dashboardData = {
        agentStatus: { onlineCount, offlineCount },
        liveCalls: activeCalls, // Include active calls in periodic update
        callStatusSummary: {
          active: activeCalls.length,
          inQueue: inQueueCalls.length, // Currently waiting in queue
          answered: answeredCalls.length,
          dropped: droppedCalls.length,
          lost: lostCallsCountToday, // Total lost calls today
        },
        callStats: {
          totalCounts: totalCounts[0] || [],
          monthlyCounts: monthlyCounts[0] || [],
          dailyCounts: dailyCounts[0] || [],
        },
        queueStatus: queueStatus.map((q) => q.toJSON()),
        timestamp: new Date().toISOString(),
      };

      emitDashboardUpdate(dashboardData);
    } catch (error) {
      console.error("Error in periodic dashboard update:", error);
    }
  }, 2000); // Update every 2 seconds
};

module.exports = {
  getPublicDashboardData,
  setSocketInstance,
  startPeriodicUpdates,
};
