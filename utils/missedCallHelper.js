/** Seconds within which the same caller is treated as one lost call */
const DEDUP_WINDOW_SECONDS = 90;

function finalizePhone(digits) {
  if (!digits) return "";
  let phone = String(digits).replace(/[^+\d]/g, "");
  if (phone.startsWith("255")) phone = "0" + phone.slice(3);
  if (phone.startsWith("+255")) phone = "0" + phone.slice(4);
  if (phone.startsWith("+")) phone = phone.slice(1);
  if (!phone.startsWith("0") && phone.length === 9) phone = "0" + phone;
  return phone;
}

function normalizeCaller(raw) {
  if (!raw) return "UNKNOWN";
  const s = String(raw).trim();

  const angle = s.match(/<([^>]+)>/);
  if (angle?.[1]) {
    const p = finalizePhone(angle[1]);
    if (p.length >= 9) return p;
  }

  const quoted = s.match(/"([^"]+)"/);
  if (quoted?.[1]) {
    const p = finalizePhone(quoted[1]);
    if (p.length >= 9) return p;
  }

  let digits = s.replace(/[^+\d]/g, "");
  if (digits.length > 12) {
    const tail = digits.match(/(0\d{9})$/);
    if (tail) return tail[1];
    const nine = digits.match(/(\d{9})$/);
    if (nine) return finalizePhone(nine[1]);
  }

  const p = finalizePhone(digits);
  if (!p || p.length < 9) return "UNKNOWN";
  return p;
}

/** Last 9 digits for fuzzy DB matching */
function callerMatchKey(raw) {
  const n = normalizeCaller(raw);
  if (n === "UNKNOWN") return "";
  return n.slice(-9);
}

/**
 * Remove duplicate lost-call rows (same caller within DEDUP_WINDOW_SECONDS).
 * Keeps the earliest row in each window; returns newest-first.
 */
function dedupeLostCalls(rows, timeField = "call_time") {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  const sorted = [...rows].sort(
    (a, b) =>
      new Date(a[timeField] || a.time) - new Date(b[timeField] || b.time)
  );
  const lastKeptByCaller = new Map();
  const kept = [];

  for (const row of sorted) {
    const caller = normalizeCaller(row.caller);
    if (caller === "UNKNOWN") {
      kept.push(row);
      continue;
    }
    const t = new Date(row[timeField] || row.time).getTime();
    if (Number.isNaN(t)) {
      kept.push(row);
      continue;
    }
    const prev = lastKeptByCaller.get(caller);
    if (prev != null && t - prev <= DEDUP_WINDOW_SECONDS * 1000) {
      continue;
    }
    lastKeptByCaller.set(caller, t);
    kept.push({
      ...row,
      caller,
      caller_display: caller,
    });
  }

  return kept.sort(
    (a, b) =>
      new Date(b[timeField] || b.time) - new Date(a[timeField] || a.time)
  );
}

/** Dedupe CDR-derived lost-call rows before inserting into MissedCalls */
function dedupeIncomingLostCdrs(cdrs) {
  if (!Array.isArray(cdrs) || cdrs.length === 0) return [];

  const sorted = [...cdrs].sort(
    (a, b) => new Date(a.call_time) - new Date(b.call_time)
  );
  const lastKeptByCaller = new Map();
  const kept = [];

  for (const row of sorted) {
    const caller = normalizeCaller(row.caller);
    if (caller === "UNKNOWN") continue;
    const t = new Date(row.call_time).getTime();
    if (Number.isNaN(t)) continue;

    const prev = lastKeptByCaller.get(caller);
    if (prev != null && t - prev <= DEDUP_WINDOW_SECONDS * 1000) {
      continue;
    }
    lastKeptByCaller.set(caller, t);
    kept.push({
      ...row,
      caller,
    });
  }

  return kept.sort((a, b) => new Date(b.call_time) - new Date(a.call_time));
}

module.exports = {
  DEDUP_WINDOW_SECONDS,
  normalizeCaller,
  callerMatchKey,
  dedupeLostCalls,
  dedupeIncomingLostCdrs,
};
