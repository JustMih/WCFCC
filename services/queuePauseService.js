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

const DEFAULT_QUEUE = process.env.ASTERISK_QUEUE || "support-queue";

/**
 * Dynamically add agent as queue member on login (idempotent — Asterisk
 * ignores if already a member).
 */
function addAgentToQueue(extension, queue) {
  try {
    if (!isAmiConfigured()) return;
    const iface = resolveQueueMemberInterface(extension);
    if (!iface) return;
    const ami = getAmi();
    if (!ami) return;

    ami.action(
      {
        Action: "QueueAdd",
        Queue: queue || DEFAULT_QUEUE,
        Interface: iface,
        Paused: "false",
        MemberName: iface,
      },
      (err) => {
        if (err) {
          console.warn(`[QueueAdd] failed for ${iface}:`, err.message || err);
          return;
        }
        console.log(`[QueueAdd] ${iface} added to ${queue || DEFAULT_QUEUE}`);
      }
    );
  } catch (err) {
    console.warn("[QueueAdd] error:", err?.message || err);
  }
}

/**
 * Remove agent from queue on logout so logged-out agents never receive calls.
 */
function removeAgentFromQueue(extension, queue) {
  try {
    if (!isAmiConfigured()) return;
    const iface = resolveQueueMemberInterface(extension);
    if (!iface) return;
    const ami = getAmi();
    if (!ami) return;

    ami.action(
      {
        Action: "QueueRemove",
        Queue: queue || DEFAULT_QUEUE,
        Interface: iface,
      },
      (err) => {
        if (err) {
          console.warn(`[QueueRemove] failed for ${iface}:`, err.message || err);
          return;
        }
        console.log(`[QueueRemove] ${iface} removed from ${queue || DEFAULT_QUEUE}`);
      }
    );
  } catch (err) {
    console.warn("[QueueRemove] error:", err?.message || err);
  }
}

module.exports = {
  syncAgentQueuePauseFromStatus,
  resolveQueueMemberInterface,
  addAgentToQueue,
  removeAgentFromQueue,
  READY_STATUSES,
};
