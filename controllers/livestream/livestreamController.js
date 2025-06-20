'use strict';

/* ----------------------------- MODULE IMPORTS ----------------------------- */
const sequelize = require("../../config/mysql_connection");
const { DataTypes, Op } = require("sequelize");
const moment = require("moment");

/* ----------------------------- MODEL IMPORTS ----------------------------- */
const CEL = require("../../models/CEL")(sequelize, DataTypes);

/* ------------------------------ SOCKET STATE ------------------------------ */
let ioInstance = null;

/* ------------------------------ SOCKET SETUP ------------------------------ */
/**
 * Initialize Socket.IO and listen for connection/disconnection events
 */
const setupSocket = (io) => {
  ioInstance = io;
  io.on("connection", (socket) => {
    console.log("📡 LiveCall client connected:", socket.id);

    socket.on("disconnect", () => {
      console.log("📴 LiveCall client disconnected:", socket.id);
    });
  });
};

/* --------------------------- SOCKET EMIT (INTERNAL) --------------------------- */
/**
 * Emit live call updates to all connected clients using internal reference
 */
const emitLiveCall = async (callData) => {
  if (!ioInstance) return;

  if (callData.call_start && !callData.call_end) {
    callData.duration_secs = moment().diff(moment(callData.call_start), "seconds");
  }

  ioInstance.emit("live_call_update", callData);
};

/* --------------------------- SOCKET EMIT (GLOBAL) --------------------------- */
/**
 * Emit live call update using global _io reference (for external use)
 */
exports.emitLiveCall = (call) => {
  if (global._io) {
    global._io.emit("live_call_update", call);
    console.log("📡 Emitted live call:", call);
  } else {
    console.warn("⚠️ Socket.IO not initialized");
  }
};

/* ----------------------------- CEL CALL TRACKER ----------------------------- */
/**
 * REST: Get structured live call data from CEL events within the past 5 minutes
 */
const getAllLiveCalls = async (req, res) => {
  try {
    const events = await CEL.findAll({
      where: {
        eventtype: ['CHAN_START', 'ANSWER', 'HANGUP', 'APP_START', 'APP_END'],
        eventtime: { [Op.gte]: moment().subtract(5, 'minutes').toDate() }
      },
      order: [['eventtime', 'DESC']]
    });

    const calls = {};

    events.forEach((row) => {
      const key = row.linkedid || row.uniqueid;

      if (!calls[key]) {
        calls[key] = {
          caller: row.cid_num || "-",
          cid_dnid: row.cid_dnid || "-",
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

      switch (row.eventtype) {
        case 'CHAN_START':
          if (!calls[key].call_start) {
            calls[key].call_start = row.eventtime;
            calls[key].queue_entry_time = row.eventtime;
          }
          calls[key].status = 'calling';
          break;

        case 'ANSWER':
          if (!calls[key].call_answered) {
            calls[key].call_answered = row.eventtime;
            calls[key].status = 'active';
          }
          break;

        case 'HANGUP':
          calls[key].call_end = row.eventtime;
          if (!calls[key].call_answered) {
            calls[key].missed = true;
            calls[key].status = 'dropped';
          } else {
            calls[key].status = 'ended';
          }
          break;

        case 'APP_START':
          if (row.appname === 'Queue') {
            calls[key].queue_entry_time = row.eventtime;
          }
          if (row.appname === 'VoiceMail') {
            calls[key].voicemail_path = `/recorded/voicemails/${key}.wav`;
          }
          break;
      }
    });

    // Post-processing: compute durations and wait times
    for (const key in calls) {
      const c = calls[key];

      if (c.call_start && c.call_end) {
        c.duration_secs = Math.floor((new Date(c.call_end) - new Date(c.call_start)) / 1000);
      }

      if (c.queue_entry_time && c.call_answered) {
        c.estimated_wait_time = Math.floor((new Date(c.call_answered) - new Date(c.queue_entry_time)) / 1000);
      }

      if (c.missed && !c.voicemail_path) {
        c.voicemail_path = `/recorded/voicemails/${key}.wav`;
      }
    }

    res.status(200).json(Object.values(calls));
  } catch (err) {
    console.error("❌ Error building call data from CEL:", err);
    res.status(500).json({ error: "Failed to process CEL data" });
  }
};

/* ----------------------------- EXPORT MODULES ----------------------------- */
module.exports = {
  setupSocket,
  emitLiveCall,
  getAllLiveCalls,
};
