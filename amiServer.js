const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const moment = require('moment');
const AsteriskManager = require('asterisk-manager');
require('dotenv').config();
const app = express();
app.use(cors());

// ✅ Connect to Asterisk AMI

const AMI_PORT = Number(process.env.AMI_PORT || 5038);
const AMI_HOST = process.env.AMI_HOST || process.env.DB_HOST || '127.0.0.1';
const AMI_USER = process.env.AMI_USER || 'admin';
const AMI_PASS = process.env.AMI_PASS || '';

let ami = null;
if (!AMI_PASS) {
  console.warn('⚠️ AMI_PASS is not set. Skipping Asterisk AMI connection to allow server to start.');
} else {
  ami = new AsteriskManager(AMI_PORT, AMI_HOST, AMI_USER, AMI_PASS, true);
  ami.keepConnected();

  ami.on('connect', () => {
    console.log('✅ Connected to Asterisk AMI');
  });

  ami.on('error', (err) => {
    console.error('❌ AMI connection error:', err);
  });
}

// ✅ Connect to MySQL (CEL + queue_log)
const db = mysql.createPool({
  host: process.env.DB_HOST || '192.168.21.70',
  user: process.env.DB_USER || 'asterisk',
  password: process.env.DB_PASS || "Wcf@1234",
  database: process.env.DB_NAME || "asterisk",
});

// ✅ Call tracking object
const queueCalls = {};

function getQueueCallId(event) {
  return event.uniqueid || event.linkedid || null;
}

/** Resolve tracked queue call — AMI may use different ids per event */
function resolveQueueCall(event) {
  const candidateIds = [
    event.uniqueid,
    event.linkedid,
    event.destuniqueid,
    event.destlinkedid,
  ].filter(Boolean);

  for (const id of candidateIds) {
    if (queueCalls[id] && !queueCalls[id].endedAt) {
      return { id, call: queueCalls[id] };
    }
  }

  // Fallback: match waiting caller by phone number
  const caller =
    event.calleridnum || event.callerid || event.calleridname || null;
  if (caller) {
    const callerDigits = String(caller).replace(/\D/g, "");
    for (const [id, call] of Object.entries(queueCalls)) {
      if (call.endedAt || call.answered) continue;
      const callDigits = String(call.caller || "").replace(/\D/g, "");
      if (callDigits && callerDigits && callDigits === callerDigits) {
        return { id, call };
      }
    }
  }

  return null;
}

async function trackQueueEntry(event, now) {
  const callId = getQueueCallId(event);
  if (!callId) return;

  if (!queueCalls[callId]) {
    queueCalls[callId] = {
      caller: event.calleridnum || event.callerid || event.calleridname || "Unknown",
      queue: event.queue || event.queuename || "unknown",
      joinedAt: now,
      answered: false,
      abandoned: false,
      leftAt: null,
    };
    console.log(
      `📞 [QueueEntry] ${queueCalls[callId].caller} joined ${queueCalls[callId].queue}`
    );

    await logToQueueLog({
      time: now,
      callid: callId,
      queuename: queueCalls[callId].queue,
      agent: null,
      event: "QUEUEENTRY",
      data1: queueCalls[callId].caller || "",
      data2: "",
      data3: "",
      data4: "",
      data5: "",
    });
  }
}

async function trackAgentConnect(event, now) {
  const resolved = resolveQueueCall(event);
  if (!resolved) {
    console.warn("[AgentConnect] no matching queue call", {
      uniqueid: event.uniqueid,
      linkedid: event.linkedid,
      caller: event.calleridnum || event.callerid,
    });
    return;
  }

  const { id: callId, call } = resolved;
  call.answered = true;
  call.connectedAt = now;
  call.endedAt = null;
  call.agent = event.agent || event.membername || event.interface || event.member || "";
  console.log(`✅ [AgentConnect] ${call.caller} connected to agent (${call.agent})`);

  await logToQueueLog({
    time: now,
    callid: callId,
    queuename: event.queue || call.queue,
    agent: call.agent || "",
    event: "AGENTCONNECT",
    data1: event.calleridnum || call.caller || "",
    data2: "",
    data3: "",
    data4: "",
    data5: "",
  });
}

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
if (ami) ami.on('managerevent', async (event) => {
  const now = moment().utcOffset('+03:00').format('YYYY-MM-DD HH:mm:ss');

  switch (event.event) {
    case 'QueueEntry':
    case 'QueueCallerJoin':
      await trackQueueEntry(event, now);
      break;

    case 'AgentConnect':
      await trackAgentConnect(event, now);
      break;

    case 'Connect':
      if (event.queue || event.queuename) {
        await trackAgentConnect(event, now);
      }
      break;

    case 'AgentComplete':
      {
        const resolved = resolveQueueCall(event);
        if (resolved) resolved.call.endedAt = now;
      }
      break;

    case 'AgentCalled':
      break;

    case 'QueueCallerAbandon':
      {
        const callId = getQueueCallId(event);
        if (!callId || !queueCalls[callId]) break;
        queueCalls[callId].abandoned = true;
        queueCalls[callId].leftAt = now;
        queueCalls[callId].endedAt = now;
        console.log(`⚠️ [Abandon] ${queueCalls[callId].caller} left after waiting too long`);

        const waitSec = Math.max(0, Math.floor(Number(event.waittime) || 0));
        await logToQueueLog({
          time: now,
          callid: callId,
          queuename: event.queue || queueCalls[callId].queue,
          agent: null,
          event: 'ABANDON',
          data1: `waited ${waitSec}s`,
          data2: '',
          data3: String(waitSec),
          data4: '',
          data5: ''
        });
      }
      break;

    case 'QueueCallerLeave':
      // Caller left queue — often fires BEFORE AgentConnect when bridging to agent.
      // Do not end here; Hangup / AgentComplete / Abandon handle real termination.
      break;

    case 'Hangup':
      {
        const resolved = resolveQueueCall(event);
        if (!resolved) break;
        const { call } = resolved;
        if (call.endedAt) break;
        // Only end on hangup after agent answered — queue-leg hangup fires before AgentConnect
        if (!call.answered) break;
        call.endedAt = now;
        if (!call.leftAt) call.leftAt = now;
        console.log(`📴 [Hangup] active call ended for ${call.caller}`);
      }
      break;
  }
});

// ✅ Poll queue status every 10 seconds
setInterval(() => {
  if (!ami) return;
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

    if (!call.endedAt && !call.answered) {
      inQueue.push(call);
    } else if (call.answered && !call.endedAt) {
      answered.push({ ...call, waitSeconds: call.connectedAt ? (new Date() - new Date(call.connectedAt)) / 1000 : null });
    } else if (!call.answered && call.leftAt) {
      const { isLostWaitSeconds, isDroppedWaitSeconds } =
        require("./utils/missedCallHelper");
      if (waitSeconds != null && isDroppedWaitSeconds(waitSeconds)) {
        dropped.push({ ...call, waitSeconds });
      } else if (waitSeconds != null && isLostWaitSeconds(waitSeconds)) {
        lost.push({ ...call, waitSeconds });
      }
    }
  }

  res.json({ inQueue, dropped, lost, answered });
});

// ✅ Start server
const PORT = Number(process.env.AMI_API_PORT || 5075);
const apiServer = app.listen(PORT, () => {
  console.log(`✅ Backend API running on port ${PORT}`);
});

// Prevent backend crash when port is already in use (e.g., another instance already running)
apiServer.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    console.warn(`⚠️ AMI API port ${PORT} is already in use. Skipping amiServer API listener to keep main backend running.`);
    return;
  }
  console.error('❌ amiServer API failed to start:', err);
});

const { extractExtensionFromQueueAgent } = require("./utils/agentExtensionHelper");

/** Live queue calls tracked from AMI — used by public dashboard */
function getLiveQueueCalls() {
  return queueCalls;
}

function getLiveQueueCallsList() {
  const list = [];
  for (const [id, call] of Object.entries(queueCalls)) {
    if (!call || call.endedAt) continue;

    const status = call.answered ? "active" : "calling";
    const agentExt = extractExtensionFromQueueAgent(call.agent);

    list.push({
      linkedid: id,
      caller: call.caller || "Unknown",
      callee: call.queue || "unknown",
      status,
      call_start: call.joinedAt,
      queue_entry_time: call.joinedAt,
      call_answered: call.connectedAt || null,
      call_end: null,
      agent_extension: agentExt,
      agent_name: agentExt ? `Ext ${agentExt}` : "Waiting for agent",
    });
  }
  return list;
}

module.exports = {
  getLiveQueueCalls,
  getLiveQueueCallsList,
  queueCalls,
};
