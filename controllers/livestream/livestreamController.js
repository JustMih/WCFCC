const sequelize = require("../../config/mysql_connection");
const { DataTypes, Op } = require("sequelize");
const moment = require("moment");
const CEL = require("../../models/CEL")(sequelize, DataTypes);

let ioInstance = null;

// Socket.IO setup
const setupSocket = (io) => {
  ioInstance = io;
  io.on("connection", (socket) => {
    console.log("📡 LiveCall client connected:", socket.id);

    socket.on("disconnect", () => {
      console.log("📴 LiveCall client disconnected:", socket.id);
    });
  });
};

// Emit call to clients
const emitLiveCall = async (callData) => {
  if (!ioInstance) return;

  if (callData.call_start && !callData.call_end) {
    callData.duration_secs = moment().diff(moment(callData.call_start), "seconds");
  }

  ioInstance.emit("live_call_update", callData);
};

// For global emit support
exports.emitLiveCall = (call) => {
  if (global._io) {
    global._io.emit("live_call_update", call);
    console.log("📡 Emitted live call:", call);
  } else {
    console.warn("⚠️ Socket.IO not initialized");
  }
};

// REST: Fetch processed CEL call states
// const getAllLiveCalls = async (req, res) => {
//   try {
//     const events = await CEL.findAll({
//       where: {
//         eventtype: ['CHAN_START', 'ANSWER', 'HANGUP', 'APP_START', 'APP_END'],
//         eventtime: { [Op.gte]: moment().subtract(5, 'minutes').toDate() }
//       },
//       order: [['eventtime', 'ASC']]
//     });

//     const calls = {};

//     events.forEach((row) => {
//       const key = row.linkedid || row.uniqueid;

//       if (!calls[key]) {
//         calls[key] = {
//           caller: row.cid_num || "-",
//           cid_dnid: row.cid_dnid || "-",
//           channel: row.channame || "-",
//           linkedid: key,
//           call_start: null,
//           call_answered: null,
//           call_end: null,
//           status: "calling",
//           duration_secs: null,
//           queue_entry_time: null,
//           estimated_wait_time: null,
//           voicemail_path: null,
//           missed: false,
//         };
//       }

//       switch (row.eventtype) {
//         case 'CHAN_START':
//           if (!calls[key].call_start) {
//             calls[key].call_start = row.eventtime;
//             calls[key].queue_entry_time = row.eventtime;
//           }
//           calls[key].status = 'calling';
//           break;

//         case 'ANSWER':
//           if (!calls[key].call_answered) {
//             calls[key].call_answered = row.eventtime;
//             calls[key].status = 'active';
//           }
//           break;

//         case 'HANGUP':
//           calls[key].call_end = row.eventtime;
//           if (!calls[key].call_answered) {
//             calls[key].missed = true;
//             calls[key].status = 'dropped';
//           } else {
//             calls[key].status = 'ended';
//           }
//           break;

//         case 'APP_START':
//           if (row.appname === 'Queue') {
//             calls[key].queue_entry_time = row.eventtime;
//           }
//           if (row.appname === 'VoiceMail') {
//             calls[key].voicemail_path = `/recorded/voicemails/${key}.wav`;
//           }
//           break;
//       }
//     });

//     // Post-processing: duration and ETA
//     for (const key in calls) {
//       const c = calls[key];

//       if (c.call_start && c.call_end) {
//         c.duration_secs = Math.floor(
//           (new Date(c.call_end) - new Date(c.call_start)) / 1000
//         );
//       }

//       if (c.queue_entry_time && c.call_answered) {
//         c.estimated_wait_time = Math.floor(
//           (new Date(c.call_answered) - new Date(c.queue_entry_time)) / 1000
//         );
//       }

//       // Default voicemail if missed and ended
//       if (c.missed && !c.voicemail_path) {
//         c.voicemail_path = `/recorded/voicemails/${key}.wav`;
//       }
//     }

//     res.status(200).json(Object.values(calls));
//   } catch (err) {
//     console.error("❌ Error building call data from CEL:", err);
//     res.status(500).json({ error: "Failed to process CEL data" });
//   }
// };
 
const getAllLiveCalls = async (req, res) => {
  try {
    const events = await CEL.findAll({
      where: {
        eventtype: ['CHAN_START', 'ANSWER', 'HANGUP'],
        eventtime: {
          [Op.gte]: moment().subtract(5, 'minutes').toDate()
        }
      },
      order: [['eventtime', 'ASC']]
    });

    const callMap = {};

    events.forEach(event => {
      const id = event.linkedid || event.uniqueid;

      if (!callMap[id]) {
        callMap[id] = {
          caller: event.cid_num,
          callee: event.cid_dnid || event.peer || "-", // fallback logic
          linkedid: id,
          call_start: null,
          call_answered: null,
          call_end: null,
          status: 'unknown',
          duration_secs: null,
          queue_entry_time: null,
          estimated_wait_time: null,
          voicemail_path: null
        };
      }

      if (event.eventtype === 'CHAN_START') {
        callMap[id].call_start = event.eventtime;
        callMap[id].queue_entry_time = event.eventtime;
        callMap[id].status = 'calling';
      }

      if (event.eventtype === 'ANSWER') {
        callMap[id].call_answered = event.eventtime;
        callMap[id].status = 'active';
      }

      if (event.eventtype === 'HANGUP') {
        callMap[id].call_end = event.eventtime;
        callMap[id].status = 'ended';
      }
    });

    // Filter for active calls only (ANSWERED but NOT yet HANGUP)
    const activeCalls = Object.values(callMap).filter(call =>
      call.call_answered && !call.call_end
    );

    // Optionally compute estimated wait time and duration
    activeCalls.forEach(call => {
      if (call.call_answered && call.call_start) {
        call.estimated_wait_time = Math.floor(
          (new Date(call.call_answered) - new Date(call.call_start)) / 1000
        );
      }

      // Live duration so far
      call.duration_secs = Math.floor(
        (new Date() - new Date(call.call_answered)) / 1000
      );
    });

    res.status(200).json(activeCalls);
  } catch (err) {
    console.error("❌ Error fetching active CEL calls:", err);
    res.status(500).json({ error: "Failed to fetch active calls" });
  }
};

module.exports = { getAllLiveCalls };

module.exports = {
  setupSocket,
  emitLiveCall,
  getAllLiveCalls
};
