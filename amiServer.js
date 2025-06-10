const express = require('express');
const mysql = require('mysql2/promise'); // or pg for PostgreSQL
const cors = require('cors');
const AsteriskManager = require('asterisk-manager');

// Connect to AMI (adjust your username and password)
const ami = new AsteriskManager(5038, 'localhost', 'admin', '@Ttcl123', true);
ami.keepConnected();

const app = express();
app.use(cors());

const db = mysql.createPool({
  host: 'localhost',
  user: 'asterisk',
  password: '@Ttcl123',
  database: 'asterisk'
});

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

app.get('/api/queue-status', async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT 
        q.name as queue_name,
        COUNT(DISTINCT CASE WHEN q.event = 'CONNECT' THEN q.callid END) as active_calls,
        COUNT(DISTINCT CASE WHEN q.event = 'ENTERQUEUE' AND q.event NOT IN ('CONNECT', 'COMPLETEAGENT', 'COMPLETECALLER') THEN q.callid END) as waiting_calls,
        COUNT(DISTINCT CASE WHEN q.event = 'COMPLETEAGENT' THEN q.callid END) as completed_calls
      FROM queue_log q
      WHERE q.time >= NOW() - INTERVAL 1 HOUR
      GROUP BY q.name
      ORDER BY q.name
    `);

    res.json(rows);
  } catch (error) {
    console.error("❌ Queue status query failed:", error);
    res.status(500).send("Database error");
  }
});

app.listen(5070, () => console.log("CEL API running on port 5070"));
