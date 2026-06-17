"use strict";

function pickEarliestTime(a, b) {
  if (!a) return b || null;
  if (!b) return a || null;
  return new Date(a).getTime() <= new Date(b).getTime() ? a : b;
}

/** Merge CEL, AMI memory, and queue_log live call rows by linkedid. */
function mergeLiveCallSources(celCalls, amiCalls, queueLogCalls) {
  const byId = new Map();

  const add = (call) => {
    const id = String(call?.linkedid || "");
    if (!id || call.call_end) return;
    const existing = byId.get(id);
    if (!existing) {
      byId.set(id, { ...call });
      return;
    }
    const start = pickEarliestTime(
      existing.queue_entry_time || existing.call_start,
      call.queue_entry_time || call.call_start
    );
    byId.set(id, {
      ...existing,
      ...call,
      status: mergeLiveCallStatus(existing.status, call.status),
      call_answered: call.call_answered || existing.call_answered,
      agent_extension: call.agent_extension || existing.agent_extension,
      agent_name:
        call.agent_name && call.agent_name !== "Waiting for agent"
          ? call.agent_name
          : existing.agent_name,
      queue_entry_time: start,
      call_start: start,
      phase: call.phase || existing.phase,
      elapsed_seconds:
        call.elapsed_seconds != null
          ? call.elapsed_seconds
          : existing.elapsed_seconds,
    });
  };

  for (const c of celCalls || []) add(c);
  for (const c of queueLogCalls || []) add(c);
  for (const c of amiCalls || []) add(c);

  return [...byId.values()];
}

function mergeLiveCallStatus(a, b) {
  const rank = { active: 3, ringing: 2, calling: 1 };
  const ra = rank[a] || 0;
  const rb = rank[b] || 0;
  return ra >= rb ? a : b;
}

module.exports = {
  mergeLiveCallSources,
};
