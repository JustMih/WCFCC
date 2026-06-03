const { QueryTypes } = require("sequelize");

/** Seconds within which the same caller is treated as one lost call */
const DEDUP_WINDOW_SECONDS = 90;

/** Matches phpMyAdmin / reports: active rows for the DB server's current calendar day */
const MISSED_CALLS_TODAY_SQL = `
  DATE(time) = CURDATE()
  AND (archived = 0 OR archived IS NULL)
`;

/** Do not run ensureLostAbandons on every dashboard poll */
let lastEnsureLostAbandonsAt = 0;
const ENSURE_LOST_THROTTLE_MS = 60 * 1000;

/** Real customer mobile (excludes agent extensions like 1001, 1007) */
function isCustomerCaller(raw) {
  const phone = normalizeCaller(raw);
  return /^0\d{9}$/.test(phone);
}

const {
  QUEUE_EXIT_TIMEOUT_SECONDS,
  LOST_CLASSIFY_GRACE_SECONDS,
  LOST_MIN_DURATION_SECONDS,
  hasKnownQueueWait,
  normalizeQueueWaitSeconds,
  isLostWaitSeconds,
  isDroppedWaitSeconds,
  queueWaitToMinutes,
} = require("./queueTimingConstants");

/**
 * Parse queue wait from queue_log.
 * Native Asterisk ABANDON: data1/data2 = queue position (NOT seconds) — do not use as wait.
 * amiServer ABANDON: data1 = "waited 312s", data3 = seconds.
 * Hold time may only be in data3 when Asterisk populates it; otherwise use ENTERQUEUE→ABANDON span SQL.
 */
function parseQueueLogWaitSeconds(row) {
  if (!row) return null;

  const d1 = String(row.data1 || "").trim();
  const waitedMatch = d1.match(/waited\s*(\d+)/i);
  if (waitedMatch) return Number(waitedMatch[1]);

  const d3raw = String(row.data3 ?? "").trim();
  if (d3raw && /^\d+$/.test(d3raw)) {
    const n = Number(d3raw);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
  }

  return null;
}

function effectiveQueueWaitSeconds(sessionRow, queueWaitByCallId, celWaitBySession) {
  const sid = sessionRow.session_id != null ? String(sessionRow.session_id) : "";
  let qlWait = 0;
  if (sid && queueWaitByCallId) {
    qlWait = queueWaitByCallId.get(sid) || 0;
    if (qlWait <= 0) {
      for (const [callid, wait] of queueWaitByCallId) {
        if (String(callid) === sid) qlWait = Math.max(qlWait, wait);
      }
    }
  }
  const celWait =
    sid && celWaitBySession ? celWaitBySession.get(sid) || 0 : 0;
  const sumDuration = Number(sessionRow.sum_duration) || 0;
  const cdrWait = Math.max(
    sumDuration,
    Number(sessionRow.max_duration) || 0,
    Number(sessionRow.max_billsec) || 0
  );
  const csWait = Number(sessionRow.call_summary_duration) || 0;
  const best = Math.max(qlWait, celWait, cdrWait, csWait);
  return best > 0 ? normalizeQueueWaitSeconds(best) : null;
}

function mergeWaitWithCallSummary(waitSeconds, callSummaryDuration) {
  const cs = Number(callSummaryDuration) || 0;
  const w = Number(waitSeconds) || 0;
  const best = Math.max(w, cs);
  return best > 0 ? best : null;
}

/**
 * Session total_duration from call_summary (same source as CDR report).
 */
async function fetchCallSummaryDurationMap(
  sequelize,
  sessionIds,
  startDateTime,
  endDateTime
) {
  const map = new Map();
  const ids = [...new Set((sessionIds || []).map((id) => String(id)).filter(Boolean))];
  if (ids.length === 0) return map;

  try {
    const chunkSize = 200;
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      const rows = await sequelize.query(
        `
        SELECT uniqueid, COALESCE(total_duration, 0) AS total_duration
        FROM call_summary
        WHERE uniqueid IN (:ids)
          AND call_start BETWEEN :start AND :end
        `,
        {
          replacements: {
            ids: chunk,
            start: startDateTime,
            end: endDateTime,
          },
          type: QueryTypes.SELECT,
        }
      );
      for (const row of rows) {
        const sec = Number(row.total_duration);
        if (Number.isFinite(sec) && sec > 0) {
          map.set(String(row.uniqueid), Math.floor(sec));
        }
      }
    }
  } catch (err) {
    const msg = String(err?.message || err);
    if (!/call_summary|doesn't exist|unknown table/i.test(msg)) throw err;
  }
  return map;
}

/**
 * Unanswered sessions with total_duration >= 5 min (CDR report / call_summary).
 */
async function fetchCallSummaryLongWaitSessions(
  sequelize,
  startDateTime,
  endDateTime
) {
  try {
    const rows = await sequelize.query(
      `
      SELECT
        uniqueid AS session_id,
        caller,
        call_start AS call_time,
        COALESCE(total_duration, 0) AS total_duration
      FROM call_summary
      WHERE call_start BETWEEN :start AND :end
        AND COALESCE(total_duration, 0) >= :lostMin
        AND UPPER(COALESCE(cdr_status, '')) IN ('NO ANSWER', 'BUSY', 'FAILED')
      ORDER BY call_start DESC
      LIMIT 500
      `,
      {
        replacements: {
          start: startDateTime,
          end: endDateTime,
          lostMin: LOST_MIN_DURATION_SECONDS,
        },
        type: QueryTypes.SELECT,
      }
    );
    return rows.filter((r) => isCustomerCaller(r.caller));
  } catch (err) {
    const msg = String(err?.message || err);
    if (!/call_summary|doesn't exist|unknown table/i.test(msg)) throw err;
    return [];
  }
}

function isLostSessionRow(row, queueWaitByCallId) {
  if (isLostWaitSeconds(row.wait_seconds)) return true;
  const sid = row.session_id != null ? String(row.session_id) : "";
  if (sid && queueWaitByCallId && isLostWaitSeconds(queueWaitByCallId.get(sid))) {
    return true;
  }
  return false;
}

function getTodayBounds() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return {
    start: `${y}-${m}-${d} 00:00:00`,
    end: `${y}-${m}-${d} 23:59:59`,
  };
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
              WHEN UPPER(event) IN (
                'ENTERQUEUE', 'QUEUEENTRY', 'QUEUECALLERJOIN'
              ) THEN time
              ELSE NULL
            END),
            MAX(CASE
              WHEN UPPER(event) IN (
                'ABANDON', 'EXITWITHTIMEOUT', 'COMPLETECALLER', 'LEAVEEMPTY',
                'LEAVE', 'RINGNOANSWER', 'RINGCANCELED'
              ) THEN time
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

  const sessionToUniqueids = new Map();
  for (const row of linkRows) {
    if (!row.uniqueid || !row.session_id) continue;
    const sid = String(row.session_id);
    if (!sessionToUniqueids.has(sid)) sessionToUniqueids.set(sid, []);
    sessionToUniqueids.get(sid).push(String(row.uniqueid));
  }

  for (const [callid, wait] of [...waitByCallId.entries()]) {
    const sessionId = uniqueidToSession.get(callid);
    if (sessionId) setWait(sessionId, wait);
  }

  for (const [sessionId, uniqueids] of sessionToUniqueids) {
    let maxWait = waitByCallId.get(sessionId) || 0;
    for (const uid of uniqueids) {
      maxWait = Math.max(maxWait, waitByCallId.get(uid) || 0);
    }
    if (maxWait > 0) setWait(sessionId, maxWait);
  }

  return { waitByCallId, uniqueidToSession };
}

/**
 * Lost callers from queue_log ENTERQUEUE→ABANDON time span (works when data3 is empty).
 */
async function fetchQueueLogSpanLostSessions(
  sequelize,
  startDateTime,
  endDateTime
) {
  const rows = await sequelize.query(
    `
    SELECT
      span.callid,
      span.wait_seconds,
      span.abandon_time AS call_time,
      (
        SELECT ql2.data1
        FROM queue_log ql2
        WHERE ql2.callid = span.callid
          AND UPPER(ql2.event) IN (
            'ENTERQUEUE', 'QUEUEENTRY', 'QUEUECALLERJOIN'
          )
        ORDER BY ql2.time ASC
        LIMIT 1
      ) AS caller_hint
    FROM (
      SELECT
        callid,
        GREATEST(
          0,
          TIMESTAMPDIFF(
            SECOND,
            MIN(CASE
              WHEN UPPER(event) IN (
                'ENTERQUEUE', 'QUEUEENTRY', 'QUEUECALLERJOIN'
              ) THEN time
              ELSE NULL
            END),
            MAX(CASE
              WHEN UPPER(event) IN (
                'ABANDON', 'EXITWITHTIMEOUT', 'COMPLETECALLER', 'LEAVEEMPTY',
                'LEAVE', 'RINGNOANSWER', 'RINGCANCELED'
              ) THEN time
              ELSE NULL
            END)
          )
        ) AS wait_seconds,
        MAX(CASE
          WHEN UPPER(event) IN (
            'ABANDON', 'EXITWITHTIMEOUT', 'COMPLETECALLER', 'LEAVEEMPTY',
            'LEAVE', 'RINGNOANSWER', 'RINGCANCELED'
          ) THEN time
          ELSE NULL
        END) AS abandon_time
      FROM queue_log
      WHERE time BETWEEN :startDateTime AND :endDateTime
        AND callid IS NOT NULL AND TRIM(callid) != ''
      GROUP BY callid
      HAVING wait_seconds >= :lostMin
    ) span
    ORDER BY span.abandon_time DESC
    LIMIT 500
    `,
    {
      replacements: {
        startDateTime,
        endDateTime,
        lostMin: LOST_MIN_DURATION_SECONDS,
      },
      type: QueryTypes.SELECT,
    }
  );

  return rows
    .map((row) => {
      const caller =
        normalizeCaller(row.caller_hint) !== "UNKNOWN"
          ? normalizeCaller(row.caller_hint)
          : "UNKNOWN";
      return {
        session_id: String(row.callid),
        caller,
        call_time: row.call_time,
        wait_seconds: Number(row.wait_seconds),
        max_duration: 0,
        max_billsec: 0,
      };
    })
    .filter((r) => r.caller !== "UNKNOWN");
}

function lostEntrySessionId(entry) {
  const sid = entry?.session_id;
  return sid != null && String(sid).trim() !== "" ? String(sid).trim() : "";
}

/** Map queue_log callid / CDR uniqueid → linkedid session key. */
function canonicalSessionId(rawId, uniqueidToSession) {
  const id = rawId != null ? String(rawId).trim() : "";
  if (!id) return "";
  const mapped = uniqueidToSession?.get(id);
  return mapped ? String(mapped).trim() : id;
}

function callTimeDedupeBucket(callTime) {
  const t = new Date(callTime);
  if (Number.isNaN(t.getTime())) return String(callTime || "");
  return String(Math.floor(t.getTime() / 1000));
}

function lostEntryCallerTimeKey(entry) {
  const caller = normalizeCaller(entry?.caller);
  const bucket = callTimeDedupeBucket(entry?.call_time);
  if (caller === "UNKNOWN" || !bucket) return "";
  return `${caller}:${bucket}`;
}

function isLostSessionAlreadyTracked(keys, sessionId, callerTimeKey) {
  if (callerTimeKey && keys.has(`ct:${callerTimeKey}`)) return true;
  const sid = sessionId != null ? String(sessionId).trim() : "";
  return sid !== "" && keys.has(`session:${sid}`);
}

/** One row per abandon: same caller + same second beats mismatched session ids. */
function abandonSessionDedupeKey(row) {
  const callerTime = lostEntryCallerTimeKey(row);
  if (callerTime) return `ct:${callerTime}`;
  const sid = String(row.session_id || "").trim();
  if (sid) return `sid:${sid}`;
  return `row:${normalizeCaller(row.caller)}:${row.call_time}`;
}

/**
 * Authoritative lost list: queue_log span (>=5m) + CDR + MissedCalls rows.
 * One entry per call session (uniqueid/linkedid); same caller may call again later.
 */
async function buildLostEntriesForRange(
  sequelize,
  startDateTime,
  endDateTime,
  options = {}
) {
  const { includeMissedTable = true } = options;
  const entries = [];
  const keys = new Set();

  const [spanLost, cdrLost, queueLogMeta] = await Promise.all([
    fetchQueueLogSpanLostSessions(sequelize, startDateTime, endDateTime),
    fetchQueueAbandonSessionsRaw(sequelize, startDateTime, endDateTime, true, {
      queueOnly: false,
    }),
    fetchQueueLogWaitMap(sequelize, startDateTime, endDateTime),
  ]);

  const waitMap = queueLogMeta.waitByCallId;
  const uniqueidToSession = queueLogMeta.uniqueidToSession || new Map();

  const add = (key, entry) => {
    const rawSid = lostEntrySessionId(entry);
    const sid = canonicalSessionId(rawSid, uniqueidToSession);
    if (sid) entry.session_id = sid;
    const ctKey = lostEntryCallerTimeKey(entry);
    if (isLostSessionAlreadyTracked(keys, sid, ctKey)) return;
    if (key && keys.has(key)) return;
    if (key) keys.add(key);
    if (sid) keys.add(`session:${sid}`);
    if (ctKey) keys.add(`ct:${ctKey}`);
    entries.push(entry);
  };

  for (const row of spanLost) {
    if (!isCustomerCaller(row.caller)) continue;
    add(`span:${row.session_id}`, {
      caller: row.caller,
      call_time: row.call_time,
      session_id: row.session_id,
      wait_seconds: normalizeQueueWaitSeconds(row.wait_seconds),
      source: "queue_log_span",
    });
  }

  for (const row of cdrLost) {
    if (!isCustomerCaller(row.caller)) continue;
    const sid = String(row.session_id || "");
    if (!isLostWaitSeconds(row.wait_seconds)) continue;
    add(`cdr:${sid}`, {
      caller: normalizeCaller(row.caller),
      call_time: row.call_time,
      session_id: row.session_id,
      wait_seconds: normalizeQueueWaitSeconds(row.wait_seconds),
      source: "cdr",
    });
  }

  const csLongSessions = await fetchCallSummaryLongWaitSessions(
    sequelize,
    startDateTime,
    endDateTime
  );
  for (const row of csLongSessions) {
    if (!isCustomerCaller(row.caller)) continue;
    const sid = canonicalSessionId(row.session_id, uniqueidToSession);
    const ctKey = lostEntryCallerTimeKey({
      caller: row.caller,
      call_time: row.call_time,
    });
    if (isLostSessionAlreadyTracked(keys, sid, ctKey)) continue;
    add(`cs:${sid}`, {
      caller: normalizeCaller(row.caller),
      call_time: row.call_time,
      session_id: sid,
      wait_seconds: normalizeQueueWaitSeconds(Number(row.total_duration)),
      source: "call_summary",
    });
  }

  if (includeMissedTable) {
    let missedRows = [];
    const { start: todayStart, end: todayEnd } = getTodayBounds();
    const isToday =
      startDateTime <= todayEnd && endDateTime >= todayStart;

    if (isToday) {
      missedRows = await fetchMissedCallsTodayRaw(sequelize);
    } else {
      missedRows = await sequelize.query(
        `
        SELECT id, caller, time, linkedid, agentId
        FROM MissedCalls
        WHERE time BETWEEN :startDateTime AND :endDateTime
          AND (archived = 0 OR archived IS NULL)
        ORDER BY time DESC
        LIMIT 2000
        `,
        {
          replacements: { startDateTime, endDateTime },
          type: QueryTypes.SELECT,
        }
      );
    }

    for (const row of missedRows) {
      if (!isCustomerCaller(row.caller)) continue;
      if (row.agentId != null && String(row.agentId).trim() !== "") continue;
      const caller = normalizeCaller(row.caller);
      const lid = canonicalSessionId(row.linkedid, uniqueidToSession);
      const ctKey = lostEntryCallerTimeKey({
        caller,
        call_time: row.time,
      });
      if (isLostSessionAlreadyTracked(keys, lid, ctKey)) {
        continue;
      }
      const waitSec =
        lid && waitMap ? waitMap.get(lid) ?? null : null;
      if (!isLostWaitSeconds(waitSec)) continue;
      add(`mcid:${row.id}`, {
        caller,
        call_time: row.time,
        session_id: row.linkedid || null,
        missed_id: row.id,
        wait_seconds: normalizeQueueWaitSeconds(waitSec),
        source: "missed_calls",
      });
    }
  }

  return entries.sort(
    (a, b) => new Date(b.call_time) - new Date(a.call_time)
  );
}

/** Queue hold from CEL (APP_START Queue → HANGUP without agent answer). */
async function fetchCelQueueWaitMap(sequelize, startDateTime, endDateTime) {
  const rows = await sequelize.query(
    `
    SELECT
      linkedid AS session_id,
      GREATEST(
        0,
        TIMESTAMPDIFF(
          SECOND,
          MIN(CASE
            WHEN eventtype = 'APP_START'
              AND LOWER(TRIM(appname)) IN ('queue', 'appqueue')
            THEN eventtime
            ELSE NULL
          END),
          MIN(CASE
            WHEN eventtype = 'HANGUP' THEN eventtime
            ELSE NULL
          END)
        )
      ) AS wait_seconds
    FROM cel
    WHERE eventtime BETWEEN :startDateTime AND :endDateTime
      AND linkedid IS NOT NULL
      AND TRIM(linkedid) != ''
    GROUP BY linkedid
    HAVING wait_seconds > 0
    `,
    {
      replacements: { startDateTime, endDateTime },
      type: QueryTypes.SELECT,
    }
  );

  const map = new Map();
  for (const row of rows) {
    const sec = Number(row.wait_seconds);
    if (!Number.isFinite(sec) || sec <= 0) continue;
    map.set(String(row.session_id), Math.floor(sec));
  }
  return map;
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

/**
 * One row per call session — never merge two different calls from the same caller.
 */
function dedupeAbandonSessionsBySessionId(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  const seen = new Set();
  const kept = [];

  for (const row of rows) {
    const key = abandonSessionDedupeKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(row);
  }

  return kept.sort(
    (a, b) => new Date(b.call_time) - new Date(a.call_time)
  );
}

/**
 * One row per call session (linkedid/uniqueid).
 * @deprecated Prefer dedupeAbandonSessionsBySessionId for reports.
 */
function dedupeIncomingLostCdrs(cdrs) {
  if (!Array.isArray(cdrs) || cdrs.length === 0) return [];

  const sorted = [...cdrs].sort(
    (a, b) => new Date(a.call_time) - new Date(b.call_time)
  );
  const seenSessions = new Set();
  const lastKeptByCaller = new Map();
  const kept = [];

  for (const row of sorted) {
    const caller = normalizeCaller(row.caller);
    if (caller === "UNKNOWN") continue;
    const t = new Date(row.call_time).getTime();
    if (Number.isNaN(t)) continue;

    const sid = String(row.session_id || "").trim();
    if (sid) {
      if (seenSessions.has(sid)) continue;
      seenSessions.add(sid);
      kept.push({ ...row, caller });
      continue;
    }

    const prev = lastKeptByCaller.get(caller);
    if (prev != null && t - prev <= DEDUP_WINDOW_SECONDS * 1000) {
      continue;
    }
    lastKeptByCaller.set(caller, t);
    kept.push({ ...row, caller });
  }

  return kept.sort((a, b) => new Date(b.call_time) - new Date(a.call_time));
}

/** Session ids classified as lost (exclude from dropped). */
async function buildLostSessionIdSet(
  sequelize,
  startDateTime,
  endDateTime
) {
  const [lostEntries, queueLogMeta] = await Promise.all([
    buildLostEntriesForRange(sequelize, startDateTime, endDateTime),
    fetchQueueLogWaitMap(sequelize, startDateTime, endDateTime),
  ]);
  const uniqueidToSession = queueLogMeta.uniqueidToSession || new Map();

  const ids = new Set();
  const uniqueLost = dedupeAbandonSessionsBySessionId(
    filterLostEntriesForList(lostEntries)
  );
  for (const e of uniqueLost) {
    const sid = canonicalSessionId(lostEntrySessionId(e), uniqueidToSession);
    if (sid) ids.add(sid);
    const ctKey = lostEntryCallerTimeKey(e);
    if (ctKey) ids.add(`ct:${ctKey}`);
  }
  return ids;
}

function isExcludedFromDropped(row, lostSessionIds) {
  if (!isCustomerCaller(row.caller)) return true;
  const sid = String(row.session_id || "").trim();
  if (sid && lostSessionIds.has(sid)) return true;
  const ctKey = lostEntryCallerTimeKey(row);
  if (ctKey && lostSessionIds.has(`ct:${ctKey}`)) return true;
  return false;
}

/**
 * Dropped = queue abandon under 5 min, OR not lost when wait is unknown (CDR often has 0s).
 */
function isDroppedAbandonSession(row, lostSessionIds) {
  if (isExcludedFromDropped(row, lostSessionIds)) return false;
  const raw = row.wait_seconds;
  if (hasKnownQueueWait(raw)) {
    const norm = normalizeQueueWaitSeconds(raw);
    if (isLostWaitSeconds(norm)) return false;
    return isDroppedWaitSeconds(norm);
  }
  return true;
}

function filterDroppedAbandonSessions(allAbandons, lostSessionIds) {
  return allAbandons.filter((row) =>
    isDroppedAbandonSession(row, lostSessionIds)
  );
}

/** Sessions call_summary marks as dropped (aligns with CDR report totals). */
async function fetchCallSummaryDroppedSessions(
  sequelize,
  startDateTime,
  endDateTime
) {
  try {
    const rows = await sequelize.query(
      `
      SELECT
        uniqueid AS session_id,
        caller,
        call_start AS call_time,
        COALESCE(total_duration, 0) AS total_duration
      FROM call_summary
      WHERE call_start BETWEEN :start AND :end
        AND LOWER(status) = 'dropped'
      ORDER BY call_start DESC
      LIMIT 2000
      `,
      {
        replacements: { start: startDateTime, end: endDateTime },
        type: QueryTypes.SELECT,
      }
    );
    return rows.filter((r) => isCustomerCaller(r.caller));
  } catch (err) {
    const msg = String(err?.message || err);
    if (!/call_summary|doesn't exist|unknown table/i.test(msg)) throw err;
    return [];
  }
}

/** All dropped sessions for dashboard count + dropped calls report. */
async function buildDroppedSessionsForRange(
  sequelize,
  startDateTime,
  endDateTime
) {
  const [allAbandons, lostSessionIds, csDropped, queueLogMeta] =
    await Promise.all([
      fetchQueueAbandonSessionsRaw(
        sequelize,
        startDateTime,
        endDateTime,
        null,
        { queueOnly: true }
      ),
      buildLostSessionIdSet(sequelize, startDateTime, endDateTime),
      fetchCallSummaryDroppedSessions(
        sequelize,
        startDateTime,
        endDateTime
      ),
      fetchQueueLogWaitMap(sequelize, startDateTime, endDateTime),
    ]);

  const uniqueidToSession = queueLogMeta.uniqueidToSession || new Map();
  const fromAbandons = filterDroppedAbandonSessions(
    allAbandons,
    lostSessionIds
  );

  const fromSummary = csDropped
    .filter((row) => {
      const mapped = {
        session_id: canonicalSessionId(row.session_id, uniqueidToSession),
        caller: row.caller,
        call_time: row.call_time,
        wait_seconds:
          Number(row.total_duration) > 0 &&
          Number(row.total_duration) < LOST_MIN_DURATION_SECONDS
            ? Number(row.total_duration)
            : null,
      };
      return isDroppedAbandonSession(mapped, lostSessionIds);
    })
    .map((row) => ({
      session_id: canonicalSessionId(row.session_id, uniqueidToSession),
      caller: normalizeCaller(row.caller),
      call_time: row.call_time,
      wait_seconds:
        Number(row.total_duration) > 0 &&
        Number(row.total_duration) < LOST_MIN_DURATION_SECONDS
          ? Number(row.total_duration)
          : null,
      source: "call_summary",
    }));

  return dedupeAbandonSessionsBySessionId([
    ...fromAbandons,
    ...fromSummary,
  ]);
}

/** Sessions where an agent extension answered (exclude from lost/dropped). */
async function fetchAnsweredAgentSessionIdSet(
  sequelize,
  startDateTime,
  endDateTime
) {
  const { getCdrSessionIdExpr } = require("./cdrSchemaHelper");
  const sessionIdExpr = await getCdrSessionIdExpr(sequelize, "a");
  try {
    const rows = await sequelize.query(
      `
      SELECT DISTINCT ${sessionIdExpr} AS session_id
      FROM cdr a
      WHERE a.cdrstarttime BETWEEN :startDateTime AND :endDateTime
        AND a.disposition = 'ANSWERED'
        AND (
          a.dstchannel LIKE 'PJSIP/%'
          OR a.dstchannel LIKE 'SIP/%'
        )
      `,
      {
        replacements: { startDateTime, endDateTime },
        type: QueryTypes.SELECT,
      }
    );
    return new Set(
      rows.map((r) => String(r.session_id || "").trim()).filter(Boolean)
    );
  } catch (err) {
    console.warn(
      "[fetchAnsweredAgentSessionIdSet] skipped:",
      err?.message || err
    );
    return new Set();
  }
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

  let rows = [];
  let queueWaitByCallId = new Map();
  let uniqueidToSession = new Map();
  let celWaitBySession = new Map();

  try {
    const [cdrRows, queueLogMeta, celWaitMap, answeredSessionIds] =
      await Promise.all([
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
        SUM(COALESCE(c.duration, 0)) AS sum_duration,
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
        fetchCelQueueWaitMap(sequelize, startDateTime, endDateTime),
        fetchAnsweredAgentSessionIdSet(sequelize, startDateTime, endDateTime),
      ]);

    rows = (cdrRows || []).filter((row) => {
      const sid = String(row.session_id || "").trim();
      return !sid || !answeredSessionIds.has(sid);
    });

    queueWaitByCallId = queueLogMeta.waitByCallId;
    uniqueidToSession = queueLogMeta.uniqueidToSession;
    celWaitBySession = celWaitMap;
  } catch (err) {
    console.error("[fetchQueueAbandonSessionsRaw] query failed:", err?.message || err);
    return [];
  }

  const sessionIds = rows
    .map((r) => String(r.session_id || ""))
    .filter(Boolean);
  const csDurMap = await fetchCallSummaryDurationMap(
    sequelize,
    sessionIds,
    startDateTime,
    endDateTime
  );

  const withWait = rows.map((row) => {
    const sid = String(row.session_id || "");
    const enriched = {
      ...row,
      call_summary_duration: csDurMap.get(sid) || 0,
    };
    const baseWait = effectiveQueueWaitSeconds(
      enriched,
      queueWaitByCallId,
      celWaitBySession
    );
    const wait_seconds = mergeWaitWithCallSummary(
      baseWait,
      csDurMap.get(sid)
    );
    return { ...enriched, wait_seconds };
  });

  const classified = withWait.filter((row) => {
    if (lostOnly === true) {
      return (
        isLostSessionRow(row, queueWaitByCallId) ||
        isLostWaitSeconds(row.wait_seconds)
      );
    }
    if (lostOnly === false) {
      return isDroppedWaitSeconds(row.wait_seconds);
    }
    return true;
  });

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
      const callid = String(logRow.callid || "");
      const wait =
        parseQueueLogWaitSeconds(logRow) ??
        (callid ? queueWaitByCallId.get(callid) : null);
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
        const wait_seconds = mergeWaitWithCallSummary(
          wait,
          csDurMap.get(sessionId)
        );
        if (!isLostWaitSeconds(wait_seconds)) continue;
        classified.push({
          session_id: sessionId,
          caller,
          call_time: logRow.time,
          max_duration: 0,
          max_billsec: 0,
          wait_seconds,
        });
      }
    }

    const spanLost = await fetchQueueLogSpanLostSessions(
      sequelize,
      startDateTime,
      endDateTime
    );
    for (const row of spanLost) {
      const sid = String(row.session_id || "");
      if (!sid || seenSessions.has(sid)) continue;
      seenSessions.add(sid);
      classified.push(row);
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
    if (!isCustomerCaller(row.caller)) continue;
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
      SELECT id, caller, time, status, linkedid, agentId
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
      SELECT id, caller, time, status, linkedid, agentId
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
 * Dropped = queue abandons under 5 min + call_summary dropped (one row per session).
 */
async function countQueueDroppedInRange(sequelize, startDateTime, endDateTime) {
  const sessions = await buildDroppedSessionsForRange(
    sequelize,
    startDateTime,
    endDateTime
  );
  return sessions.length;
}

/**
 * Enrich abandon/lost session rows for Comprehensive Reports (CDR + queue + agent).
 */
async function enrichAbandonReportRows(
  sequelize,
  startDateTime,
  endDateTime,
  deduped,
  statusLabel
) {
  const User = require("../models/User");
  const { getCdrSessionIdExpr } = require("./cdrSchemaHelper");
  const {
    extractExtensionFromChannel,
    buildAgentsNameMap,
  } = require("./agentExtensionHelper");

  if (!deduped.length) return [];

  const sessionIds = [
    ...new Set(deduped.map((r) => String(r.session_id || "")).filter(Boolean)),
  ];
  const sessionIdExpr = await getCdrSessionIdExpr(sequelize, "c");
  const queueLogMeta = await fetchQueueLogWaitMap(
    sequelize,
    startDateTime,
    endDateTime
  );

  const queueRows = await sequelize.query(
    `
    SELECT ql.callid, MAX(NULLIF(TRIM(ql.data2), '')) AS queue_name
    FROM queue_log ql
    WHERE ql.time BETWEEN :start AND :end
      AND ql.callid IS NOT NULL AND ql.callid != ''
      AND UPPER(ql.event) IN ('ENTERQUEUE', 'QUEUEENTRY', 'QUEUECALLERJOIN')
    GROUP BY ql.callid
    `,
    {
      replacements: { start: startDateTime, end: endDateTime },
      type: QueryTypes.SELECT,
    }
  );

  const queueByCallId = new Map();
  for (const q of queueRows) {
    if (q.callid && q.queue_name) {
      queueByCallId.set(String(q.callid), String(q.queue_name).trim());
    }
  }

  const sessionToUniqueids = new Map();
  if (queueLogMeta.uniqueidToSession) {
    for (const [uid, sid] of queueLogMeta.uniqueidToSession.entries()) {
      const s = String(sid);
      if (!sessionToUniqueids.has(s)) sessionToUniqueids.set(s, []);
      sessionToUniqueids.get(s).push(String(uid));
    }
  }

  const resolveQueueName = (sid) => {
    if (!sid) return null;
    if (queueByCallId.has(sid)) return queueByCallId.get(sid);
    const uids = sessionToUniqueids.get(sid) || [];
    for (const uid of uids) {
      if (queueByCallId.has(uid)) return queueByCallId.get(uid);
    }
    return null;
  };

  const cdrBySession = new Map();
  const chunkSize = 200;
  for (let i = 0; i < sessionIds.length; i += chunkSize) {
    const chunk = sessionIds.slice(i, i + chunkSize);
    const rows = await sequelize.query(
      `
      SELECT
        ${sessionIdExpr} AS session_id,
        MAX(c.disposition) AS disposition,
        SUBSTRING_INDEX(
          GROUP_CONCAT(
            NULLIF(TRIM(c.dst), '') ORDER BY c.cdrstarttime DESC SEPARATOR '||'
          ),
          '||', 1
        ) AS destination,
        SUBSTRING_INDEX(
          GROUP_CONCAT(
            CASE
              WHEN c.lastapp IN ('Queue', 'AppQueue')
                AND c.disposition IN ('NO ANSWER', 'BUSY', 'FAILED')
                AND (
                  c.dstchannel LIKE 'PJSIP/%'
                  OR c.dstchannel LIKE 'SIP/%'
                )
              THEN NULLIF(TRIM(c.dstchannel), '')
              ELSE NULL
            END
            ORDER BY c.cdrstarttime DESC SEPARATOR '||'
          ),
          '||',
          1
        ) AS dstchannel,
        SUBSTRING_INDEX(
          GROUP_CONCAT(
            NULLIF(TRIM(c.dstchannel), '') ORDER BY c.cdrstarttime DESC SEPARATOR '||'
          ),
          '||',
          1
        ) AS fallback_dstchannel
      FROM cdr c
      WHERE c.cdrstarttime BETWEEN :start AND :end
        AND ${sessionIdExpr} IN (:sessionIds)
      GROUP BY ${sessionIdExpr}
      `,
      {
        replacements: {
          start: startDateTime,
          end: endDateTime,
          sessionIds: chunk,
        },
        type: QueryTypes.SELECT,
      }
    );
    for (const r of rows) {
      cdrBySession.set(String(r.session_id), r);
    }
  }

  const extCandidates = [];
  for (const cdr of cdrBySession.values()) {
    const ext = extractExtensionFromChannel(cdr.dstchannel);
    if (ext) extCandidates.push(ext);
  }
  const agentsMap = await buildAgentsNameMap(User, extCandidates);

  return deduped
    .map((row) => {
      const sid = String(row.session_id || "");
      const cdr = cdrBySession.get(sid) || {};
      const queueName = resolveQueueName(sid);
      const destination =
        queueName || (cdr.destination && String(cdr.destination).trim()) || "—";
      const agent_extension =
        extractExtensionFromChannel(cdr.dstchannel) ||
        extractExtensionFromChannel(cdr.fallback_dstchannel) ||
        null;
      const agent_name =
        agent_extension && agentsMap[agent_extension]
          ? agentsMap[agent_extension]
          : null;
      const waitSec = row.wait_seconds;

      return {
        id: sid || `${normalizeCaller(row.caller)}-${row.call_time}`,
        session_id: sid,
        status: statusLabel,
        disposition: cdr.disposition || "NO ANSWER",
        caller: normalizeCaller(row.caller),
        destination,
        agent_extension,
        agent_name,
        call_time: row.call_time,
        wait_seconds: waitSec,
        duration_minutes: queueWaitToMinutes(waitSec),
      };
    })
    .sort((a, b) => new Date(b.call_time) - new Date(a.call_time));
}

/** Dropped call rows for reports (same pipeline as dashboard dropped count). */
async function fetchDroppedCallsForRange(sequelize, startDateTime, endDateTime) {
  const deduped = await buildDroppedSessionsForRange(
    sequelize,
    startDateTime,
    endDateTime
  );
  return enrichAbandonReportRows(
    sequelize,
    startDateTime,
    endDateTime,
    deduped,
    "DROPPED"
  );
}

/**
 * Lost call rows for reports: queue abandon with wait >= 5 minutes (same pipeline as dashboard).
 */
async function fetchLostCallsForRange(sequelize, startDateTime, endDateTime) {
  const entries = await buildLostEntriesForRange(
    sequelize,
    startDateTime,
    endDateTime,
    { includeMissedTable: true }
  );

  const lostRows = entries
    .filter((e) => isCustomerCaller(e.caller))
    .filter((e) => isLostWaitSeconds(e.wait_seconds))
    .map((e) => ({
      session_id: e.session_id,
      caller: e.caller,
      call_time: e.call_time,
      wait_seconds: e.wait_seconds,
    }));

  const deduped = dedupeIncomingLostCdrs(lostRows);
  return enrichAbandonReportRows(
    sequelize,
    startDateTime,
    endDateTime,
    deduped,
    "LOST"
  );
}

/**
 * Sync >= 5 min queue abandons into MissedCalls (one row per call session / linkedid).
 */
async function ensureLostAbandonsInMissedCalls(sequelize, options = {}) {
  try {
    return await ensureLostAbandonsInMissedCallsInner(sequelize, options);
  } catch (err) {
    console.warn("[ensureLostAbandons] failed (non-fatal):", err.message);
  }
}

async function ensureLostAbandonsInMissedCallsInner(sequelize, options = {}) {
  const force = options.force === true;
  const now = Date.now();
  if (
    !force &&
    now - lastEnsureLostAbandonsAt < ENSURE_LOST_THROTTLE_MS
  ) {
    return;
  }
  lastEnsureLostAbandonsAt = now;

  const { start, end } = getTodayBounds();
  const lostSessions = await buildLostEntriesForRange(sequelize, start, end);
  if (lostSessions.length === 0) return;

  const existingToday = await sequelize.query(
    `
    SELECT id, caller, time, linkedid FROM MissedCalls
    WHERE ${MISSED_CALLS_TODAY_SQL}
    `,
    { type: QueryTypes.SELECT }
  );

  for (const entry of lostSessions) {
    if (entry.source === "missed_calls") continue;
    if (!isLostWaitSeconds(entry.wait_seconds)) continue;

    const caller = normalizeCaller(entry.caller);
    if (!isCustomerCaller(caller)) continue;

    const callTime = entry.call_time;
    const sessionId =
      entry.session_id != null ? String(entry.session_id) : "";

    const linkedExists =
      sessionId &&
      existingToday.some(
        (row) =>
          row.linkedid != null && String(row.linkedid) === sessionId
      );
    if (linkedExists) continue;

    try {
      await sequelize.query(
        `
        INSERT IGNORE INTO MissedCalls
          (caller, time, agentId, linkedid, status, createdAt, updatedAt)
        VALUES
          (:caller, :time, NULL, :linkedid, 'pending', NOW(), NOW())
        `,
        {
          replacements: {
            caller,
            time: callTime,
            linkedid: entry.session_id || null,
          },
          type: QueryTypes.INSERT,
        }
      );
    } catch (insertErr) {
      const msg = String(insertErr?.message || insertErr);
      if (!/duplicate|ER_DUP_ENTRY|1062/i.test(msg)) {
        console.warn("[ensureLostAbandons] insert skipped:", msg);
      }
    }

    existingToday.push({
      id: null,
      caller,
      time: callTime,
      linkedid: entry.session_id,
    });
  }
}

function mapMissedCallRowToLostDto(row) {
  const callTime = row.time || row.call_time;
  const waitNorm = normalizeQueueWaitSeconds(row.wait_seconds);
  return {
    id: row.id ?? row.session_id ?? null,
    caller: normalizeCaller(row.caller),
    call_time: callTime,
    lost_time: callTime,
    wait_seconds: waitNorm > 0 ? waitNorm : row.wait_seconds ?? null,
    status: row.status || "LOST",
    agent_extension: row.agent_extension ?? null,
    agent_name: row.agent_name ?? null,
    destination: row.destination ?? null,
    called_back_at: row.called_back_at || null,
    called_back_by: row.called_back_by || null,
    callback_agent_extension: row.called_back_by || null,
    callback_agent_name: row.callback_agent_name || null,
    callback_time: row.called_back_at || null,
    callback_duration: row.billsec ?? null,
    billsec: row.billsec ?? null,
    linkedid: row.linkedid ?? row.session_id ?? null,
    session_id: row.session_id ?? row.linkedid ?? null,
  };
}

async function fetchMissedCallsInRange(sequelize, startDateTime, endDateTime) {
  const entries = await buildLostEntriesForRange(
    sequelize,
    startDateTime,
    endDateTime
  );
  return entries.map((e) =>
    mapMissedCallRowToLostDto({
      caller: e.caller,
      time: e.call_time,
      linkedid: e.session_id,
      status: "pending",
      wait_seconds: e.wait_seconds,
    })
  );
}

/** Today's lost queue sessions (>= 5 min) from CDR + queue_log. */
async function getTodayLostSessionsDeduped(sequelize) {
  const sessions = await fetchTodayQueueLostSessionsRaw(sequelize);
  return dedupeIncomingLostCdrs(sessions);
}

/**
 * Lost list + count: MissedCalls table for today (same as phpMyAdmin filter).
 * ensureLostAbandons still adds new >=5 min queue abandons into MissedCalls first.
 */
async function fetchMissedCallsTodayForList(sequelize) {
  try {
    return await sequelize.query(
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
      WHERE ${MISSED_CALLS_TODAY_SQL}
      ORDER BY mc.time DESC
      LIMIT 1000
      `,
      { type: QueryTypes.SELECT }
    );
  } catch (err) {
    const msg = String(err?.message || err);
    if (!/linkedid|called_back|billsec/i.test(msg)) throw err;
    return fetchMissedCallsTodayRaw(sequelize);
  }
}

function filterLostEntriesForList(entries) {
  return entries.filter(
    (e) =>
      isCustomerCaller(e.caller) &&
      isLostWaitSeconds(normalizeQueueWaitSeconds(e.wait_seconds))
  );
}

async function getTodayLostCallsList(sequelize) {
  await ensureLostAbandonsInMissedCalls(sequelize);
  const { start, end } = getTodayBounds();
  const entries = filterLostEntriesForList(
    await buildLostEntriesForRange(sequelize, start, end)
  );

  if (entries.length === 0) return [];

  const rowsForEnrich = dedupeAbandonSessionsBySessionId(
    entries.map((e) => ({
      session_id: e.session_id,
      caller: e.caller,
      call_time: e.call_time,
      wait_seconds: normalizeQueueWaitSeconds(e.wait_seconds),
    }))
  );

  const enriched = await enrichAbandonReportRows(
    sequelize,
    start,
    end,
    rowsForEnrich,
    "LOST"
  );

  return enriched.map((row) =>
    mapMissedCallRowToLostDto({
      id: row.id,
      caller: row.caller,
      call_time: row.call_time,
      session_id: row.session_id,
      wait_seconds: row.wait_seconds,
      status: "LOST",
      agent_extension: row.agent_extension,
      agent_name: row.agent_name,
      destination: row.destination,
    })
  );
}

/** Lost today — one per session; count matches View Details list. */
async function countTodayMissedCalls(sequelize) {
  await ensureLostAbandonsInMissedCalls(sequelize);
  const { start, end } = getTodayBounds();
  const entries = filterLostEntriesForList(
    await buildLostEntriesForRange(sequelize, start, end)
  );
  return dedupeAbandonSessionsBySessionId(entries).length;
}

async function countMissedCallsInRange(sequelize, startDateTime, endDateTime) {
  const entries = filterLostEntriesForList(
    await buildLostEntriesForRange(sequelize, startDateTime, endDateTime)
  );
  return dedupeAbandonSessionsBySessionId(entries).length;
}

/**
 * IVR = call_summary ANSWERED with no agent, minus queue abandons >= 5 min (those are lost, not IVR).
 */
async function countIvrAnsweredExcludingQueueLost(
  sequelize,
  startDateTime,
  endDateTime
) {
  const lostSessions = await fetchQueueAbandonSessionsRaw(
    sequelize,
    startDateTime,
    endDateTime,
    true,
    { queueOnly: false }
  );
  const lostCallerKeys = new Set();
  for (const s of lostSessions) {
    const key = callerMatchKey(normalizeCaller(s.caller));
    if (key) lostCallerKeys.add(key);
  }

  let rows = [];
  try {
    rows = await sequelize.query(
      `
      SELECT
        COALESCE(
          NULLIF(TRIM(caller), ''),
          NULLIF(TRIM(clid), ''),
          NULLIF(TRIM(src), ''),
          NULLIF(TRIM(phone), '')
        ) AS caller_raw
      FROM call_summary
      WHERE call_start BETWEEN :startDateTime AND :endDateTime
        AND status = 'ANSWERED'
        AND (agent IS NULL OR TRIM(agent) = '')
      `,
      {
        replacements: { startDateTime, endDateTime },
        type: QueryTypes.SELECT,
      }
    );
  } catch (err) {
    const msg = String(err?.message || err);
    if (!/caller|clid|phone|Unknown column/i.test(msg)) throw err;
    const [countRes] = await sequelize.query(
      `
      SELECT COUNT(*) AS total
      FROM call_summary
      WHERE call_start BETWEEN :startDateTime AND :endDateTime
        AND status = 'ANSWERED'
        AND (agent IS NULL OR TRIM(agent) = '')
      `,
      {
        replacements: { startDateTime, endDateTime },
        type: QueryTypes.SELECT,
      }
    );
    return Math.max(
      0,
      parseInt(countRes?.total || 0, 10) - lostCallerKeys.size
    );
  }

  let count = 0;
  for (const row of rows) {
    const key = callerMatchKey(normalizeCaller(row.caller_raw));
    if (!key || lostCallerKeys.has(key)) continue;
    count++;
  }
  return count;
}

/** For testing: why lost count is N and what to do to increase it. */
async function getLostCallsDiagnostics(sequelize) {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const dayStart = `${y}-${m}-${d} 00:00:00`;
  const dayEnd = `${y}-${m}-${d} 23:59:59`;

  await ensureLostAbandonsInMissedCalls(sequelize, { force: true });

  const [missedRows, lostEntries, lostCount] = await Promise.all([
    fetchMissedCallsTodayRaw(sequelize),
    buildLostEntriesForRange(sequelize, dayStart, dayEnd),
    countTodayMissedCalls(sequelize),
  ]);

  return {
    lostCount,
    lostMinSeconds: LOST_MIN_DURATION_SECONDS,
    countRule:
      "Union of: queue_log wait >= 5m, CDR queue abandons >= 5m, and each MissedCalls row today (same number can repeat).",
    missedCallTableRows: missedRows.length,
    lostEntries: lostEntries.map((e) => ({
      caller: e.caller,
      wait_seconds: e.wait_seconds ?? null,
      session_id: e.session_id ?? null,
      source: e.source,
      call_time: e.call_time,
    })),
    howToTest: [
      "Wait at least 5 minutes in the call queue (music/hold), then hang up.",
      "Repeat from the same number — each 5+ min abandon adds +1 to lost count.",
      "Use format 07XXXXXXXX (10 digits starting with 0).",
      "Wait 1–2 minutes, refresh dashboard or open GET /api/calls/lost-calls-diagnostics",
      "Deploy latest missedCallHelper.js and pm2 restart all",
    ],
    timestamp: new Date().toISOString(),
  };
}

module.exports = {
  DEDUP_WINDOW_SECONDS,
  QUEUE_EXIT_TIMEOUT_SECONDS,
  LOST_CLASSIFY_GRACE_SECONDS,
  LOST_MIN_DURATION_SECONDS,
  hasKnownQueueWait,
  normalizeQueueWaitSeconds,
  isLostWaitSeconds,
  isDroppedWaitSeconds,
  queueWaitToMinutes,
  parseQueueLogWaitSeconds,
  effectiveQueueWaitSeconds,
  fetchQueueLogWaitMap,
  fetchQueueLogSpanLostSessions,
  buildLostEntriesForRange,
  getTodayBounds,
  isLostSessionRow,
  fetchCelQueueWaitMap,
  getLostCallsDiagnostics,
  fetchMissedCallsTodayRaw,
  dedupeMissedCallsLatestPerCaller,
  MISSED_CALLS_TODAY_SQL,
  isCustomerCaller,
  normalizeCaller,
  callerMatchKey,
  dedupeLostCalls,
  dedupeIncomingLostCdrs,
  dedupeAbandonSessionsBySessionId,
  filterDroppedAbandonSessions,
  fetchTodayQueueLostSessionsRaw,
  fetchQueueAbandonSessionsRaw,
  fetchCallSummaryDurationMap,
  fetchCallSummaryLongWaitSessions,
  countQueueLostInRange,
  countQueueDroppedInRange,
  fetchDroppedCallsForRange,
  fetchLostCallsForRange,
  ensureLostAbandonsInMissedCalls,
  getTodayLostSessionsDeduped,
  countTodayMissedCalls,
  countMissedCallsInRange,
  countIvrAnsweredExcludingQueueLost,
  getTodayLostCallsList,
};
