'use strict';

const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const AsteriskManager = require('asterisk-manager');

const app = express();
app.use(cors());

// ✅ Connect to Asterisk AMI
const ami = new AsteriskManager(5038, 'localhost', 'admin', '@Ttcl123', true);
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
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

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

// ✅ API: Call Summary
app.get('/api/call-summary', async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT linkedid, uniqueid, eventtype, eventtime, cid_num, cid_dnid, channame, exten
      FROM cel
      WHERE eventtime >= NOW() - INTERVAL 10 MINUTE
      ORDER BY eventtime DESC
    `);

    const calls = {};
    const extractAgentId = (channame) => {
      if (!channame?.startsWith('PJSIP/')) return null;
      return channame.split('/')[1]?.split('-')[0] || null;
    };

    for (const row of rows) {
      const id = row.linkedid;
      const isInternal = row.cid_num?.startsWith('1');

      if (!calls[id]) {
        calls[id] = {
          id: `CALL-${id.slice(-4)}`,
          agent: null,
          customer: isInternal ? row.exten || 'Internal' : row.cid_num || 'Unknown',
          status: 'UNKNOWN',
          duration: 0,
          queueTime: 0,
          callType: row.cid_dnid?.startsWith('0') ? 'Outbound' : 'Inbound',
          answeredAt: null,
          hangupAt: null,
          lastEventTime: new Date(row.eventtime)
        };
      }

      const c = calls[id];
      const eventTime = new Date(row.eventtime);
      if (eventTime > c.lastEventTime) c.lastEventTime = eventTime;

      if (row.eventtype === 'CHAN_START' && c.status === 'UNKNOWN') {
        c.status = 'CALLING';
      }

      if (row.eventtype === 'ANSWER') {
        c.status = 'ACTIVE';
        c.answeredAt = eventTime;
        c.agent = extractAgentId(row.channame);
      }

      if (row.eventtype === 'HANGUP') {
        c.status = 'COMPLETED';
        c.hangupAt = eventTime;
      }
    }

    const result = Object.values(calls)
      .map(call => {
        if (call.answeredAt && call.hangupAt) {
          call.duration = Math.floor((call.hangupAt - call.answeredAt) / 1000);
        }

        delete call.answeredAt;
        delete call.hangupAt;
        return call;
      })
      .sort((a, b) => b.lastEventTime - a.lastEventTime)
      .slice(0, 10);

    res.json(result);
  } catch (err) {
    console.error("❌ Error in call summary:", err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
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

// ✅ API: Listen to a call
app.post('/api/calls/:callId/listen', (req, res) => {
  const { callId } = req.params;
  
  // Ensure that the callId is valid and being monitored
  console.log(`Listening to ongoing call ${callId}`);

  // Use the AMI 'Monitor' or 'MixMonitor' action to listen to the call
  ami.action({
    Action: 'MixMonitor', 
    Channel: `PJSIP/${callId}`,  // Specify the correct channel format (this is just an example)
    File: `/opt/wcf_call_center_backend/recordings/${callId}_listen.wav`, // This file will store the audio temporarily if desired
    Mix: '1' // Mix all audio together (if listening and recording)
  }, (err, resData) => {
    if (err) {
      console.error('❌ Error listening to the call:', err);
      return res.status(500).json({ message: `Error listening to the call: ${err.message}` });
    }
    console.log('✅ Successfully started listening to the call:', resData);
    res.status(200).json({ message: `Started listening to call ${callId}` });
  });
});


// ✅ API: Intervene in a call
app.post('/api/calls/:callId/intervene', (req, res) => {
  const { callId } = req.params;
  console.log(`Intervening in call ${callId}`);
  ami.action({ Action: 'Originate', Channel: `PJSIP/${callId}`, Exten: '100', Context: 'default', Priority: 1 });
  res.status(200).json({ message: `Intervened in call ${callId}` });
});

// ✅ API: Whisper to a call
app.post('/api/calls/:callId/whisper', (req, res) => {
  const { callId } = req.params;
  console.log(`Whispering to call ${callId}`);
  ami.action({ Action: 'Originate', Channel: `PJSIP/${callId}`, Exten: '100', Context: 'default', Priority: 1, Variable: 'WHISPER=1' });
  res.status(200).json({ message: `Whispering to call ${callId}` });
});

// ✅ API: Play call recording
app.get('/api/calls/:callId/recording', async (req, res) => {
  const { callId } = req.params;
  try {
    // Fetch the uniqueid from the cel table using the callId
    const [celRows] = await db.execute(`
      SELECT uniqueid 
      FROM cel 
      WHERE uniqueid = ? 
      LIMIT 1
    `, [callId]);

    if (celRows.length === 0) {
      return res.status(404).json({ message: `Call with ID ${callId} not found in CEL table.` });
    }

    const uniqueid = celRows[0].uniqueid;

    // Now, fetch the recording path from the cdr table using the uniqueid
    const [cdrRows] = await db.execute(`
      SELECT recordingfile 
      FROM cdr 
      WHERE uniqueid = ? 
      LIMIT 1
    `, [uniqueid]);

    if (cdrRows.length === 0) {
      return res.status(404).json({ message: `Recording for call ID ${callId} not found in CDR table.` });
    }

    const recordingFile = cdrRows[0].recordingfile;

    // If a recording file exists, return the URL of the recording
    if (recordingFile) {
      const recordingUrl = `/recordings/${recordingFile}`;  // Assuming recordings are stored in /opt/wcf_call_center_backend/recorded
      return res.status(200).json({ recordingUrl });
    } else {
      return res.status(404).json({ message: `No recording file available for call ID ${callId}.` });
    }

  } catch (error) {
    console.error("❌ Error fetching recording:", error);
    res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
});


// ✅ Start server
const PORT = 5075;
app.listen(PORT, () => {
  console.log(`✅ Backend API running on port ${PORT}`);
});
