const sequelize = require("../../config/mysql_connection");
const {
  buildHolidaySet,
  filterOffHoursRecords,
  buildSummary,
} = require("../../utils/offHoursHelper");
const { buildPlayablePath } = require("../../utils/voiceNoteAudio");
const {
  enrichCdrRecord,
  dedupeCdrLegs,
  enrichVoiceNoteRecord,
  enrichMissedCallRecord,
  syncMissedCallCallbacksInRange,
  buildEmergencyLookup,
  applySessionRouting,
  fetchCdrRoutingHints,
  buildCdrRoutingIndex,
} = require("../../utils/offHoursReportHelper");
const { dedupeLostCalls } = require("../../utils/missedCallHelper");
const { getCdrLinkedidSelect } = require("../../utils/cdrSchemaHelper");

let Holiday;
try {
  const models = require("../../models");
  Holiday = models.holidays;
} catch {
  Holiday = null;
}

exports.getOffHoursReport = async (req, res) => {
  const { startDate, endDate } = req.params;
  const source = req.query.source || "voice-notes";

  if (!startDate || !endDate) {
    return res
      .status(400)
      .json({ error: "Start date and end date are required" });
  }

  try {
    let holidayRows = [];
    if (Holiday) {
      holidayRows = await Holiday.findAll({
        attributes: ["holiday_date", "name"],
      });
    } else {
      holidayRows = await sequelize.query(
        `SELECT holiday_date, name FROM holidays`,
        { type: sequelize.QueryTypes.SELECT }
      );
    }
    const holidayDates = buildHolidaySet(holidayRows);

    let emergencyRows = [];
    try {
      emergencyRows = await sequelize.query(
        `SELECT id, phone_number, priority FROM emergency_numbers ORDER BY priority ASC`,
        { type: sequelize.QueryTypes.SELECT }
      );
    } catch (e) {
      console.warn("emergency_numbers lookup skipped:", e.message);
    }
    const { byPhone: emergencyByPhone } = buildEmergencyLookup(emergencyRows);

    let records = [];
    let timestampField = "created_at";

    if (source === "cdr") {
      timestampField = "cdrstarttime";
      const linkedidCol = await getCdrLinkedidSelect(sequelize);
      records = await sequelize.query(
        `SELECT id, clid, src, dst, did, dcontext, channel, dstchannel, disposition,
                duration, billsec, ${linkedidCol}uniqueid, lastapp, lastdata, userfield,
                cdrstarttime
         FROM cdr
         WHERE cdrstarttime BETWEEN CONCAT(:startDate, ' 00:00:00') AND CONCAT(:endDate, ' 23:59:59')
         ORDER BY cdrstarttime DESC`,
        {
          replacements: { startDate, endDate },
          type: sequelize.QueryTypes.SELECT,
        }
      );
    } else if (source === "missed-calls") {
      timestampField = "time";
      await syncMissedCallCallbacksInRange(sequelize, startDate, endDate);
      records = await sequelize.query(
        `SELECT mc.id, mc.caller, mc.time, mc.status, mc.agentId, mc.linkedid,
                mc.called_back_by, mc.called_back_at, mc.billsec,
                u.full_name AS callback_agent_name
         FROM MissedCalls mc
         LEFT JOIN Users u ON u.extension = mc.called_back_by
         WHERE mc.time BETWEEN CONCAT(:startDate, ' 00:00:00') AND CONCAT(:endDate, ' 23:59:59')
           AND (mc.archived = 0 OR mc.archived IS NULL)
         ORDER BY mc.time DESC`,
        {
          replacements: { startDate, endDate },
          type: sequelize.QueryTypes.SELECT,
        }
      );
    } else {
      records = await sequelize.query(
        `SELECT id, recording_path, clid, assigned_extension, assigned_agent_id, is_played,
                duration_seconds, transcription, created_at
         FROM Voice_Notes
         WHERE created_at BETWEEN CONCAT(:startDate, ' 00:00:00') AND CONCAT(:endDate, ' 23:59:59')
         ORDER BY created_at DESC`,
        {
          replacements: { startDate, endDate },
          type: sequelize.QueryTypes.SELECT,
        }
      );
      records = records.map((record) => ({
        ...record,
        playable_path: buildPlayablePath(record.recording_path),
      }));
    }

    let offHoursRecords = filterOffHoursRecords(
      records,
      timestampField,
      holidayDates
    );

    if (source === "cdr") {
      offHoursRecords = applySessionRouting(offHoursRecords, emergencyByPhone);
      offHoursRecords = dedupeCdrLegs(
        offHoursRecords.map((r) => enrichCdrRecord(r, emergencyByPhone))
      );
    } else if (source === "missed-calls") {
      offHoursRecords = dedupeLostCalls(
        offHoursRecords.map((r) => enrichMissedCallRecord(r)),
        "time"
      );
    } else {
      const cdrHints = await fetchCdrRoutingHints(sequelize, startDate, endDate);
      const filteredHints = filterOffHoursRecords(
        cdrHints,
        "cdrstarttime",
        holidayDates
      );
      const hintsWithRouting = applySessionRouting(
        filteredHints,
        emergencyByPhone
      );
      const enrichedHints = dedupeCdrLegs(
        hintsWithRouting.map((r) => enrichCdrRecord(r, emergencyByPhone))
      );
      const cdrIndex = buildCdrRoutingIndex(enrichedHints);
      offHoursRecords = offHoursRecords.map((r) =>
        enrichVoiceNoteRecord(r, emergencyByPhone, cdrIndex)
      );
    }

    const summary = buildSummary(offHoursRecords);

    res.json({
      summary,
      records: offHoursRecords,
      source,
      dateRange: { startDate, endDate },
      emergency_numbers: emergencyRows,
    });
  } catch (error) {
    console.error("Error fetching off-hours report:", error);
    res.status(500).json({ error: error.message });
  }
};
