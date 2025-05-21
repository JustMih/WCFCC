const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const AsteriskManager = require('asterisk-manager');

// Setup CEL DB
const db = mysql.createPool({
  host: '127.0.0.1',
  user: 'asterisk',
  password: '@Ttcl123',
  database: 'asterisk',
});

// Setup AMI
const ami = new AsteriskManager(5038, '127.0.0.1', 'admin', '@Ttcl123', true);
ami.keepConnected();

// GET /api/live-calls
router.get('/live-calls', async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT uniqueid, cid_num, channame AS channel, peer, eventtime, eventtype
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
  } catch (err) {
    console.error("CEL DB error:", err);
    res.status(500).send("CEL DB error");
  }
});


// GET /api/queue-status
router.get('/queue-status', (req, res) => {
  ami.action({ action: 'QueueStatus' }, (err, result) => {
    if (err) {
      console.error("AMI error:", err);
      return res.status(500).send("QueueStatus error");
    }

    const calls = result.events
      .filter(e => e.Event === 'QueueEntry')
      .map(e => ({
        queue: e.Queue,
        position: e.Position,
        callerID: e.CallerIDNum,
        waitTime: parseInt(e.Wait, 10),
      }));

    res.json(calls);
  });
});

module.exports = router;
