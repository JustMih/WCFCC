// services/amiService.js
const AsteriskManager = require('asterisk-manager');
const mysql = require('mysql2/promise');

// AMI connection
const ami = new AsteriskManager(5038, '127.0.0.1', 'admin', '@Ttcl123', true);
ami.keepConnected();

let queueCache = [];
let liveCallsCache = [];
let isPollingQueue = false;

// MySQL connection
const db = mysql.createPool({
  host: '127.0.0.1',
  user: 'asterisk',
  password: '@Ttcl123',
  database: 'asterisk'
});

// Poll AMI for queue status
const pollQueueStatus = () => {
  if (isPollingQueue) return;
  isPollingQueue = true;

  const tempQueue = [];

  const handler = async (event) => {
    if (event.Event === 'QueueEntry') {
      const entry = {
        time: new Date(),
        callid: event.Uniqueid,
        queuename: event.Queue,
        event: 'QueueEntry',
        data1: event.CallerIDNum || '',
        data2: event.Position || '',
        data3: event.Wait || '',
        data4: null,
        data5: null
      };

      tempQueue.push({
        queue: entry.queuename,
        position: entry.data2,
        callerID: entry.data1,
        waitTime: parseInt(entry.data3, 10),
      });

      try {
        const [existing] = await db.execute(
          `SELECT 1 FROM queue_log WHERE callid = ? AND event = 'QueueEntry' LIMIT 1`,
          [entry.callid]
        );

        if (existing.length === 0) {
          await db.execute(`
            INSERT INTO queue_log
              (time, callid, queuename, agent, event, data1, data2, data3, data4, data5)
            VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)
          `, [
            entry.time,
            entry.callid,
            entry.queuename,
            entry.event,
            entry.data1,
            entry.data2,
            entry.data3,
            entry.data4,
            entry.data5
          ]);
        }
      } catch (err) {
        console.error('❌ queue_log insert error:', err);
      }
    }

    if (event.Event === 'QueueStatusComplete') {
      ami.removeListener('managerevent', handler);
      queueCache = tempQueue;
      isPollingQueue = false;

      try {
        await db.execute(`DELETE FROM queue_log WHERE time < NOW() - INTERVAL 30 DAY`);
      } catch (err) {
        console.error('⚠️ Queue cleanup error:', err);
      }
    }
  };

  ami.on('managerevent', handler);

  ami.action({ Action: 'QueueStatus' }, (err) => {
    if (err) {
      ami.removeListener('managerevent', handler);
      isPollingQueue = false;
      console.error('❌ AMI QueueStatus error:', err);
    }
  });

  setTimeout(() => {
    if (isPollingQueue) {
      ami.removeListener('managerevent', handler);
      queueCache = tempQueue;
      isPollingQueue = false;
      console.warn('⚠️ AMI QueueStatus timeout fallback');
    }
  }, 3000);
};

// Poll CEL for live calls
const pollLiveCalls = async () => {
  try {
    const [rows] = await db.execute(`
      SELECT uniqueid, cid_num, channame AS channel, peer, eventtime, eventtype
      FROM cel
      WHERE eventtype IN ('CHAN_START', 'ANSWER')
        AND eventtime >= NOW() - INTERVAL 2 MINUTE
      ORDER BY eventtime DESC
    `);

    const active = {};

    rows.forEach((row) => {
      if (!active[row.uniqueid]) {
        active[row.uniqueid] = {
          channel: row.channel,
          peer: row.peer,
          caller: row.cid_num,
          status: row.eventtype,
          startedAt: row.eventtime,
        };
      }
    });

    liveCallsCache = Object.values(active);
  } catch (err) {
    console.error('❌ CEL live call polling error:', err);
  }
};

// Start polling both sources
setInterval(pollQueueStatus, 10000);
setInterval(pollLiveCalls, 10000);
pollQueueStatus();
pollLiveCalls();

module.exports = {
  getQueueCache: () => queueCache,
  getLiveCallsCache: () => liveCallsCache
};
