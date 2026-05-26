/**
 * Off-hours report: caller vs routed-to (emergency_numbers) enrichment
 */

function normalizePhone(raw) {
  if (!raw) return "";
  let phone = String(raw).replace(/[^+\d]/g, "");
  if (phone.startsWith("255")) phone = "0" + phone.slice(3);
  if (phone.startsWith("+255")) phone = "0" + phone.slice(4);
  if (phone.startsWith("+")) phone = phone.slice(1);
  if (!phone.startsWith("0") && phone.length === 9) phone = "0" + phone;
  return phone;
}

function parseCallerPhone(clid, src) {
  if (clid) {
    const angle = String(clid).match(/<([^>]+)>/);
    if (angle && angle[1]) {
      const p = normalizePhone(angle[1]);
      if (p.length >= 9) return p;
    }
    const digits = String(clid).replace(/[^\d+]/g, "");
    const p = normalizePhone(digits);
    if (p.length >= 9) return p;
  }
  const fromSrc = normalizePhone(src);
  if (fromSrc.length >= 9) return fromSrc;
  return "";
}

/** WCF outbound CID on emergency-dial — not the on-call destination */
const EXCLUDED_ROUTING_NORMALIZED = new Set([
  normalizePhone("+255222211770"),
  normalizePhone("255222211770"),
]);

function isEmergencyDialContext(record) {
  const uf = String(record?.userfield || "").toUpperCase();
  const ctx = String(record?.dcontext || "").toLowerCase();
  return uf === "EMERGENCY" || ctx.includes("emergency");
}

function isAsteriskExtensionDst(dst) {
  const s = String(dst || "").trim();
  if (!s) return false;
  if (/^\d{9,}$/.test(s.replace(/\D/g, ""))) return false;
  return s.length <= 2 || /^[a-z]+$/i.test(s);
}

/** Dial(PJSIP/${NUMBER_TO_CALL}@eGA,30) from [emergency-dial] */
function extractPjsipDialTargets(text) {
  if (!text) return [];
  const out = [];
  const re = /PJSIP\/([^@,\s/]+)@/gi;
  let m;
  while ((m = re.exec(String(text))) !== null) {
    const token = m[1].trim();
    if (token) out.push(token);
  }
  return out;
}

function extractPhonesFromText(text) {
  if (!text) return [];
  const matches = String(text).match(/\+?\d{9,15}/g) || [];
  return [...new Set(matches.map((m) => normalizePhone(m)).filter((p) => p.length >= 9))];
}

function extractExtensionFromChannel(channel) {
  if (!channel) return null;
  const s = String(channel);
  const m =
    s.match(/PJSIP\/(\d{3,6})/i) ||
    s.match(/(?:SIP|Local|IAX2)\/(\d{3,6})/i);
  return m ? m[1] : null;
}

function isValidRouteValue(raw) {
  if (!raw) return false;
  const s = String(raw).trim();
  if (s.length < 3) return false;
  const digits = s.replace(/\D/g, "");
  return digits.length >= 9;
}

function buildEmergencyLookup(emergencyRows) {
  const list = (emergencyRows || []).map((row) => ({
    id: row.id,
    phone_number: row.phone_number,
    priority: row.priority,
    normalized: normalizePhone(row.phone_number),
  }));
  const byPhone = new Map();
  for (const e of list) {
    if (e.normalized) byPhone.set(e.normalized, e);
  }
  return { list, byPhone };
}

function matchEmergencyNumber(phone, byPhone) {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  return byPhone.get(normalized) || null;
}

function buildRouteLabel(raw, emergency) {
  if (emergency) {
    return `Emergency #${emergency.priority} (${emergency.phone_number || raw})`;
  }
  return raw;
}

/** Collect routing targets from one CDR leg */
function collectRouteCandidates(record) {
  const seen = new Set();
  const out = [];

  const add = (raw, priority = false) => {
    if (!raw) return;
    const s = String(raw).trim();
    if (!s || seen.has(s)) return;
    const normalized = normalizePhone(s);
    if (EXCLUDED_ROUTING_NORMALIZED.has(normalized)) return;
    seen.add(s);
    if (priority) out.unshift(s);
    else out.push(s);
  };

  // Highest priority: outbound emergency dial string
  for (const field of [record.lastdata, record.dstchannel]) {
    for (const target of extractPjsipDialTargets(field)) {
      add(target, true);
    }
  }

  if (!isAsteriskExtensionDst(record.dst) && isValidRouteValue(record.dst)) {
    add(record.dst);
  }
  if (isValidRouteValue(record.did)) add(record.did);

  for (const phone of extractPhonesFromText(record.lastdata)) {
    add(phone);
  }
  for (const phone of extractPhonesFromText(record.dstchannel)) {
    add(phone);
  }
  for (const phone of extractPhonesFromText(record.channel)) {
    add(phone);
  }

  const ext = extractExtensionFromChannel(record.dstchannel || record.channel);
  if (ext) add(ext);

  return out;
}

function pickBestRoute(candidates, callerPhone, emergencyByPhone) {
  let best = null;
  let bestScore = -1;

  for (const raw of candidates) {
    const normalized = normalizePhone(raw);
    if (!normalized || normalized.length < 9) continue;
    if (normalized === callerPhone) continue;
    if (EXCLUDED_ROUTING_NORMALIZED.has(normalized)) continue;

    const emergency = matchEmergencyNumber(normalized, emergencyByPhone);
    let score = 10;
    if (emergency) score += 100;
    if (raw === emergency?.phone_number) score += 5;

    if (score > bestScore) {
      bestScore = score;
      best = {
        routed_to: emergency?.phone_number || raw,
        routed_to_normalized: normalized,
        emergency_match: emergency,
        routed_to_label: buildRouteLabel(
          emergency?.phone_number || raw,
          emergency
        ),
      };
    }
  }

  return (
    best || {
      routed_to: null,
      routed_to_normalized: "",
      emergency_match: null,
      routed_to_label: "—",
    }
  );
}

function sessionKey(record) {
  const caller = parseCallerPhone(record.clid, record.src);
  const t = record.cdrstarttime
    ? Math.floor(new Date(record.cdrstarttime).getTime() / 90000)
    : 0;
  return record.linkedid || record.uniqueid || `${caller}-${t}`;
}

/** Merge all legs of one call — find Dial/emergency destination */
function resolveRoutedToFromSession(legs, emergencyByPhone) {
  const allCandidates = [];
  for (const leg of legs) {
    allCandidates.push(...collectRouteCandidates(leg));
  }

  const callerPhone = parseCallerPhone(legs[0]?.clid, legs[0]?.src);
  return pickBestRoute(allCandidates, callerPhone, emergencyByPhone);
}

function applySessionRouting(records, emergencyByPhone) {
  const groups = new Map();
  for (const r of records) {
    const key = sessionKey(r);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }

  const routingByKey = new Map();
  for (const [key, legs] of groups) {
    routingByKey.set(key, resolveRoutedToFromSession(legs, emergencyByPhone));
  }

  return records.map((r) => ({
    ...r,
    _sessionRouting: routingByKey.get(sessionKey(r)),
  }));
}

function scoreCdrLeg(record) {
  let score = 0;
  if (isEmergencyDialContext(record)) score += 25;
  if (record.emergency_match) score += 20;
  if (record.routed_to && record.caller_phone !== record.routed_to_normalized) {
    score += 10;
  }
  if (String(record.lastdata || "").includes("@eGA")) score += 15;
  if (Number(record.billsec) > 0) score += 5;
  if (record.lastapp === "Dial") score += 8;
  if (record.disposition === "ANSWERED") score += 3;
  return score;
}

function dedupeCdrLegs(records) {
  const map = new Map();

  for (const record of records) {
    const key = sessionKey(record);
    const existing = map.get(key);
    if (!existing || scoreCdrLeg(record) > scoreCdrLeg(existing)) {
      map.set(key, record);
    }
  }

  return [...map.values()];
}

function enrichCdrRecord(record, emergencyByPhone) {
  const caller_phone = parseCallerPhone(record.clid, record.src);
  const routed =
    record._sessionRouting ||
    pickBestRoute(collectRouteCandidates(record), caller_phone, emergencyByPhone);

  return {
    ...record,
    caller_phone,
    caller_display: caller_phone || record.clid || record.src || "—",
    routed_to: routed.routed_to,
    routed_to_label: routed.routed_to_label,
    destination_display: routed.routed_to_label,
    emergency_match: routed.emergency_match,
    is_emergency_route:
      Boolean(routed.emergency_match) || isEmergencyDialContext(record),
  };
}

function enrichVoiceNoteRecord(record, emergencyByPhone, cdrByCaller) {
  const caller_phone = parseCallerPhone(record.clid, null);
  let routed = pickBestRoute([], caller_phone, emergencyByPhone);

  if (caller_phone && cdrByCaller) {
    const related = cdrByCaller.get(caller_phone);
    if (related?.routed_to) {
      routed = {
        routed_to: related.routed_to,
        routed_to_normalized: related.routed_to_normalized,
        emergency_match: related.emergency_match,
        routed_to_label: related.routed_to_label,
      };
    }
  }

  return {
    ...record,
    caller_phone,
    caller_display: caller_phone || record.clid || "—",
    routed_to: routed.routed_to,
    routed_to_label: routed.routed_to_label,
    destination_display: routed.routed_to_label,
    emergency_match: routed.emergency_match,
    is_emergency_route: Boolean(routed.emergency_match),
  };
}

function buildCdrRoutingIndex(cdrEnriched) {
  const index = new Map();
  for (const c of cdrEnriched) {
    if (!c.caller_phone || !c.routed_to) continue;
    const prev = index.get(c.caller_phone);
    if (!prev || scoreCdrLeg(c) > scoreCdrLeg(prev)) {
      index.set(c.caller_phone, c);
    }
  }
  return index;
}

function enrichMissedCallRecord(record) {
  const caller_phone =
    parseCallerPhone(record.caller, null) || normalizePhone(record.caller);
  const callback_status = record.status || "pending";

  return {
    ...record,
    caller_phone,
    caller_display: caller_phone || record.caller || "—",
    callback_status,
    callback_agent_extension:
      record.called_back_by || record.callback_agent_extension || null,
    callback_agent_name: record.callback_agent_name || null,
    callback_time: record.called_back_at || record.callback_time || null,
    callback_duration: record.billsec ?? record.callback_duration ?? null,
    record_source: "missed-calls",
  };
}

async function syncMissedCallCallbacksInRange(sequelize, startDate, endDate) {
  try {
    await sequelize.query(
      `
      UPDATE MissedCalls mc
      INNER JOIN cdr c
        ON c.disposition = 'ANSWERED'
        AND c.cdrstarttime >= mc.time
        AND c.cdrstarttime <= DATE_ADD(mc.time, INTERVAL 30 MINUTE)
        AND (
          REPLACE(REPLACE(REPLACE(c.dst, ' ', ''), '+', ''), '-', '') = REPLACE(REPLACE(REPLACE(mc.caller, ' ', ''), '+', ''), '-', '')
          OR c.clid = mc.caller
          OR mc.caller LIKE CONCAT('%', REPLACE(REPLACE(c.dst, ' ', ''), '+', ''), '%')
        )
      SET
        mc.status = 'called_back',
        mc.called_back_by = COALESCE(NULLIF(TRIM(mc.called_back_by), ''), SUBSTRING_INDEX(c.channel, '/', -1)),
        mc.called_back_at = c.cdrstarttime,
        mc.billsec = c.billsec,
        mc.updatedAt = NOW()
      WHERE mc.status = 'pending'
        AND mc.time BETWEEN CONCAT(:startDate, ' 00:00:00') AND CONCAT(:endDate, ' 23:59:59')
      `,
      {
        replacements: { startDate, endDate },
        type: sequelize.QueryTypes.UPDATE,
      }
    );
  } catch (err) {
    console.warn("Missed-call callback sync skipped:", err.message);
  }
}

async function fetchCdrRoutingHints(sequelize, startDate, endDate) {
  try {
    const { getCdrLinkedidSelect } = require("./cdrSchemaHelper");
    const linkedidCol = await getCdrLinkedidSelect(sequelize);
    const rows = await sequelize.query(
      `SELECT clid, src, dst, did, dcontext, channel, dstchannel, ${linkedidCol}uniqueid,
              cdrstarttime, lastapp, lastdata, billsec, disposition, userfield
       FROM cdr
       WHERE cdrstarttime BETWEEN CONCAT(:startDate, ' 00:00:00') AND CONCAT(:endDate, ' 23:59:59')
       ORDER BY cdrstarttime DESC`,
      {
        replacements: { startDate, endDate },
        type: sequelize.QueryTypes.SELECT,
      }
    );
    return rows;
  } catch {
    return [];
  }
}

module.exports = {
  parseCallerPhone,
  normalizePhone,
  buildEmergencyLookup,
  applySessionRouting,
  enrichCdrRecord,
  enrichVoiceNoteRecord,
  enrichMissedCallRecord,
  syncMissedCallCallbacksInRange,
  dedupeCdrLegs,
  buildCdrRoutingIndex,
  fetchCdrRoutingHints,
};
