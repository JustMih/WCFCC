const express = require('express');
const mysql = require('mysql2/promise'); // MySQL ODBC
const cors = require('cors');
const AsteriskManager = require('asterisk-manager');

const app = express();
app.use(cors());

// ✅ Connect to Asterisk AMI
const ami = new AsteriskManager(5038, 'localhost', 'admin', '@Ttcl123', true);
ami.keepConnected();

const waitingCallers = {}; // Store waiting queue callers

// ✅ Handle incoming AMI events
ami.on('managerevent', (event) => {
  if (event.event === 'QueueEntry') {
    waitingCallers[event.uniqueid] = {
      caller: event.calleridnum || event.callerid || 'Unknown',
      position: event.position || '?',
      queue: event.queue || 'unknown',
      waitTime: parseInt(event.wait || 0, 10),
      timestamp: new Date().toISOString()
    };
  }

  if (event.event === 'QueueLeave') {
    delete waitingCallers[event.uniqueid];
  }
});

// ✅ Poll for queue status every 10s
setInterval(() => {
  ami.action({ Action: 'QueueStatus' }, (err, res) => {
    if (err) console.error('QueueStatus error:', err);
  });
}, 10000);

// ✅ Connect to MySQL DB
const db = mysql.createPool({
  host: 'localhost',
  user: 'asterisk',
  password: '@Ttcl123',
  database: 'asterisk'
});

// ✅ API: Live active calls from CEL
app.get('/api/live-calls', async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT
        uniqueid, cid_num, channel, peer, eventtime, eventtype
      FROM cel
      WHERE eventtype IN ('CHAN_START', 'ANSWER')
      AND eventtime >= NOW() - INTERVAL 2 MINUTE
      ORDER BY eventtime DESC
    `);

    const activeCalls = {};

    rows.forEach((row) => {
      if (!activeCalls[row.uniqueid]) {
        activeCalls[row.uniqueid] = {
          channel: row.channel,
          peer: row.peer,
          caller: row.cid_num,
          status: row.eventtype,
          startedAt: row.eventtime,
        };
      }
    });

    res.json(Object.values(activeCalls));
  } catch (error) {
    console.error("❌ CEL DB query failed:", error);
    res.status(500).send("Database error");
  }
});

// ✅ API: Calls currently waiting in queue
app.get('/api/waiting-calls', (req, res) => {
  res.json(Object.values(waitingCallers));
});

// ✅ Start server
const PORT = 5070;
app.listen(PORT, () => {
  console.log(`✅ Backend API running on port ${PORT}`);
});
