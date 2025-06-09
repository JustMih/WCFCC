 
const mysql = require('mysql2/promise');
const { emitLiveCall } = require('../controllers/livestream/livestreamController');
const sequelize = require('../config/mysql_connection');
const { DataTypes } = require('sequelize');
const LiveCall = require('../models/LiveCall')(sequelize, DataTypes);

const db = mysql.createPool({
  host: 'localhost',
  user: 'asterisk',
  password: '@Ttcl123',
  database: 'asterisk'
});

const pollCEL = async () => {
  try {
    const [rows] = await db.execute(`
    SELECT uniqueid, cid_num, channame, peer, eventtime, eventtype
    FROM cel
    WHERE eventtype IN ('CHAN_START', 'ANSWER', 'HANGUP')
    AND eventtime >= NOW() - INTERVAL 2 MINUTE
    ORDER BY eventtime DESC
  `);
  
    const activeCalls = {};

    for (const row of rows) {
        const existingCall = await LiveCall.findOne({ where: { linkedid: row.uniqueid } });
      
        if (row.eventtype === 'CHAN_START') {
          await LiveCall.upsert({
            linkedid: row.uniqueid,
            caller: row.cid_num,
            callee: row.peer,
            channel: row.channame,
            call_start: row.eventtime,
            status: 'calling',
          });
        }
      
        if (row.eventtype === 'ANSWER') {
          if (existingCall) {
            await existingCall.update({
              call_answered: row.eventtime,
              status: 'active',
            });
          }
        }
      
        if (row.eventtype === 'HANGUP') {
          if (existingCall) {
            const durationSecs = row.eventtime && existingCall.call_start
              ? Math.floor((new Date(row.eventtime) - new Date(existingCall.call_start)) / 1000)
              : null;
      
            await existingCall.update({
              call_end: row.eventtime,
              status: 'ended',
              duration_secs: durationSecs,
            });
          }
        }
      
        // Emit latest to frontend
        const updatedCall = await LiveCall.findOne({ where: { linkedid: row.uniqueid } });
        if (updatedCall) {
          emitLiveCall(updatedCall.toJSON());
        }
      }
      
  } catch (error) {
    console.error("❌ CEL polling error:", error);
  }
};

const startPolling = () => {
  setInterval(pollCEL, 5000); // Every 5 sec
};

module.exports = { startPolling };
