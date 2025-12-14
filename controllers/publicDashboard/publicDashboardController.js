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

// Socket.IO instance for real-time updates
let ioInstance = null;

// Setup socket instance
const setSocketInstance = (io) => {
  ioInstance = io;
};

// Emit dashboard update to all connected clients
const emitDashboardUpdate = (dashboardData) => {
  if (ioInstance) {
    ioInstance.emit("public_dashboard_update", dashboardData);
  }
};

// Public dashboard data aggregator - No authentication required
const getPublicDashboardData = async (req, res) => {
  try {
    // Get agent status counts
    const onlineCount = await User.count({
      where: {
        status: "online",
        role: "agent",
      },
    });

    const offlineCount = await User.count({
      where: {
        role: "agent",
        [Op.or]: [{ status: "offline" }, { status: null }],
      },
    });

    // Get live calls
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
          caller: row.cid_num || "-",
          cid_dnid: row.cid_dnid || "-",
          callee: row.cid_dnid || row.peer || row.exten || "-",
          channel: row.channame || "-",
          linkedid: key,
          call_start: null,
          call_answered: null,
          call_end: null,
          status: "calling",
          duration_secs: null,
          queue_entry_time: null,
          estimated_wait_time: null,
          voicemail_path: null,
          missed: false,
        };
      }

      const c = calls[key];
      switch (row.eventtype) {
        case "CHAN_START":
          if (!c.call_start) {
            c.call_start = row.eventtime;
            // Don't set queue_entry_time here - only set it when APP_START with Queue occurs
            console.log(`📞 CHAN_START: ${key} at ${row.eventtime}`);
          }
          c.status = "calling";
          break;
        case "ANSWER":
          if (!c.call_answered) {
            c.call_answered = row.eventtime;
            c.status = "calling";
            console.log(`✅ ANSWER: ${key} at ${row.eventtime}`);
          }
          break;
        case "BRIDGE_ENTER":
          // If call has not been answered and Bridge Enter event occurs, mark it as answered and active
          c.status = "active"; // Set status to active since the call is bridged
          console.log(`🔗 BRIDGE_ENTER: ${key} at ${row.eventtime}`);
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
          console.log(`📴 HANGUP: ${key} => ${c.status} at ${row.eventtime}`);
          break;
        case "APP_START":
          if (row.appname === "Queue") {
            if (!c.queue_entry_time) {
              c.queue_entry_time = row.eventtime;
            }
            // Keep status as "calling" when in queue - don't change it
            console.log(`📥 Queue Entered: ${key} at ${row.eventtime}`);
          }
          if (row.appname === "VoiceMail") {
            c.voicemail_path = `/recorded/voicemails/${key}.wav`;
            console.log(`🗣️ Voicemail triggered for ${key}`);
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
    const dailyCounts = await sequelize.query(
      "SELECT disposition, COUNT(*) AS count FROM cdr WHERE DATE(cdrstarttime) = CURDATE() GROUP BY disposition"
    );
    const totalRows = await sequelize.query(
      "SELECT COUNT(*) AS total FROM cdr"
    );

    // Get queue status
    let queueStatus = [];
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

    // Aggregate response
    const dashboardData = {
      agentStatus: {
        onlineCount,
        offlineCount,
      },
      liveCalls: activeCalls, // Only show active calls in main display
      callStatusSummary: {
        active: activeCalls.length,
        inQueue: inQueueCalls.length, // Currently waiting in queue
        answered: answeredCalls.length,
        dropped: droppedCalls.length,
        lost: lostCallsCountToday, // Total lost calls today (from CDR)
      },
      callStats: {
        dailyCounts: dailyCounts[0] || [],
        totalRows: totalRows[0]?.[0]?.total || 0,
      },
      queueStatus: queueStatus.map((q) => q.toJSON()),
      timestamp: new Date().toISOString(),
    };

    // Emit real-time update via Socket.IO
    emitDashboardUpdate(dashboardData);

    res.status(200).json(dashboardData);
  } catch (error) {
    console.error("Error fetching public dashboard data:", error);
    res.status(500).json({
      error: "Failed to fetch dashboard data",
      message: error.message,
    });
  }
};

// Start periodic updates (call this from server.js after socket setup)
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
