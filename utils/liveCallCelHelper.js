"use strict";

const { Op } = require("sequelize");
const {
  extractExtensionFromChannel,
  normalizeExtensionCandidate,
} = require("./agentExtensionHelper");

const SUPERVISOR_ROLES = [
  "supervisor",
  "admin",
  "super-admin",
  "director-general",
];

async function loadSupervisorExtensionSet(User) {
  const rows = await User.findAll({
    where: {
      role: { [Op.in]: SUPERVISOR_ROLES },
      extension: { [Op.ne]: null },
    },
    attributes: ["extension"],
    raw: true,
  });

  const set = new Set();
  for (const r of rows) {
    const key = String(r.extension);
    set.add(key);
    const padded = key.padStart(4, "0");
    if (padded !== key) set.add(padded);
  }
  return set;
}

function isSupervisorExtension(ext, supervisorExts) {
  if (ext == null || ext === "") return false;
  const normalized = normalizeExtensionCandidate(ext);
  if (normalized && supervisorExts.has(normalized)) return true;
  return supervisorExts.has(String(ext));
}

function channelLooksLikeChanSpy(row) {
  const chan = String(row.channame || row.channel || "");
  const app = String(row.appname || "").toLowerCase();
  return /chanspy/i.test(chan) || app === "chanspy";
}

function isSupervisorSpyHangup(row, supervisorExts) {
  if (channelLooksLikeChanSpy(row)) return true;
  const ext =
    extractExtensionFromChannel(row.channame || row.channel) ||
    extractExtensionFromChannel(row.peer);
  return isSupervisorExtension(ext, supervisorExts);
}

function isSupervisorSpyBridge(row, supervisorExts) {
  if (channelLooksLikeChanSpy(row)) return true;
  const ext =
    extractExtensionFromChannel(row.channame || row.channel) ||
    extractExtensionFromChannel(row.peer);
  return isSupervisorExtension(ext, supervisorExts);
}

/**
 * Apply one CEL row to a live call object.
 * Supervisor listen/barge/whisper must not end the customer call on spy hangup.
 */
function applyCelRowToCall(c, row, supervisorExts, { isLostWaitSeconds } = {}) {
  switch (row.eventtype) {
    case "CHAN_START":
      c.call_start ??= row.eventtime;
      c.queue_entry_time ??= row.eventtime;
      c.status = "calling";
      break;

    case "ANSWER": {
      c.call_answered ??= row.eventtime;
      const ansChan = row.channame || row.channel || "";
      const ext =
        extractExtensionFromChannel(ansChan) ||
        extractExtensionFromChannel(row.peer);
      if (
        ext &&
        !isSupervisorExtension(ext, supervisorExts) &&
        /PJSIP\/|SIP\//i.test(String(ansChan))
      ) {
        c.agent_extension = c.agent_extension || ext;
        c.status = "active";
        if (String(ansChan).includes(`/${ext}-`)) {
          c.agent_channel = ansChan;
        }
      }
      break;
    }

    case "BRIDGE_ENTER": {
      if (isSupervisorSpyBridge(row, supervisorExts)) {
        c.supervisor_spy_active = true;
        break;
      }

      c.call_answered ??= row.eventtime;
      c.status = "active";

      const bridgeChan = row.channame || row.channel;
      const ext =
        extractExtensionFromChannel(bridgeChan) ||
        extractExtensionFromChannel(row.peer);

      if (ext && !isSupervisorExtension(ext, supervisorExts)) {
        c.agent_extension = c.agent_extension || ext;
        if (
          bridgeChan &&
          bridgeChan.includes("PJSIP/") &&
          bridgeChan.includes(`/${ext}-`)
        ) {
          c.agent_channel = bridgeChan;
          c.spyCallId = bridgeChan;
        }
      } else if (bridgeChan && !c.spyCallId) {
        c.spyCallId = bridgeChan;
      }
      break;
    }

    case "HANGUP": {
      if (isSupervisorSpyHangup(row, supervisorExts)) {
        c.supervisor_spy_active = false;
        break;
      }

      c.call_end = row.eventtime;
      if (!c.call_answered) {
        if (c.queue_entry_time && typeof isLostWaitSeconds === "function") {
          const waitSec =
            (new Date(c.call_end) - new Date(c.queue_entry_time)) / 1000;
          c.status = isLostWaitSeconds(waitSec) ? "lost" : "dropped";
        } else if (c.queue_entry_time) {
          c.status = "dropped";
        } else {
          c.status = "dropped";
        }
      } else {
        c.status = "ended";
      }
      break;
    }

    case "APP_START":
      if (row.appname === "Queue" || row.appname === "AppQueue") {
        c.queue_entry_time = row.eventtime;
      }
      if (String(row.appname || "").toLowerCase() === "chanspy") {
        c.supervisor_spy_active = true;
      }
      if (row.appname === "VoiceMail") {
        c.voicemail_path = `/recorded/voicemails/${c.linkedid}.wav`;
      }
      break;

    default:
      break;
  }
}

/** Drop supervisor-only ChanSpy legs from wallboard / live lists */
function isSupervisorOnlySpyCall(call, supervisorExts) {
  if (!call) return true;

  if (call.supervisor_spy_active && !call.agent_extension) return true;

  const ext = call.agent_extension;
  if (!isSupervisorExtension(ext, supervisorExts)) return false;

  const callerDigits = String(call.caller || "").replace(/\D/g, "");
  const extDigits = String(ext || "").replace(/\D/g, "");
  if (callerDigits && extDigits && callerDigits === extDigits) return true;

  const chan = String(call.agent_channel || call.channel || "");
  if (/chanspy/i.test(chan)) return true;

  const callee = String(call.callee || "").trim();
  if (callee === "s" || callee === "h" || callee === "t") return true;

  return false;
}

function filterCallsForDisplay(calls, supervisorExts) {
  return (Array.isArray(calls) ? calls : []).filter(
    (c) => !isSupervisorOnlySpyCall(c, supervisorExts)
  );
}

module.exports = {
  SUPERVISOR_ROLES,
  loadSupervisorExtensionSet,
  isSupervisorExtension,
  isSupervisorSpyHangup,
  isSupervisorSpyBridge,
  isSupervisorOnlySpyCall,
  applyCelRowToCall,
  filterCallsForDisplay,
};
