 
"use strict";

/* ============================== LIVE CALL CACHE ============================== */
let liveCallsCache = [];
let lastCacheRefresh = 0;

const sequelize = require("../../config/mysql_connection");
const { DataTypes, Op } = require("sequelize");
const moment = require("moment");

const CEL = require("../../models/CEL")(sequelize, DataTypes);
const QueueLog = require("../../models/QueueLog")(sequelize, DataTypes);
const User = require("../../models/User");

/* ============================== SOCKET STATE ============================== */
let ioInstance = null;

/* ============================== SOCKET SETUP ============================== */
const setupSocket = (io) => {
  ioInstance = io;
  global._io = io;

  io.on("connection", (socket) => {
    console.log("📡 Livestream socket connected:", socket.id);

    socket.on("disconnect", () => {
      console.log("📴 Livestream socket disconnected:", socket.id);
    });
  });
};

/* ============================== HELPERS ============================== */

// Extract extension from QueueLog.agent OR CEL channel
const extractExtension = (value) => {
  if (!value) return null;
  const match = value.match(/\/(\d+)-|(\d+)/);
  return match ? (match[1] || match[2]) : null;
};

/* ============================== SOCKET EMITTER ============================== */
const emitLiveCall = (callData) => {
  if (!ioInstance) return;

  if (callData.call_start && !callData.call_end) {
    callData.duration_secs = moment().diff(
      moment(callData.call_start),
      "seconds"
    );
  }

  ioInstance.emit("live_call_update", callData);
};

/* ============================== LIVE CALL FETCH ============================== */
const getAllLiveCalls = async (req, res) => {
  try {
    /* ---------- FETCH CEL EVENTS ---------- */
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
          [Op.gte]: moment().subtract(5, "minutes").toDate(),
        },
      },
      order: [["eventtime", "ASC"]],
    });

    const calls = {};

    /* ================= BUILD CALL OBJECTS ================= */
    for (const row of events) {
      const key = row.linkedid || row.uniqueid;
      if (!key) continue;

      calls[key] ??= {
        linkedid: key,
        caller: row.cid_num || "-",
        callee: row.cid_dnid || row.peer || row.exten || "-",
        channel: row.channame || row.channel || "-",
        spyCallId: row.channame || row.channel || null,
        call_start: null,
        call_answered: null,
        call_end: null,
        queue_entry_time: null,

        status: "calling",
        duration_secs: null,
        estimated_wait_time: null,
        voicemail_path: null,

        agent_extension: null,
        agent_channel: null,
        agent_name: "Unassigned",
      };

      const c = calls[key];

      switch (row.eventtype) {
        case "CHAN_START":
          c.call_start ??= row.eventtime;
          c.queue_entry_time ??= row.eventtime;
          c.status = "calling";
          break;

        case "ANSWER":
          c.call_answered ??= row.eventtime;
          break;

        case "BRIDGE_ENTER":
          c.status = "active";

          {
            const bridgeChan = row.channame || row.channel;
            const ext = extractExtension(
              row.channel || row.peer || row.channame
            );
            if (ext) {
              c.agent_extension = c.agent_extension || ext;
              if (
                bridgeChan &&
                bridgeChan.includes("PJSIP/") &&
                bridgeChan.includes(`/${ext}-`)
              ) {
                c.agent_channel = bridgeChan;
                c.spyCallId = bridgeChan;
              }
            } else if (bridgeChan && !c.spyCallId) {
              c.spyCallId = bridgeChan;
            }
          }
          break;

        case "HANGUP":
          c.call_end = row.eventtime;
          if (!c.call_answered && c.queue_entry_time) c.status = "lost";
          else if (!c.call_answered) c.status = "dropped";
          else c.status = "ended";
          break;

        case "APP_START":
          if (row.appname === "Queue") {
            c.queue_entry_time = row.eventtime;
          }
          if (row.appname === "VoiceMail") {
            c.voicemail_path = `/recorded/voicemails/${key}.wav`;
          }
          break;
      }

     // Durations
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

        // 🔒 SANITIZE spyCallId (CRITICAL)
        if (c.spyCallId === "-" || c.spyCallId === "") {
          c.spyCallId = null;
        }

        // Emit live updates
        if (["CHAN_START", "ANSWER", "BRIDGE_ENTER"].includes(row.eventtype)) {
          emitLiveCall({ ...c });
        }

    }

    /* ================= FALLBACK: QUEUE_LOG ================= */
    const callIds = Object.keys(calls);

    if (callIds.length > 0) {
      const agentConnects = await QueueLog.findAll({
        where: {
          callid: { [Op.in]: callIds },
          event: "AGENTCONNECT",
          agent: { [Op.ne]: null },
        },
        order: [["time", "DESC"]],
        attributes: ["callid", "agent"],
      });

      agentConnects.forEach((row) => {
        const ext = extractExtension(row.agent);
        if (ext && !calls[row.callid]?.agent_extension) {
          calls[row.callid].agent_extension = ext;
        }
      });
    }

    /* ================= AGENT NAME RESOLUTION ================= */
    const agentExtensions = [
      ...new Set(
        Object.values(calls)
          .map((c) => c.agent_extension)
          .filter(Boolean)
      ),
    ];

    let agentsMap = {};
    if (agentExtensions.length > 0) {
      const agents = await User.findAll({
        where: { extension: agentExtensions },
        attributes: ["extension", "full_name", "username"],
        raw: true,
      });

      agents.forEach((a) => {
        agentsMap[a.extension] =
          a.full_name || a.username || `Agent ${a.extension}`;
      });
    }

    Object.values(calls).forEach((c) => {
      if (c.agent_extension) {
        c.agent_name = agentsMap[c.agent_extension] || "Unknown Agent";
      }
    });

    /* ================= SORT ================= */
    const result = Object.values(calls).sort((a, b) => {
      if (a.status === "active" && b.status !== "active") return -1;
      if (b.status === "active" && a.status !== "active") return 1;
      return new Date(b.call_start || 0) - new Date(a.call_start || 0);
    });

    /* ✅ UPDATE LIVE CALL CACHE */
    liveCallsCache = result;
    lastCacheRefresh = Date.now();

    res.json(result);

  } catch (err) {
    console.error("❌ Livestream error:", err);
    res.status(500).json({ error: "Failed to fetch live calls" });
  }
};
const getLiveCallsCache = () => liveCallsCache;

/** Refresh cache before spy if stale (no poll in last 8s) */
const refreshLiveCallsCacheIfStale = async () => {
  if (Date.now() - lastCacheRefresh < 8000 && liveCallsCache.length > 0) {
    return liveCallsCache;
  }
  const fakeRes = {
    json: (data) => {
      liveCallsCache = data;
      lastCacheRefresh = Date.now();
    },
    status: () => ({ json: () => {} }),
  };
  await getAllLiveCalls({}, fakeRes);
  return liveCallsCache;
};

/* ============================== EXPORTS ============================== */
module.exports = {
  setupSocket,
  emitLiveCall,
  getAllLiveCalls,
  getLiveCallsCache,
  refreshLiveCallsCacheIfStale,
};
