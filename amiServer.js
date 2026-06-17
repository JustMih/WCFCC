const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
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
/** Call ids seen in latest QueueStatus snapshot (waiting callers only). */
let queueStatusSyncIds = null;

function getQueueCallId(event) {
  return event.uniqueid || event.Uniqueid || event.linkedid || event.Linkedid || null;
}

function formatAmiTimestamp(date = new Date()) {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function parseAmiWaitSeconds(event) {
  const raw = event.wait ?? event.Wait;
  if (raw == null || raw === "") return 0;
  const n = parseInt(String(raw), 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function joinedAtFromWait(now, waitSec) {
  if (!waitSec) return now;
  return formatAmiTimestamp(new Date(Date.now() - waitSec * 1000));
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

function isExternalCallerId(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length >= 9;
}

function isAgentLegChannel(event) {
  const chan = String(event.channel || event.Channel || "");
  const m = chan.match(/PJSIP\/(\d{3,5})-/i);
  if (!m) return false;
  const ext = m[1];
  const callerDigits = String(
    event.calleridnum || event.CallerIDNum || ""
  ).replace(/\D/g, "");
  return callerDigits === ext;
}

/** Customer PSTN/SIP leg — before queue, IVR, or soft-queue. */
function isCustomerInboundChannel(event) {
  const chan = String(event.channel || event.Channel || "");
  if (/chanspy|snoop|local\/\d/i.test(chan)) return false;
  if (isAgentLegChannel(event)) return false;
  if (!isExternalCallerId(event.calleridnum || event.CallerIDNum)) return false;
  return /PJSIP\/|SIP\/|DAHDI/i.test(chan);
}

async function trackInboundCallStart(event, now) {
  const callId =
    event.linkedid ||
    event.Linkedid ||
    event.uniqueid ||
    event.Uniqueid;
  if (!callId) return;

  const existing = queueCalls[callId];
  if (existing?.endedAt) return;

  const caller =
    event.calleridnum ||
    event.CallerIDNum ||
    event.callerid ||
    event.CallerIDName ||
    "Unknown";
  const destination =
    event.exten ||
    event.Exten ||
    event.connectedlinenum ||
    event.context ||
    "incoming";

  queueCalls[callId] = {
    ...(existing || {}),
    caller,
    queue:
      existing?.queue && !/^(unknown|incoming|s)$/i.test(String(existing.queue))
        ? existing.queue
        : destination,
    joinedAt: existing?.joinedAt || now,
    waitSeconds: 0,
    answered: existing?.answered || false,
    abandoned: existing?.abandoned || false,
    leftAt: existing?.leftAt || null,
    endedAt: null,
    ringing: existing?.ringing || false,
    ringingAgent: existing?.ringingAgent || null,
    agent: existing?.agent || null,
    connectedAt: existing?.connectedAt || null,
    phase: existing?.phase || "dialing",
  };

  if (!existing) {
    console.log(`📲 [InboundStart] ${caller} (${callId})`);
  }
}

async function trackQueueEntry(event, now) {
  const callId = getQueueCallId(event);
  if (!callId) return;

  const waitSec = parseAmiWaitSeconds(event);
  const joinedAt = joinedAtFromWait(now, waitSec);
  const caller =
    event.calleridnum ||
    event.CallerIDNum ||
    event.callerid ||
    event.calleridname ||
    event.CallerIDName ||
    "Unknown";
  const queue = event.queue || event.queuename || event.Queue || "unknown";

  const isNew = !queueCalls[callId];

  queueCalls[callId] = {
    ...(queueCalls[callId] || {}),
    caller,
    queue,
    joinedAt: queueCalls[callId]?.joinedAt || joinedAt,
    waitSeconds: waitSec,
    answered: queueCalls[callId]?.answered || false,
    abandoned: queueCalls[callId]?.abandoned || false,
    leftAt: queueCalls[callId]?.leftAt || null,
    endedAt: null,
    ringing: queueCalls[callId]?.ringing || false,
    ringingAgent: queueCalls[callId]?.ringingAgent || null,
    agent: queueCalls[callId]?.agent || null,
    connectedAt: queueCalls[callId]?.connectedAt || null,
    phase: "queued",
  };

  if (waitSec > 0) {
    queueCalls[callId].joinedAt = joinedAt;
    queueCalls[callId].waitSeconds = waitSec;
  }

  if (isNew) {
    console.log(
      `📞 [QueueEntry] ${queueCalls[callId].caller} joined ${queueCalls[callId].queue} (wait ${waitSec}s)`
    );

    await logToQueueLog({
      time: now,
      callid: callId,
      queuename: queueCalls[callId].queue,
      agent: null,
      event: "QUEUEENTRY",
      data1: queueCalls[callId].caller || "",
      data2: String(waitSec || ""),
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
  call.ringing = false;
  call.ringingAgent = null;
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
  const now = new Date().toISOString().slice(0, 19).replace('T', ' '); // ✅ '2025-06-23 09:16:09'

  switch (event.event) {
    case "Newchannel":
      if (isCustomerInboundChannel(event)) {
        await trackInboundCallStart(event, now);
      }
      break;

    case "QueueStatus":
      if (
        String(event.eventlist || event.EventList || "").toLowerCase() === "start" ||
        String(event.message || event.Message || "").includes("will follow")
      ) {
        queueStatusSyncIds = new Set();
      }
      break;

    case "QueueEntry":
    case "QueueCallerJoin":
    case "QueueCallerEnter": {
      const callId = getQueueCallId(event);
      if (queueStatusSyncIds && callId) queueStatusSyncIds.add(String(callId));
      await trackQueueEntry(event, now);
      break;
    }

    case "QueueStatusComplete":
      queueStatusSyncIds = null;
      break;

    case "AgentConnect":
      await trackAgentConnect(event, now);
      break;

    case "Connect":
      if (event.queue || event.queuename) {
        await trackAgentConnect(event, now);
      }
      break;

    case "AgentComplete":
      {
        const resolved = resolveQueueCall(event);
        if (resolved) resolved.call.endedAt = now;
      }
      break;

    case "AgentCalled": {
      const resolved = resolveQueueCall(event);
      if (!resolved) break;
      resolved.call.ringing = true;
      resolved.call.ringingAgent =
        event.agent ||
        event.interface ||
        event.membername ||
        event.member ||
        "";
      resolved.call.ringingAt = now;
      break;
    }

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
        const callId = getQueueCallId(event);
        if (
          callId &&
          queueCalls[callId] &&
          !queueCalls[callId].answered &&
          !queueCalls[callId].endedAt &&
          queueCalls[callId].phase === "dialing" &&
          isCustomerInboundChannel(event)
        ) {
          queueCalls[callId].endedAt = now;
          queueCalls[callId].leftAt = now;
        }

        const resolved = resolveQueueCall(event);
        if (!resolved) break;
        const { call } = resolved;
        if (call.endedAt) break;
        if (!call.answered) break;
        call.endedAt = now;
        if (!call.leftAt) call.leftAt = now;
        console.log(`📴 [Hangup] active call ended for ${call.caller}`);
      }
      break;
  }
});

// ✅ Poll queue status every 3 seconds — lists all waiting callers via QueueEntry
setInterval(() => {
  if (!ami) return;
  ami.action({ Action: "QueueStatus" }, (err) => {
    if (err) console.error("❌ QueueStatus action error:", err);
  });
}, 2000);

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
  const nowMs = Date.now();
  const maxLiveMs = 35 * 60 * 1000;

  for (const [id, call] of Object.entries(queueCalls)) {
    if (!call || call.endedAt) continue;

    const joinedMs = new Date(call.joinedAt || 0).getTime();
    if (Number.isFinite(joinedMs) && nowMs - joinedMs > maxLiveMs) continue;

    const elapsedSeconds = Number.isFinite(joinedMs)
      ? Math.max(0, Math.floor((nowMs - joinedMs) / 1000))
      : 0;

    let status = "calling";
    if (call.answered) status = "active";
    else if (call.ringing) status = "ringing";

    const agentExt = extractExtensionFromQueueAgent(
      call.agent || call.ringingAgent
    );

    list.push({
      linkedid: id,
      caller: call.caller || "Unknown",
      callee: call.queue || "unknown",
      status,
      phase: call.phase || (call.answered ? "active" : "queued"),
      call_start: call.joinedAt,
      queue_entry_time: call.joinedAt,
      call_answered: call.connectedAt || null,
      call_end: null,
      agent_extension: agentExt,
      agent_name: agentExt ? `Ext ${agentExt}` : "Waiting for agent",
      elapsed_seconds: elapsedSeconds,
    });
  }
  return list;
}

module.exports = {
  getLiveQueueCalls,
  getLiveQueueCallsList,
  queueCalls,
};
