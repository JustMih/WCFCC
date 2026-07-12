"use strict";

const { getAmi, isAmiConfigured } = require("./amiService");

/** Statuses that should receive queue calls (unpaused). */
const READY_STATUSES = new Set(["online", "active", "ready"]);

/**
 * Build Asterisk queue member interface for this PBX (PJSIP endpoints).
 * Matches channel patterns used elsewhere (PJSIP/{ext}).
 */
function resolveQueueMemberInterface(extension) {
  const ext = String(extension || "").trim();
  if (!ext) return null;
  return `PJSIP/${ext}`;
}

/**
 * Sync Asterisk QueuePause with WCF agent status.
 * Ready/online → unpaused; pause/offline/break → paused.
 * Fire-and-forget safe: logs errors, never throws to callers.
 */
function syncAgentQueuePauseFromStatus(extension, status) {
  try {
    if (!isAmiConfigured()) return;

    const iface = resolveQueueMemberInterface(extension);
    if (!iface) return;

    const ami = getAmi();
    if (!ami) return;

    const normalized = String(status || "")
      .trim()
      .toLowerCase();
    const paused = !READY_STATUSES.has(normalized);

    ami.action(
      {
        Action: "QueuePause",
        Interface: iface,
        Paused: paused ? "true" : "false",
        Reason: `wcf-status:${normalized || "unknown"}`,
      },
      (err) => {
        if (err) {
          console.warn(
            `[QueuePause] failed for ${iface} paused=${paused}:`,
            err.message || err
          );
          return;
        }
        console.log(
          `[QueuePause] ${iface} paused=${paused} (status=${normalized})`
        );
      }
    );
  } catch (err) {
    console.warn(
      "[QueuePause] sync error:",
      err?.message || err
    );
  }
}

module.exports = {
  syncAgentQueuePauseFromStatus,
  resolveQueueMemberInterface,
  READY_STATUSES,
};
