 
"use strict";

/* ============================== LIVE CALL CACHE ============================== */
let liveCallsCache = [];
let lastCacheRefresh = 0;

const sequelize = require("../../config/mysql_connection");
const { DataTypes, Op } = require("sequelize");
const moment = require("moment");

const CEL = require("../../models/CEL")(sequelize, DataTypes);
const QueueLog = require("../../models/QueueLog")(sequelize, DataTypes);
const User = require("../../models/User");
const {
  extractExtensionFromChannel,
  extractExtensionFromQueueAgent,
  normalizeExtensionCandidate,
  buildAgentsNameMap,
  resolveAgentForCall,
} = require("../../utils/agentExtensionHelper");
const { isLostWaitSeconds } = require("../../utils/missedCallHelper");
const {
  loadSupervisorExtensionSet,
  applyCelRowToCall,
  filterCallsForDisplay,
} = require("../../utils/liveCallCelHelper");
const { mergeLiveCallSources } = require("../../utils/liveCallMergeHelper");
const { getLiveCallsFromQueueLog } = require("../queueStatsController");

let getAmiLiveQueueCallsList = null;
try {
  getAmiLiveQueueCallsList = require("../../amiServer").getLiveQueueCallsList;
} catch (_) {
  getAmiLiveQueueCallsList = null;
}

/* ============================== SOCKET STATE ============================== */
let ioInstance = null;

/* ============================== SOCKET SETUP ============================== */
const setupSocket = (io) => {
  ioInstance = io;
  global._io = io;

  io.on("connection", (socket) => {
    console.log("📡 Livestream socket connected:", socket.id);

    socket.on("disconnect", () => {
      console.log("📴 Livestream socket disconnected:", socket.id);
    });
  });
};

/* ============================== HELPERS ============================== */

/** Avoid showing Asterisk dialplan tokens (s, t, h) as customer destination */
function resolveCalleeFromCelRow(row) {
  const dnid = row.cid_dnid;
  const peer = row.peer;
  const exten = row.exten;

  const isUseful = (v) => {
    if (v == null || v === "" || v === "-") return false;
    const s = String(v).trim();
    if (s.length <= 2) return false;
    if (/^[sthi]$/i.test(s)) return false;
    return true;
  };

  if (isUseful(dnid)) return String(dnid).trim();
  if (isUseful(peer)) return String(peer).trim();
  if (isUseful(exten)) return String(exten).trim();
  return dnid || peer || exten || "-";
}

/* ============================== SOCKET EMITTER ============================== */
const emitLiveCall = (callData) => {
  if (!ioInstance) return;

  if (callData.call_start && !callData.call_end) {
    callData.duration_secs = moment().diff(
      moment(callData.call_start),
      "seconds"
    );
  }

  ioInstance.emit("live_call_update", callData);
};

/* ============================== LIVE CALL FETCH ============================== */
const getAllLiveCalls = async (req, res) => {
  try {
    /* ---------- FETCH CEL EVENTS ---------- */
    const events = await CEL.findAll({
      where: {
        eventtype: [
          "CHAN_START",
          "ANSWER",
          "HANGUP",
          "APP_START",
          "APP_END",
          "BRIDGE_ENTER",
        ],
        eventtime: {
          [Op.gte]: moment().utcOffset("+03:00").subtract(30, "minutes").toDate(),
        },
      },
      order: [["eventtime", "ASC"]],
      limit: 2000,
    });

    const calls = {};
    const supervisorExts = await loadSupervisorExtensionSet(User);

    /* ================= BUILD CALL OBJECTS ================= */
    for (const row of events) {
      const key = row.linkedid || row.uniqueid;
      if (!key) continue;

      calls[key] ??= {
        linkedid: key,
        caller: row.cid_num || "-",
        callee: resolveCalleeFromCelRow(row),
        channel: row.channame || row.channel || "-",
        spyCallId: row.channame || row.channel || null,
        call_start: null,
        call_answered: null,
        call_end: null,
        queue_entry_time: null,

        status: "calling",
        duration_secs: null,
        estimated_wait_time: null,
        voicemail_path: null,

        agent_extension: null,
        agent_channel: null,
        agent_name: "Unassigned",
      };

      const c = calls[key];

      applyCelRowToCall(c, row, supervisorExts, { isLostWaitSeconds });

     // Durations
        if (c.call_start && c.call_end) {
          c.duration_secs = Math.floor(
            (new Date(c.call_end) - new Date(c.call_start)) / 1000
          );
        }

        if (c.queue_entry_time && c.call_answered) {
          c.estimated_wait_time = Math.floor(
            (new Date(c.call_answered) - new Date(c.queue_entry_time)) / 1000
          );
        }

        // 🔒 SANITIZE spyCallId (CRITICAL)
        if (c.spyCallId === "-" || c.spyCallId === "") {
          c.spyCallId = null;
        }

        // Emit live updates
        if (["CHAN_START", "ANSWER", "BRIDGE_ENTER"].includes(row.eventtype)) {
          emitLiveCall({ ...c });
        }

    }

    /* ================= SORT + MERGE (CEL + AMI + queue_log) ================= */
    const allCelCalls = filterCallsForDisplay(Object.values(calls), supervisorExts);
    const celLiveCalls = allCelCalls.filter((c) => !c.call_end);

    const liveCallIds = celLiveCalls
      .map((c) => String(c.linkedid || ""))
      .filter(Boolean);
    if (liveCallIds.length > 0) {
      const agentConnects = await QueueLog.findAll({
        where: {
          callid: { [Op.in]: liveCallIds },
          event: { [Op.in]: ["CONNECT", "AGENTCONNECT"] },
          agent: { [Op.ne]: null },
        },
        order: [["time", "DESC"]],
        attributes: ["callid", "agent"],
      });

      for (const row of agentConnects) {
        const call = celLiveCalls.find(
          (c) => String(c.linkedid) === String(row.callid)
        );
        if (!call) continue;
        const ext = extractExtensionFromQueueAgent(row.agent);
        if (ext && !call.agent_extension) {
          call.agent_extension = ext;
        }
        if (ext) {
          call.call_answered = call.call_answered || new Date();
          call.status = "active";
        }
      }
    }

    let amiLiveCalls = [];
    if (typeof getAmiLiveQueueCallsList === "function") {
      try {
        amiLiveCalls = getAmiLiveQueueCallsList();
      } catch (amiErr) {
        console.warn(
          "[livestream] AMI live calls skipped:",
          amiErr?.message || amiErr
        );
      }
    }

    let queueLogLiveCalls = [];
    try {
      queueLogLiveCalls = await getLiveCallsFromQueueLog();
    } catch (qlErr) {
      console.warn(
        "[livestream] queue_log live calls skipped:",
        qlErr?.message || qlErr
      );
    }

    let mergedLiveCalls = mergeLiveCallSources(
      allCelCalls,
      amiLiveCalls,
      queueLogLiveCalls
    );

    const extensionCandidates = [];
    mergedLiveCalls.forEach((c) => {
      if (c.agent_extension) extensionCandidates.push(c.agent_extension);
      if (c.caller) extensionCandidates.push(c.caller);
      const fromChan = extractExtensionFromChannel(c.agent_channel || c.channel);
      if (fromChan) extensionCandidates.push(fromChan);
    });

    const agentsMap = await buildAgentsNameMap(User, extensionCandidates);

    mergedLiveCalls.forEach((c) => {
      const resolved = resolveAgentForCall(c, agentsMap);
      c.agent_extension = resolved.agent_extension;
      c.agent_name = resolved.agent_name;
    });

    const result = mergedLiveCalls.sort((a, b) => {
      if (a.status === "active" && b.status !== "active") return -1;
      if (b.status === "active" && a.status !== "active") return 1;
      return new Date(b.call_start || 0) - new Date(a.call_start || 0);
    });

    /* ✅ UPDATE LIVE CALL CACHE */
    liveCallsCache = result;
    lastCacheRefresh = Date.now();

    res.json(result);

  } catch (err) {
    console.error("❌ Livestream error:", err);
    res.status(500).json({ error: "Failed to fetch live calls" });
  }
};
const getLiveCallsCache = () => liveCallsCache;

/** Refresh cache before spy if stale (no poll in last 8s) */
const refreshLiveCallsCacheIfStale = async () => {
  if (Date.now() - lastCacheRefresh < 8000 && liveCallsCache.length > 0) {
    return liveCallsCache;
  }
  const fakeRes = {
    json: (data) => {
      liveCallsCache = data;
      lastCacheRefresh = Date.now();
    },
    status: () => ({ json: () => {} }),
  };
  await getAllLiveCalls({}, fakeRes);
  return liveCallsCache;
};

/* ============================== EXPORTS ============================== */
module.exports = {
  setupSocket,
  emitLiveCall,
  getAllLiveCalls,
  getLiveCallsCache,
  refreshLiveCallsCacheIfStale,
};
