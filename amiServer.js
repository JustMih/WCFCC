const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const AsteriskManager = require('asterisk-manager');

const app = express();
app.use(cors());

// ✅ Connect to Asterisk AMI
// const ami = new AsteriskManager(5038, 'localhost', 'admin', '@Ttcl123', true);

const ami = new AsteriskManager(5038, '192.168.1.170', 'admin', '@Ttcl123', true);

const ami = new AsteriskManager(
  5038,
  "10.52.0.19",
  "admin",
  "@Ttcl123",
  true
);
ami.keepConnected();

ami.on('connect', () => {
  console.log('✅ Connected to Asterisk AMI');
});

ami.on('error', (err) => {
  console.error('❌ AMI connection error:', err);
});

// ✅ Connect to MySQL (CEL + queue_log)
const db = mysql.createPool({
  host: 'localhost',
  user: 'asterisk',
  password: '@Ttcl123',
  database: 'asterisk'
});

// ✅ Call tracking object
const queueCalls = {};

// ✅ Log event to queue_log table
async function logToQueueLog({ time, callid, queuename, agent, event, data1, data2, data3, data4, data5 }) {
  try {
    await db.execute(`
      INSERT INTO queue_log (time, callid, queuename, agent, event, data1, data2, data3, data4, data5)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [time, callid, queuename, agent, event, data1, data2, data3, data4, data5]);
  } catch (error) {
    console.error(`❌ Failed to insert queue_log event '${event}':`, error);
  }
}

// ✅ Handle AMI events
ami.on('managerevent', async (event) => {
  const now = new Date().toISOString().slice(0, 19).replace('T', ' '); // ✅ '2025-06-23 09:16:09'

  switch (event.event) {
    case 'QueueEntry':
      if (!queueCalls[event.uniqueid]) {
        queueCalls[event.uniqueid] = {
          caller: event.calleridnum || event.callerid || 'Unknown',
          queue: event.queue || 'unknown',
          joinedAt: now,
          answered: false,
          abandoned: false,
          leftAt: null
        };
        console.log(`📞 [QueueEntry] ${event.calleridnum} joined ${event.queue}`);

        await logToQueueLog({
          time: now,
          callid: event.uniqueid,
          queuename: event.queue,
          agent: null,
          event: 'QUEUEENTRY',
          data1: event.calleridnum || '',
          data2: '', data3: '', data4: '', data5: ''
        });
      } else {
        console.log(`🔁 [QueueEntry Ignored] Already tracking ${event.calleridnum}`);
      }
      break;

    case 'AgentConnect':
      if (queueCalls[event.uniqueid]) {
        queueCalls[event.uniqueid].answered = true;
        queueCalls[event.uniqueid].leftAt = now;
        console.log(`✅ [AgentConnect] ${queueCalls[event.uniqueid].caller} connected to agent`);

        await logToQueueLog({
          time: now,
          callid: event.uniqueid,
          queuename: event.queue || queueCalls[event.uniqueid].queue,
          agent: event.agent || '',
          event: 'AGENTCONNECT',
          data1: event.calleridnum || '',
          data2: '', data3: '', data4: '', data5: ''
        });
      }
      break;

    case 'QueueCallerAbandon':
      if (queueCalls[event.uniqueid]) {
        queueCalls[event.uniqueid].abandoned = true;
        queueCalls[event.uniqueid].leftAt = now;
        console.log(`⚠️ [Abandon] ${queueCalls[event.uniqueid].caller} left after waiting too long`);

        await logToQueueLog({
          time: now,
          callid: event.uniqueid,
          queuename: event.queue || queueCalls[event.uniqueid].queue,
          agent: null,
          event: 'ABANDON',
          data1: `waited ${event.waittime || 0}s`,
          data2: '', data3: '', data4: '', data5: ''
        });
      }
      break;

    case 'QueueCallerLeave':
    case 'Hangup':
      // Only log hangups if the caller joined a queue
      if (queueCalls[event.uniqueid] && !queueCalls[event.uniqueid].leftAt) {
        queueCalls[event.uniqueid].leftAt = now;
        console.log(`🚫 [Hangup/Leave] ${queueCalls[event.uniqueid].caller} hung up`);

        await logToQueueLog({
          time: now,
          callid: event.uniqueid,
          queuename: event.queue || queueCalls[event.uniqueid].queue,
          agent: null,
          event: 'LEAVE',
          data1: queueCalls[event.uniqueid].caller,
          data2: '', data3: '', data4: '', data5: ''
        });
      }
      break;
  }
});

// ✅ Poll queue status every 10 seconds
setInterval(() => {
  ami.action({ Action: 'QueueStatus' }, (err) => {
    if (err) console.error('❌ QueueStatus action error:', err);
  });
}, 10000);

// ✅ API: Live calls (last 2 minutes)
app.get('/api/live-calls-flow', async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT linkedid, uniqueid, eventtype, eventtime, cid_num, cid_dnid, channame
      FROM cel
      WHERE eventtime >= NOW() - INTERVAL 2 MINUTE
      ORDER BY linkedid, eventtime ASC
    `);

    const groupedCalls = {};

    function extractAgentId(channame) {
      if (!channame || !channame.startsWith('PJSIP/')) return null;
      return channame.split('/')[1]?.split('-')[0] || null;
    }

    rows.forEach(row => {
      const lid = row.linkedid;
      if (!groupedCalls[lid]) {
        groupedCalls[lid] = {
          linkedid: lid,
          caller: row.cid_num,
          callee: row.cid_dnid,
          statusFlow: []
        };
      }

      groupedCalls[lid].statusFlow.push({
        eventtype: row.eventtype,
        time: row.eventtime,
        channel: row.channame,
        agentId: extractAgentId(row.channame)
      });
    });

    res.json(Object.values(groupedCalls));
  } catch (error) {
    console.error("❌ Error building live call flow:", error);
    res.status(500).send("Database error");
  }
});

// ✅ API: Call Summary
app.get('/api/call-summary', async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT linkedid, uniqueid, eventtype, eventtime, cid_num, cid_dnid, channame
      FROM cel
      WHERE eventtime >= NOW() - INTERVAL 2 MINUTE
      ORDER BY linkedid, eventtime ASC
    `);

    const calls = {};
    const extractAgentId = (channame) => {
      if (!channame?.startsWith('PJSIP/')) return null;
      return channame.split('/')[1]?.split('-')[0] || null;
    };

    for (const row of rows) {
      const id = row.linkedid;
      if (!calls[id]) {
        calls[id] = {
          id: `CALL-${id.slice(-4)}`, // Shortened ID
          agent: null,
          customer: row.cid_num || 'Unknown',
          status: 'UNKNOWN',
          duration: 0,
          queueTime: 0,
          callType: row.cid_dnid?.startsWith('0') ? 'Outbound' : 'Inbound'
        };
      }

      const c = calls[id];
      if (row.eventtype === 'ANSWER') {
        c.status = 'ACTIVE';
        c.answeredAt = new Date(row.eventtime);
        c.agent = extractAgentId(row.channame);
      }

      if (row.eventtype === 'HANGUP') {
        c.status = 'ENDED';
        c.hangupAt = new Date(row.eventtime);
      }
    }

    // Final processing
    for (const id in calls) {
      const call = calls[id];
      if (call.answeredAt && call.hangupAt) {
        call.duration = Math.floor((call.hangupAt - call.answeredAt) / 1000);
      }

      const matchingQueue = Object.values(queueCalls).find(q => call.customer && q.caller === call.customer);
      if (matchingQueue?.joinedAt && matchingQueue?.leftAt) {
        call.queueTime = Math.floor((new Date(matchingQueue.leftAt) - new Date(matchingQueue.joinedAt)) / 1000);
      }

      delete call.answeredAt;
      delete call.hangupAt;
    }

    res.json(Object.values(calls));
  } catch (err) {
    console.error("❌ Error in call summary:", err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


// ✅ API: Queue call classification
app.get('/api/queue-call-stats', (req, res) => {
  const inQueue = [];
  const dropped = [];
  const lost = [];
  const answered = [];

  for (const [id, call] of Object.entries(queueCalls)) {
    const joined = new Date(call.joinedAt);
    const left = call.leftAt ? new Date(call.leftAt) : null;
    const waitSeconds = left ? (left - joined) / 1000 : null;

    if (!call.leftAt && !call.answered) {
      inQueue.push(call);
    } else if (call.answered) {
      answered.push({ ...call, waitSeconds });
    } else if (!call.answered && left) {
      if (waitSeconds < 30) {
        dropped.push({ ...call, waitSeconds });
      } else {
        lost.push({ ...call, waitSeconds });
      }
    }
  }

  res.json({ inQueue, dropped, lost, answered });
});

// ✅ Start server
const PORT = 5075;
app.listen(PORT, () => {
  console.log(`✅ Backend API running on port ${PORT}`);
});
