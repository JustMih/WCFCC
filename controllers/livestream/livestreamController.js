'use strict';

const sequelize = require("../../config/mysql_connection");
const { DataTypes, Op } = require("sequelize");
const moment = require("moment");
const CEL = require("../../models/CEL")(sequelize, DataTypes);

/* ------------------------------ SOCKET STATE ------------------------------ */
let ioInstance = null;

/* ------------------------------ SOCKET SETUP ------------------------------ */
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

/* --------------------------- SOCKET EMIT FUNCTION -------------------------- */
const emitLiveCall = (callData) => {
  if (!ioInstance) {
    console.warn("⚠️ No active socket to emit live call");
    return;
  }

  if (callData.call_start && !callData.call_end) {
    callData.duration_secs = moment().diff(moment(callData.call_start), "seconds");
  }

  ioInstance.emit("live_call_update", callData);
  console.log("📡 Emitted live_call_update:", callData);
};

// Global access support
exports.emitLiveCall = emitLiveCall;

/* ----------------------------- LIVE CALL FETCH ----------------------------- */
const getAllLiveCalls = async (req, res) => {
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
        eventtime: { [Op.gte]: moment().subtract(5, "minutes").toDate() },
      },
      order: [["eventtime", "ASC"]],
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
          missed: false
        };
      }

      const c = calls[key];

      switch (row.eventtype) {
        case "CHAN_START":
          if (!c.call_start) {
            c.call_start = row.eventtime;
            c.queue_entry_time = row.eventtime;
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
          // if (!c.call_answered) {
            // c.call_answered = row.eventtime; // Mark call as answered
            c.status = "active"; // Set status to active since the call is bridged
            console.log(`🔗 BRIDGE_ENTER: ${key} at ${row.eventtime}`);
          // }
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
            c.queue_entry_time = row.eventtime;
            console.log(`📥 Queue Entered: ${key} at ${row.eventtime}`);
          }
          if (row.appname === "VoiceMail") {
            c.voicemail_path = `/recorded/voicemails/${key}.wav`;
            console.log(`🗣️ Voicemail triggered for ${key}`);
          }
          break;
      }

      // Duration & wait time (calculated before formatting)
      if (c.call_start && c.call_end) {
        c.duration_secs = Math.floor((new Date(c.call_end) - new Date(c.call_start)) / 1000);
      }
      if (c.queue_entry_time && c.call_answered) {
        c.estimated_wait_time = Math.floor((new Date(c.call_answered) - new Date(c.queue_entry_time)) / 1000);
      }

      // Format timestamps
      if (c.call_start) c.call_start = moment(c.call_start).format('YYYY-MM-DD HH:mm:ss');
      if (c.call_answered) c.call_answered = moment(c.call_answered).format('YYYY-MM-DD HH:mm:ss');
      if (c.call_end) c.call_end = moment(c.call_end).format('YYYY-MM-DD HH:mm:ss');
      if (c.queue_entry_time) c.queue_entry_time = moment(c.queue_entry_time).format('YYYY-MM-DD HH:mm:ss');

      // Emit only on CHAN_START (start of live call)
      if (['CHAN_START', 'ANSWER', 'APP_START'].includes(row.eventtype)) {
        emitLiveCall({ ...c });
      }
      
    }

    // Sort result
    const result = Object.values(calls).sort((a, b) => {
      if (a.status === 'active' && b.status !== 'active') return -1;
      if (b.status === 'active' && a.status !== 'active') return 1;
      return new Date(b.call_start || 0) - new Date(a.call_start || 0);
    });

    res.status(200).json(result);
  } catch (err) {
    console.error("❌ Error fetching CEL call data:", err);
    res.status(500).json({ error: "Failed to process CEL data" });
  }
};

/* ------------------------------ EXPORTS ------------------------------ */
module.exports = {
  setupSocket,
  emitLiveCall,
  getAllLiveCalls
};
