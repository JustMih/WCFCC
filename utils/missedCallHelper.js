/** Seconds within which the same caller is treated as one lost call */
const DEDUP_WINDOW_SECONDS = 90;

/**
 * Lost = caller waited in queue MORE than this (5 minutes).
 * Dropped = hung up at or before this threshold.
 */
const LOST_MIN_DURATION_SECONDS = 5 * 60;

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

/** Queue NO ANSWER sessions in a date range; lostOnly=true => wait > 5 min, false => dropped (<= 5 min). */
async function fetchQueueAbandonSessionsRaw(
  sequelize,
  startDateTime,
  endDateTime,
  lostOnly
) {
  const { QueryTypes } = require("sequelize");
  const { getCdrSessionIdExpr } = require("./cdrSchemaHelper");
  const sessionIdExpr = await getCdrSessionIdExpr(sequelize, "c");
  const havingClause = lostOnly
    ? "HAVING MAX(COALESCE(c.duration, 0)) > :lostMinDuration"
    : "HAVING MAX(COALESCE(c.duration, 0)) <= :lostMinDuration";

  const rows = await sequelize.query(
    `
    SELECT
      ${sessionIdExpr} AS session_id,
      MIN(
        COALESCE(
          NULLIF(TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(c.clid, '<', -1), '>', 1)), ''),
          NULLIF(TRIM(c.src), ''),
          NULLIF(TRIM(c.clid), '')
        )
      ) AS caller,
      MIN(c.cdrstarttime) AS call_time,
      MAX(COALESCE(c.duration, 0)) AS max_duration
    FROM cdr c
    WHERE c.cdrstarttime BETWEEN :startDateTime AND :endDateTime
      AND c.disposition = 'NO ANSWER'
      AND c.lastapp = 'Queue'
      AND (c.clid IS NOT NULL OR c.src IS NOT NULL)
    GROUP BY ${sessionIdExpr}
    ${havingClause}
    ORDER BY call_time DESC
    LIMIT 500
    `,
    {
      replacements: {
        startDateTime,
        endDateTime,
        lostMinDuration: LOST_MIN_DURATION_SECONDS,
      },
      type: QueryTypes.SELECT,
    }
  );

  return dedupeIncomingLostCdrs(rows);
}

/** Raw CDR rows: today's queue lost (wait > 5 min). */
async function fetchTodayQueueLostSessionsRaw(sequelize) {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const start = `${y}-${m}-${d} 00:00:00`;
  const end = `${y}-${m}-${d} 23:59:59`;
  return fetchQueueAbandonSessionsRaw(sequelize, start, end, true);
}

async function countQueueLostInRange(sequelize, startDateTime, endDateTime) {
  const rows = await fetchQueueAbandonSessionsRaw(
    sequelize,
    startDateTime,
    endDateTime,
    true
  );
  return rows.length;
}

async function countQueueDroppedInRange(sequelize, startDateTime, endDateTime) {
  const rows = await fetchQueueAbandonSessionsRaw(
    sequelize,
    startDateTime,
    endDateTime,
    false
  );
  return rows.length;
}

/**
 * Today's queue lost calls (waited > 5 min, not dropped), deduped by caller/session.
 * Merges MissedCalls for callback status.
 */
async function getTodayLostCallsList(sequelize) {
  const sessions = await fetchTodayQueueLostSessionsRaw(sequelize);
  if (sessions.length === 0) return [];

  const missedRows = await sequelize.query(
    `
    SELECT
      mc.id,
      mc.caller,
      mc.time,
      mc.status,
      mc.linkedid,
      mc.called_back_at,
      mc.called_back_by,
      mc.billsec,
      COALESCE(u.full_name, u.username, mc.called_back_by, '—') AS callback_agent_name
    FROM MissedCalls mc
    LEFT JOIN Users u ON u.extension = mc.called_back_by
    WHERE DATE(mc.time) = CURDATE()
      AND (mc.archived = 0 OR mc.archived IS NULL)
    ORDER BY mc.time DESC
    `,
    { type: QueryTypes.SELECT }
  );

  const byLinkedId = new Map();
  const byCallerKey = new Map();
  for (const row of missedRows) {
    if (row.linkedid) byLinkedId.set(String(row.linkedid), row);
    const key = callerMatchKey(row.caller);
    if (key && !byCallerKey.has(key)) byCallerKey.set(key, row);
  }

  const merged = sessions.map((session) => {
    const linked =
      session.session_id != null
        ? byLinkedId.get(String(session.session_id))
        : null;
    const mc =
      linked ||
      byCallerKey.get(callerMatchKey(session.caller)) ||
      null;
    const callTime = session.call_time;

    return {
      id: mc?.id ?? null,
      caller: session.caller,
      call_time: callTime,
      lost_time: callTime,
      status: mc?.status || "pending",
      called_back_at: mc?.called_back_at || null,
      called_back_by: mc?.called_back_by || null,
      callback_agent_extension: mc?.called_back_by || null,
      callback_agent_name: mc?.callback_agent_name || null,
      callback_time: mc?.called_back_at || null,
      callback_duration: mc?.billsec ?? null,
      billsec: mc?.billsec ?? null,
      session_id: session.session_id,
    };
  });

  return dedupeLostCalls(merged, "call_time");
}

module.exports = {
  DEDUP_WINDOW_SECONDS,
  LOST_MIN_DURATION_SECONDS,
  normalizeCaller,
  callerMatchKey,
  dedupeLostCalls,
  dedupeIncomingLostCdrs,
  fetchTodayQueueLostSessionsRaw,
  fetchQueueAbandonSessionsRaw,
  countQueueLostInRange,
  countQueueDroppedInRange,
  getTodayLostCallsList,
};
