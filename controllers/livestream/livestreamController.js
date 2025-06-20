<<<<<<< HEAD
'use strict';

/* ----------------------------- MODULE IMPORTS ----------------------------- */
const sequelize = require("../../config/mysql_connection");
=======
 const sequelize = require("../../config/mysql_connection");
>>>>>>> 9b7e08de91a54b7d5de358b851206ba499785a90
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
  global._io = io; // Ensure global support for emitLiveCall
  io.on("connection", (socket) => {
    console.log("📡 LiveCall client connected:", socket.id);

    socket.on("disconnect", () => {
      console.log("📴 LiveCall client disconnected:", socket.id);
    });
  });
};

<<<<<<< HEAD
/* --------------------------- SOCKET EMIT (INTERNAL) --------------------------- */
/**
 * Emit live call updates to all connected clients using internal reference
 */
const emitLiveCall = async (callData) => {
=======
// Socket emitter
const emitLiveCall = (callData) => {
>>>>>>> 9b7e08de91a54b7d5de358b851206ba499785a90
  if (!ioInstance) return;

  if (callData.call_start && !callData.call_end) {
    callData.duration_secs = moment().diff(moment(callData.call_start), "seconds");
  }

  ioInstance.emit("live_call_update", callData);
  console.log("📡 Emitted live_call_update:", callData);
};

<<<<<<< HEAD
/* --------------------------- SOCKET EMIT (GLOBAL) --------------------------- */
/**
 * Emit live call update using global _io reference (for external use)
 */
exports.emitLiveCall = (call) => {
=======
// Global emit support
exports.emitLiveCall = (callData) => {
>>>>>>> 9b7e08de91a54b7d5de358b851206ba499785a90
  if (global._io) {
    global._io.emit("live_call_update", callData);
    console.log("📡 Emitted live call globally:", callData);
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
<<<<<<< HEAD
      order: [['eventtime', 'DESC']]
=======
      order: [['eventtime', 'ASC']]
>>>>>>> 9b7e08de91a54b7d5de358b851206ba499785a90
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

<<<<<<< HEAD
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

=======
      const c = calls[key];

      // inside for (const row of events) { ... }

switch (row.eventtype) {
  case 'CHAN_START':
    if (!c.call_start) {
      c.call_start = row.eventtime;
      c.queue_entry_time = row.eventtime;
      console.log(`📥 Queue entry recorded for ${key} at`, row.eventtime);
    }
    c.status = 'calling';
    break;

  case 'ANSWER':
    if (!c.call_answered) {
      console.log(`⏳ ETA calculated for ${key}:`, c.call_answered, "-", c.queue_entry_time);
      c.call_answered = row.eventtime;
      c.status = 'active';
    }
    break;

  case 'HANGUP':
    c.call_end = row.eventtime;

    // === Status classification ===
    if (!c.call_answered && c.queue_entry_time) {
      c.status = 'lost'; // Ringed, entered queue, but not answered
    } else if (!c.call_answered && !c.queue_entry_time) {
      c.status = 'dropped'; // Caller hung up quickly
    } else {
      c.status = 'ended'; // Answered and finished
    }

    break;

  case 'APP_START':
    if (row.appname === 'Queue') {
      c.queue_entry_time = row.eventtime;
    }
    if (row.appname === 'VoiceMail') {
      c.voicemail_path = `/recorded/voicemails/${key}.wav`;
    }
    break;
}


      
// Duration and wait time calculations (must come BEFORE formatting)
   // Duration and ETA: must be BEFORE time is formatted
if (c.call_start && c.call_end) {
  c.duration_secs = Math.floor((new Date(c.call_end) - new Date(c.call_start)) / 1000);
}
if (c.queue_entry_time && c.call_answered) {
  c.estimated_wait_time = Math.floor((new Date(c.call_answered) - new Date(c.queue_entry_time)) / 1000);
}


      // Format time fields AFTER calculations
     // AFTER duration & ETA
if (c.call_start) c.call_start = moment(c.call_start).format('YYYY-MM-DD HH:mm:ss');
if (c.call_answered) c.call_answered = moment(c.call_answered).format('YYYY-MM-DD HH:mm:ss');
if (c.call_end) c.call_end = moment(c.call_end).format('YYYY-MM-DD HH:mm:ss');
if (c.queue_entry_time) c.queue_entry_time = moment(c.queue_entry_time).format('YYYY-MM-DD HH:mm:ss');

      // Default voicemail path
>>>>>>> 9b7e08de91a54b7d5de358b851206ba499785a90
      if (c.missed && !c.voicemail_path) {
        c.voicemail_path = `/recorded/voicemails/${key}.wav`;
      }

      // 🔁 Emit update immediately
      emitLiveCall(c);
    }

    // Prepare final sorted list for REST fetch
    const result = Object.values(calls).sort((a, b) => {
      if (a.status === 'active' && b.status !== 'active') return -1;
      if (b.status === 'active' && a.status !== 'active') return 1;
      return new Date(b.call_start || 0) - new Date(a.call_start || 0);
    });

    res.status(200).json(result);
  } catch (err) {
    console.error("❌ Error building call data from CEL:", err);
    res.status(500).json({ error: "Failed to process CEL data" });
  }
};

<<<<<<< HEAD
/* ----------------------------- EXPORT MODULES ----------------------------- */
=======
// Exports
>>>>>>> 9b7e08de91a54b7d5de358b851206ba499785a90
module.exports = {
  setupSocket,
  emitLiveCall,
  getAllLiveCalls,
};
