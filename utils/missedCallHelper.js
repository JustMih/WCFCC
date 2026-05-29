const { QueryTypes } = require("sequelize");

/** Seconds within which the same caller is treated as one lost call */
const DEDUP_WINDOW_SECONDS = 90;

/** Matches phpMyAdmin / reports: active rows for the DB server's current calendar day */
const MISSED_CALLS_TODAY_SQL = `
  DATE(time) = CURDATE()
  AND (archived = 0 OR archived IS NULL)
`;

/**
 * Lost = caller waited in queue for this long or longer (5+ minutes).
 * Dropped = hung up before this threshold (under 5 minutes).
 */
const LOST_MIN_DURATION_SECONDS = 5 * 60;

function isLostWaitSeconds(waitSeconds) {
  return Number(waitSeconds) >= LOST_MIN_DURATION_SECONDS;
}

function isDroppedWaitSeconds(waitSeconds) {
  return Number(waitSeconds) < LOST_MIN_DURATION_SECONDS;
}

/** Parse queue wait from queue_log row (Asterisk data3 or amiServer "waited Ns" in data1). */
function parseQueueLogWaitSeconds(row) {
  if (!row) return null;
  const d3 = Number(row.data3);
  if (Number.isFinite(d3) && d3 > 0) return Math.floor(d3);
  const d1 = String(row.data1 || "");
  const waitedMatch = d1.match(/waited\s*(\d+)/i);
  if (waitedMatch) return Number(waitedMatch[1]);
  const d1Num = Number(row.data1);
  if (Number.isFinite(d1Num) && d1Num > 0) return Math.floor(d1Num);
  return null;
}

function effectiveQueueWaitSeconds(sessionRow, queueWaitByCallId) {
  const cdrWait = Math.max(
    Number(sessionRow.max_duration) || 0,
    Number(sessionRow.max_billsec) || 0
  );
  const sid = sessionRow.session_id != null ? String(sessionRow.session_id) : "";
  const qlWait = sid && queueWaitByCallId ? queueWaitByCallId.get(sid) || 0 : 0;
  return Math.max(cdrWait, qlWait);
}

/**
 * Max abandon wait per callid/linkedid from queue_log (authoritative for 5-min queue waits).
 */
async function fetchQueueLogWaitMap(sequelize, startDateTime, endDateTime) {
  const { getCdrSessionIdExpr } = require("./cdrSchemaHelper");
  const sessionIdExpr = await getCdrSessionIdExpr(sequelize, "c");

  const [abandonRows, spanRows, linkRows] = await Promise.all([
    sequelize.query(
      `
      SELECT callid, event, data1, data2, data3
      FROM queue_log
      WHERE time BETWEEN :startDateTime AND :endDateTime
        AND callid IS NOT NULL AND callid != ''
        AND UPPER(event) IN ('ABANDON', 'EXITWITHTIMEOUT')
      `,
      {
        replacements: { startDateTime, endDateTime },
        type: QueryTypes.SELECT,
      }
    ),
    sequelize.query(
      `
      SELECT
        callid,
        GREATEST(
          0,
          TIMESTAMPDIFF(
            SECOND,
            MIN(CASE
              WHEN UPPER(event) IN ('ENTERQUEUE', 'QUEUEENTRY') THEN time
              ELSE NULL
            END),
            MAX(CASE
              WHEN UPPER(event) IN ('ABANDON', 'EXITWITHTIMEOUT', 'COMPLETECALLER') THEN time
              ELSE NULL
            END)
          )
        ) AS wait_from_events
      FROM queue_log
      WHERE time BETWEEN :startDateTime AND :endDateTime
        AND callid IS NOT NULL AND callid != ''
      GROUP BY callid
      HAVING wait_from_events > 0
      `,
      {
        replacements: { startDateTime, endDateTime },
        type: QueryTypes.SELECT,
      }
    ),
    sequelize.query(
      `
      SELECT DISTINCT
        ${sessionIdExpr} AS session_id,
        c.uniqueid AS uniqueid
      FROM cdr c
      WHERE c.cdrstarttime BETWEEN :startDateTime AND :endDateTime
        AND c.uniqueid IS NOT NULL AND c.uniqueid != ''
      `,
      {
        replacements: { startDateTime, endDateTime },
        type: QueryTypes.SELECT,
      }
    ),
  ]);

  const waitByCallId = new Map();
  const setWait = (id, seconds) => {
    if (!id || !Number.isFinite(seconds) || seconds <= 0) return;
    const key = String(id);
    const prev = waitByCallId.get(key) || 0;
    if (seconds > prev) waitByCallId.set(key, seconds);
  };

  for (const row of abandonRows) {
    const wait = parseQueueLogWaitSeconds(row);
    if (wait != null) setWait(row.callid, wait);
  }

  for (const row of spanRows) {
    setWait(row.callid, Number(row.wait_from_events));
  }

  const uniqueidToSession = new Map();
  for (const row of linkRows) {
    if (row.uniqueid && row.session_id) {
      uniqueidToSession.set(String(row.uniqueid), String(row.session_id));
    }
  }

  for (const [callid, wait] of [...waitByCallId.entries()]) {
    const sessionId = uniqueidToSession.get(callid);
    if (sessionId) setWait(sessionId, wait);
  }

  return { waitByCallId, uniqueidToSession };
}

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

/** Queue NO ANSWER sessions in a date range; lostOnly=true => wait >= 5 min, false => dropped (< 5 min). */
async function fetchQueueAbandonSessionsRaw(
  sequelize,
  startDateTime,
  endDateTime,
  lostOnly,
  options = {}
) {
  const { queueOnly = true } = options;
  const { QueryTypes } = require("sequelize");
  const { getCdrSessionIdExpr } = require("./cdrSchemaHelper");
  const sessionIdExpr = await getCdrSessionIdExpr(sequelize, "c");
  const lastappFilter = queueOnly
    ? "AND c.lastapp IN ('Queue', 'AppQueue')"
    : "";

  const [rows, queueLogMeta] = await Promise.all([
    sequelize.query(
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
        MAX(COALESCE(c.duration, 0)) AS max_duration,
        MAX(COALESCE(c.billsec, 0)) AS max_billsec
      FROM cdr c
      WHERE c.cdrstarttime BETWEEN :startDateTime AND :endDateTime
        AND c.disposition IN ('NO ANSWER', 'BUSY', 'FAILED')
        ${lastappFilter}
        AND (c.clid IS NOT NULL OR c.src IS NOT NULL)
      GROUP BY ${sessionIdExpr}
      ORDER BY call_time DESC
      LIMIT 2000
      `,
      {
        replacements: { startDateTime, endDateTime },
        type: QueryTypes.SELECT,
      }
    ),
    fetchQueueLogWaitMap(sequelize, startDateTime, endDateTime),
  ]);

  const queueWaitByCallId = queueLogMeta.waitByCallId;
  const uniqueidToSession = queueLogMeta.uniqueidToSession;

  const withWait = rows.map((row) => {
    const wait_seconds = effectiveQueueWaitSeconds(row, queueWaitByCallId);
    return { ...row, wait_seconds };
  });

  const classified = withWait.filter((row) =>
    lostOnly === true
      ? isLostWaitSeconds(row.wait_seconds)
      : lostOnly === false
        ? isDroppedWaitSeconds(row.wait_seconds)
        : true
  );

  if (lostOnly) {
    const seenSessions = new Set(
      classified.map((r) => String(r.session_id || ""))
    );
    const logOnlyRows = await sequelize.query(
      `
      SELECT callid, time, data1, data2, data3
      FROM queue_log
      WHERE time BETWEEN :startDateTime AND :endDateTime
        AND callid IS NOT NULL AND callid != ''
        AND UPPER(event) IN ('ABANDON', 'EXITWITHTIMEOUT')
      ORDER BY time DESC
      LIMIT 500
      `,
      {
        replacements: { startDateTime, endDateTime },
        type: QueryTypes.SELECT,
      }
    );

    const orphanCallIds = [];
    const orphanMeta = [];
    for (const logRow of logOnlyRows) {
      const wait = parseQueueLogWaitSeconds(logRow);
      if (wait == null || !isLostWaitSeconds(wait)) continue;
      const sessionId =
        uniqueidToSession.get(String(logRow.callid)) || String(logRow.callid);
      if (seenSessions.has(sessionId)) continue;
      seenSessions.add(sessionId);
      orphanCallIds.push(String(logRow.callid));
      orphanMeta.push({ sessionId, logRow, wait });
    }

    if (orphanCallIds.length > 0) {
      const callerRows = await sequelize.query(
        `
        SELECT
          COALESCE(NULLIF(TRIM(linkedid), ''), uniqueid) AS session_id,
          MIN(
            COALESCE(
              NULLIF(TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(clid, '<', -1), '>', 1)), ''),
              NULLIF(TRIM(src), ''),
              NULLIF(TRIM(clid), '')
            )
          ) AS caller_raw
        FROM cdr
        WHERE uniqueid IN (:ids) OR linkedid IN (:ids)
        GROUP BY COALESCE(NULLIF(TRIM(linkedid), ''), uniqueid)
        `,
        {
          replacements: { ids: orphanCallIds },
          type: QueryTypes.SELECT,
        }
      );
      const callerBySession = new Map(
        callerRows.map((r) => [String(r.session_id), normalizeCaller(r.caller_raw)])
      );

      for (const { sessionId, logRow, wait } of orphanMeta) {
        const caller =
          callerBySession.get(sessionId) ||
          normalizeCaller(logRow.data1) ||
          "UNKNOWN";
        if (caller === "UNKNOWN") continue;
        classified.push({
          session_id: sessionId,
          caller,
          call_time: logRow.time,
          max_duration: 0,
          max_billsec: 0,
          wait_seconds: wait,
        });
      }
    }
  }

  return dedupeIncomingLostCdrs(classified);
}

/** Raw CDR + queue_log rows: today's lost (wait >= 5 min). */
async function fetchTodayQueueLostSessionsRaw(sequelize) {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const start = `${y}-${m}-${d} 00:00:00`;
  const end = `${y}-${m}-${d} 23:59:59`;
  return fetchQueueAbandonSessionsRaw(sequelize, start, end, true, {
    queueOnly: false,
  });
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

async function getTodayMissedCallerKeys(sequelize) {
  const rows = await sequelize.query(
    `
    SELECT caller FROM MissedCalls
    WHERE ${MISSED_CALLS_TODAY_SQL}
    `,
    { type: QueryTypes.SELECT }
  );
  const keys = new Set();
  for (const row of rows) {
    const key = callerMatchKey(row.caller);
    if (key) keys.add(key);
  }
  return keys;
}

/**
 * One row per caller for today (latest time wins) — clean list for dashboard modal.
 */
function dedupeMissedCallsLatestPerCaller(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const byCaller = new Map();
  for (const row of rows) {
    const caller = normalizeCaller(row.caller);
    if (caller === "UNKNOWN") continue;
    const key = callerMatchKey(caller);
    if (!key) continue;
    const t = new Date(row.time).getTime();
    const prev = byCaller.get(key);
    if (!prev || t > new Date(prev.time).getTime()) {
      byCaller.set(key, { ...row, caller });
    }
  }
  return [...byCaller.values()].sort(
    (a, b) => new Date(b.time) - new Date(a.time)
  );
}

/** Raw rows for today — same filter as manual SQL in phpMyAdmin */
async function fetchMissedCallsTodayRaw(sequelize) {
  try {
    return await sequelize.query(
      `
      SELECT id, caller, time, status
      FROM MissedCalls
      WHERE ${MISSED_CALLS_TODAY_SQL}
      ORDER BY time DESC
      LIMIT 1000
      `,
      { type: QueryTypes.SELECT }
    );
  } catch (err) {
    const msg = String(err?.message || err);
    if (!/archived/i.test(msg)) throw err;
    return sequelize.query(
      `
      SELECT id, caller, time, status
      FROM MissedCalls
      WHERE DATE(time) = CURDATE()
      ORDER BY time DESC
      LIMIT 1000
      `,
      { type: QueryTypes.SELECT }
    );
  }
}

/**
 * Dropped = unanswered sessions with queue wait strictly under 5 minutes.
 * Never count a session as dropped when queue_log/CDR wait is >= 5 min (those are lost).
 */
async function countQueueDroppedInRange(sequelize, startDateTime, endDateTime) {
  const droppedRows = await fetchQueueAbandonSessionsRaw(
    sequelize,
    startDateTime,
    endDateTime,
    false,
    { queueOnly: false }
  );

  const droppedOnly = droppedRows.filter(
    (row) =>
      isDroppedWaitSeconds(row.wait_seconds) &&
      !isLostWaitSeconds(row.wait_seconds)
  );

  return dedupeIncomingLostCdrs(droppedOnly).length;
}

/**
 * Insert queue abandons (>= 5 min) into MissedCalls when not already present.
 */
async function ensureLostAbandonsInMissedCalls(sequelize) {
  const { QueryTypes } = require("sequelize");
  const lostSessions = await fetchTodayQueueLostSessionsRaw(sequelize);

  for (const cdr of lostSessions) {
    const caller = normalizeCaller(cdr.caller);
    if (caller === "UNKNOWN") continue;

    const matchKey = callerMatchKey(caller);
    const existingToday = await sequelize.query(
      `
      SELECT id, caller FROM MissedCalls
      WHERE ${MISSED_CALLS_TODAY_SQL}
      `,
      { type: QueryTypes.SELECT }
    );

    const duplicate = existingToday.some(
      (row) => callerMatchKey(row.caller) === matchKey
    );
    if (duplicate) continue;

    const linkedExists = await sequelize.query(
      `
      SELECT id FROM MissedCalls
      WHERE DATE(time) = CURDATE()
        AND linkedid = :linkedid
        AND linkedid IS NOT NULL
      LIMIT 1
      `,
      {
        replacements: { linkedid: cdr.session_id },
        type: QueryTypes.SELECT,
      }
    );
    if (linkedExists.length > 0) continue;

    await sequelize.query(
      `
      INSERT INTO MissedCalls
        (caller, time, agentId, linkedid, status, createdAt, updatedAt)
      VALUES
        (:caller, :time, NULL, :linkedid, 'pending', NOW(), NOW())
      `,
      {
        replacements: {
          caller,
          time: cdr.call_time,
          linkedid: cdr.session_id || null,
        },
        type: QueryTypes.INSERT,
      }
    );
  }
}

function mapMissedCallRowToLostDto(row) {
  const callTime = row.time || row.call_time;
  return {
    id: row.id ?? null,
    caller: normalizeCaller(row.caller),
    call_time: callTime,
    lost_time: callTime,
    status: row.status || "pending",
    called_back_at: row.called_back_at || null,
    called_back_by: row.called_back_by || null,
    callback_agent_extension: row.called_back_by || null,
    callback_agent_name: row.callback_agent_name || null,
    callback_time: row.called_back_at || null,
    callback_duration: row.billsec ?? null,
    billsec: row.billsec ?? null,
    linkedid: row.linkedid ?? null,
    session_id: row.linkedid ?? null,
  };
}

async function fetchMissedCallsInRange(sequelize, startDateTime, endDateTime) {
  const rows = await sequelize.query(
    `
    SELECT id, caller, time, status
    FROM MissedCalls
    WHERE time BETWEEN :startDateTime AND :endDateTime
      AND (archived = 0 OR archived IS NULL)
    ORDER BY time DESC
    LIMIT 1000
    `,
    {
      replacements: { startDateTime, endDateTime },
      type: QueryTypes.SELECT,
    }
  );

  return dedupeMissedCallsLatestPerCaller(rows).map(mapMissedCallRowToLostDto);
}

/** Lost calls today — MissedCalls table (deduped by caller for display). */
async function getTodayLostCallsList(sequelize) {
  await ensureLostAbandonsInMissedCalls(sequelize);
  const rows = await fetchMissedCallsTodayRaw(sequelize);
  return dedupeMissedCallsLatestPerCaller(rows).map(mapMissedCallRowToLostDto);
}

async function countTodayMissedCalls(sequelize) {
  await ensureLostAbandonsInMissedCalls(sequelize);
  const rows = await fetchMissedCallsTodayRaw(sequelize);
  return dedupeMissedCallsLatestPerCaller(rows).length;
}

async function countMissedCallsInRange(sequelize, startDateTime, endDateTime) {
  const list = await fetchMissedCallsInRange(
    sequelize,
    startDateTime,
    endDateTime
  );
  return list.length;
}

module.exports = {
  DEDUP_WINDOW_SECONDS,
  LOST_MIN_DURATION_SECONDS,
  isLostWaitSeconds,
  isDroppedWaitSeconds,
  parseQueueLogWaitSeconds,
  effectiveQueueWaitSeconds,
  fetchQueueLogWaitMap,
  fetchMissedCallsTodayRaw,
  dedupeMissedCallsLatestPerCaller,
  MISSED_CALLS_TODAY_SQL,
  normalizeCaller,
  callerMatchKey,
  dedupeLostCalls,
  dedupeIncomingLostCdrs,
  fetchTodayQueueLostSessionsRaw,
  fetchQueueAbandonSessionsRaw,
  countQueueLostInRange,
  countQueueDroppedInRange,
  ensureLostAbandonsInMissedCalls,
  countTodayMissedCalls,
  countMissedCallsInRange,
  getTodayLostCallsList,
};
