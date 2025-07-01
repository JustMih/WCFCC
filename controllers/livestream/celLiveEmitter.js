const { Op, DataTypes } = require("sequelize");
const moment = require("moment");
const sequelize = require("../../config/mysql_connection");
const CEL = require("../../models/CEL")(sequelize, DataTypes);
const { emitLiveCall } = require("./livestreamController"); // or from your exports

let lastCheckTime = moment().subtract(10, 'seconds').toDate(); // initialize

const startCELWatcher = () => {
  setInterval(async () => {
    try {
      const newEvents = await CEL.findAll({
        where: {
          eventtype: ['CHAN_START', 'ANSWER', 'HANGUP', 'APP_START', 'APP_END'],
          eventtime: { [Op.gt]: lastCheckTime }
        },
        order: [['eventtime', 'ASC']]
      });

      if (newEvents.length > 0) {
        lastCheckTime = new Date(); // Update timestamp for next check

        const calls = {};

        for (const row of newEvents) {
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
            case 'CHAN_START':
              if (!c.call_start) {
                c.call_start = row.eventtime;
                c.queue_entry_time = row.eventtime;
              }
              c.status = 'calling';
              break;
            case 'ANSWER':
              if (!c.call_answered) {
                c.call_answered = row.eventtime;
                c.status = 'active';
              }
              break;
            case 'HANGUP':
              c.call_end = row.eventtime;
              if (!c.call_answered && c.queue_entry_time) c.status = 'lost';
              else if (!c.call_answered) c.status = 'dropped';
              else c.status = 'ended';
              break;
            case 'APP_START':
              if (row.appname === 'Queue') c.queue_entry_time = row.eventtime;
              if (row.appname === 'VoiceMail') c.voicemail_path = `/recorded/voicemails/${key}.wav`;
              break;
          }

          // Duration + ETA
          if (c.call_start && c.call_end) {
            c.duration_secs = Math.floor((new Date(c.call_end) - new Date(c.call_start)) / 1000);
          }
          if (c.queue_entry_time && c.call_answered) {
            c.estimated_wait_time = Math.floor((new Date(c.call_answered) - new Date(c.queue_entry_time)) / 1000);
          }

          // Emit to all clients
          emitLiveCall(c);
        }
      }
    } catch (err) {
      console.error("🔴 CEL polling error:", err.message);
    }
  }, 2000); // every 2 seconds
};

module.exports = { startCELWatcher };
