"use strict";

function pickLatestTime(a, b) {
  const da = a ? new Date(a).getTime() : NaN;
  const db = b ? new Date(b).getTime() : NaN;
  if (!Number.isFinite(da)) return b || a;
  if (!Number.isFinite(db)) return a || b;
  return da >= db ? a : b;
}

function collectEndedIds(celCalls) {
  const endedIds = new Set();
  for (const call of celCalls || []) {
    if (call?.call_end && call?.linkedid) {
      endedIds.add(String(call.linkedid));
    }
  }
  return endedIds;
}

/** Merge CEL, AMI memory, and queue_log live call rows by linkedid. */
function mergeLiveCallSources(celCalls, amiCalls, queueLogCalls) {
  const endedIds = collectEndedIds(celCalls);
  const byId = new Map();

  const add = (call) => {
    const id = String(call?.linkedid || "");
    if (!id || call.call_end || endedIds.has(id)) return;
    const existing = byId.get(id);
    if (!existing) {
      byId.set(id, { ...call });
      return;
    }
    byId.set(id, {
      ...existing,
      ...call,
      status:
        call.status === "active" || existing.status === "active"
          ? "active"
          : call.status || existing.status,
      call_answered: call.call_answered || existing.call_answered,
      agent_extension: call.agent_extension || existing.agent_extension,
      agent_name:
        call.agent_name && call.agent_name !== "Waiting for agent"
          ? call.agent_name
          : existing.agent_name,
      queue_entry_time: pickLatestTime(
        call.queue_entry_time || call.call_start,
        existing.queue_entry_time || existing.call_start
      ),
      call_start: call.call_start || existing.call_start,
    });
  };

  for (const c of celCalls || []) {
    if (!c.call_end) add(c);
  }
  for (const c of queueLogCalls || []) add(c);
  for (const c of amiCalls || []) add(c);

  return [...byId.values()].filter(
    (c) => !c.call_end && !endedIds.has(String(c.linkedid || ""))
  );
}

module.exports = {
  mergeLiveCallSources,
  pickLatestTime,
  collectEndedIds,
};
