"use strict";

<<<<<<< HEAD

=======
function pickLatestTime(a, b) {
  const da = a ? new Date(a).getTime() : NaN;
  const db = b ? new Date(b).getTime() : NaN;
  if (!Number.isFinite(da)) return b || a;
  if (!Number.isFinite(db)) return a || b;
  return da >= db ? a : b;
}
>>>>>>> 78d5e1698ee05233d4333d6fb3b1ecaec10fa13e

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
<<<<<<< HEAD

      queue_entry_time:

        call.queue_entry_time || existing.queue_entry_time || call.call_start,

=======
      queue_entry_time: pickLatestTime(
        call.queue_entry_time || call.call_start,
        existing.queue_entry_time || existing.call_start
      ),
>>>>>>> 78d5e1698ee05233d4333d6fb3b1ecaec10fa13e
      call_start: call.call_start || existing.call_start,

    });

  };



  for (const c of celCalls || []) add(c);

  for (const c of queueLogCalls || []) add(c);

  for (const c of amiCalls || []) add(c);



  return [...byId.values()];

}



module.exports = {

  mergeLiveCallSources,
<<<<<<< HEAD

=======
  pickLatestTime,
>>>>>>> 78d5e1698ee05233d4333d6fb3b1ecaec10fa13e
};

