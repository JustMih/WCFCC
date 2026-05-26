const sequelize = require("../../config/database");
const { Op } = require("sequelize");
const CDR = require("../../models/CDR");
const {
  DEDUP_WINDOW_SECONDS,
  normalizeCaller,
  callerMatchKey,
  dedupeLostCalls,
} = require("../../utils/missedCallHelper");
const { getCdrSessionIdExpr } = require("../../utils/cdrSchemaHelper");

// Controller to get data for different time frames (Total, Monthly, Weekly, Daily)
const getCdrCounts = async (req, res) => {
  try {
    console.log("Current Date: ", new Date().toISOString());

    const totalCounts = await sequelize.query(
      "SELECT disposition, COUNT(*) AS count FROM cdr GROUP BY disposition"
    );

    const monthlyCounts = await sequelize.query(
      "SELECT disposition, COUNT(*) AS count FROM cdr WHERE YEAR(cdrstarttime) = YEAR(CURDATE()) AND MONTH(cdrstarttime) = MONTH(CURDATE()) GROUP BY disposition"
    );

    const weeklyCounts = await sequelize.query(
      "SELECT disposition, COUNT(*) AS count FROM cdr WHERE YEAR(cdrstarttime) = YEAR(CURDATE()) AND WEEK(cdrstarttime, 1) = WEEK(CURDATE(), 1) GROUP BY disposition"
    );

    const dailyCounts = await sequelize.query(
      "SELECT disposition, COUNT(*) AS count FROM cdr WHERE DATE(cdrstarttime) = CURDATE() GROUP BY disposition"
    );

    const totalRows = await sequelize.query(
      "SELECT COUNT(*) AS total FROM cdr"
    );

    res.json({
      totalCounts: totalCounts[0],
      monthlyCounts: monthlyCounts[0],
      weeklyCounts: weeklyCounts[0],
      dailyCounts: dailyCounts[0],
      totalRows: totalRows[0][0].total,
    });
  } catch (err) {
    console.error("Error retrieving CDR data:", err.message);
    res.status(500).send("Internal Server Error");
  }
};

const getAgentCdrStats = async (req, res) => {
  const agentId = req.params.agentId;
  const dstPattern = `PJSIP/${agentId}%`;

  try {
    // Inbound: agent was destination, only today's calls
    const inboundCalls = await sequelize.query(
      `
      SELECT 
        COUNT(*) AS total,
        SUM(CASE WHEN disposition = 'ANSWERED' THEN 1 ELSE 0 END) AS answered,
        SUM(CASE WHEN disposition != 'ANSWERED' AND COALESCE(duration, 0) <= 60 THEN 1 ELSE 0 END) AS dropped,
        SUM(CASE WHEN disposition != 'ANSWERED' AND COALESCE(duration, 0) > 60 THEN 1 ELSE 0 END) AS lost
      FROM cdr
      WHERE dstchannel LIKE :dstPattern
        AND DATE(cdrstarttime) = CURDATE()
    `,
      {
        replacements: { dstPattern },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    // Outbound: agent was source, only today's calls
    const outboundCalls = await sequelize.query(
      `
      SELECT 
        COUNT(*) AS total,
        SUM(CASE WHEN disposition = 'ANSWERED' THEN 1 ELSE 0 END) AS answered,
        SUM(CASE WHEN disposition != 'ANSWERED' AND COALESCE(duration, 0) <= 60 THEN 1 ELSE 0 END) AS dropped,
        SUM(CASE WHEN disposition != 'ANSWERED' AND COALESCE(duration, 0) > 60 THEN 1 ELSE 0 END) AS lost
      FROM cdr
      WHERE channel LIKE :dstPattern
        AND DATE(cdrstarttime) = CURDATE()
    `,
      {
        replacements: { dstPattern },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    res.json({
      inbound: inboundCalls[0],
      outbound: outboundCalls[0],
    });
  } catch (err) {
    console.error("Error fetching agent call stats:", err.message);
    res.status(500).send("Internal Server Error");
  }
};

// New: Only today's calls for agent
const getAgentCdrStatsToday = async (req, res) => {
  const agentId = req.params.agentId;
  const dstPattern = `PJSIP/${agentId}%`;

  try {
    // Inbound: agent was destination, only today's calls
    const inboundCalls = await sequelize.query(
      `
      SELECT 
        COUNT(*) AS total,
        SUM(CASE WHEN disposition = 'ANSWERED' THEN 1 ELSE 0 END) AS answered,
        SUM(CASE WHEN disposition != 'ANSWERED' AND COALESCE(duration, 0) <= 60 THEN 1 ELSE 0 END) AS dropped,
        SUM(CASE WHEN disposition != 'ANSWERED' AND COALESCE(duration, 0) > 60 THEN 1 ELSE 0 END) AS lost
      FROM cdr
      WHERE dstchannel LIKE :dstPattern
        AND DATE(cdrstarttime) = CURDATE()
    `,
      {
        replacements: { dstPattern },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    // Outbound: agent was source, only today's calls
    const outboundCalls = await sequelize.query(
      `
      SELECT 
        COUNT(*) AS total,
        SUM(CASE WHEN disposition = 'ANSWERED' THEN 1 ELSE 0 END) AS answered,
        SUM(CASE WHEN disposition != 'ANSWERED' AND COALESCE(duration, 0) <= 60 THEN 1 ELSE 0 END) AS dropped,
        SUM(CASE WHEN disposition != 'ANSWERED' AND COALESCE(duration, 0) > 60 THEN 1 ELSE 0 END) AS lost
      FROM cdr
      WHERE channel LIKE :dstPattern
        AND DATE(cdrstarttime) = CURDATE()
    `,
      {
        replacements: { dstPattern },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    res.json({
      inbound: inboundCalls[0],
      outbound: outboundCalls[0],
    });
  } catch (err) {
    console.error("Error fetching agent call stats (today):", err.message);
    res.status(500).send("Internal Server Error");
  }
};
const syncMissedCallsFromCdrToday = async () => {
  const sessionIdExpr = await getCdrSessionIdExpr(sequelize, "c");
  const rows = await sequelize.query(
    `
    SELECT
      ${sessionIdExpr} AS linkedid,
      COALESCE(
        NULLIF(TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(c.clid, '<', -1), '>', 1)), ''),
        NULLIF(TRIM(c.src), ''),
        NULLIF(TRIM(c.clid), '')
      ) AS caller_raw,
      c.cdrstarttime AS time,
      SUBSTRING_INDEX(c.dstchannel, '/', -1) AS agentId
    FROM cdr c
    WHERE c.lastapp = 'Queue'
      AND c.disposition IN ('NO ANSWER', 'BUSY', 'FAILED')
      AND DATE(c.cdrstarttime) = CURDATE()
      AND (c.clid IS NOT NULL OR c.src IS NOT NULL)
    ORDER BY c.cdrstarttime ASC
    `,
    { type: sequelize.QueryTypes.SELECT }
  );

  const lastByCaller = new Map();

  for (const row of rows) {
    const caller = normalizeCaller(row.caller_raw);
    if (caller === "UNKNOWN") continue;

    const t = new Date(row.time).getTime();
    const prev = lastByCaller.get(caller);
    if (prev != null && t - prev <= DEDUP_WINDOW_SECONDS * 1000) {
      continue;
    }
    lastByCaller.set(caller, t);

    const matchKey = callerMatchKey(caller);
    const existingRows = await sequelize.query(
      `
      SELECT id, caller FROM MissedCalls
      WHERE DATE(time) = CURDATE()
        AND (archived = 0 OR archived IS NULL)
        AND ABS(TIMESTAMPDIFF(SECOND, time, :time)) <= :windowSec
      `,
      {
        replacements: { time: row.time, windowSec: DEDUP_WINDOW_SECONDS },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    const duplicate = existingRows.some(
      (mc) => callerMatchKey(mc.caller) === matchKey
    );
    if (duplicate) continue;

    await sequelize.query(
      `
      INSERT INTO MissedCalls
        (caller, time, agentId, status, archived, createdAt, updatedAt, linkedid)
      VALUES
        (:caller, :time, :agentId, 'pending', 0, NOW(), NOW(), :linkedid)
      `,
      {
        replacements: {
          caller,
          time: row.time,
          agentId: row.agentId || null,
          linkedid: row.linkedid || null,
        },
        type: sequelize.QueryTypes.INSERT,
      }
    );
  }
};

// Get lost calls for today with phone numbers
const getLostCallsToday = async (req, res) => {
  try {
    const lostCalls = await sequelize.query(
      `SELECT mc.caller, mc.time AS call_time, mc.status, mc.called_back_by AS callback_agent_extension, u.full_name AS callback_agent_name, mc.called_back_at AS callback_time, mc.billsec AS callback_duration FROM MissedCalls mc LEFT JOIN Users u ON u.extension = mc.called_back_by WHERE DATE(mc.time) = CURDATE() AND mc.archived = 0 ORDER BY mc.time DESC`,
      {
        type: sequelize.QueryTypes.SELECT,
      }
    );

    res.json(dedupeLostCalls(lostCalls, "call_time"));
  } catch (err) {
    console.error("Error retrieving lost calls:", err.message);
    res.status(500).send("Internal Server Error");
  }
};
/**
 * Marks a missed call as "called back" when agent explicitly clicks the callback button.
 * Updates status, agent who called back, and timestamp.
 * 
 * @route POST /missed-calls/callback
 * @body { id?: number, agentExt: string, caller?: string, callbackTime?: string }
 */
const markMissedCallCallback = async (req, res) => {
  const { id, agentExt, caller, callbackTime } = req.body;

  // Validation
  if (!agentExt) {
    return res.status(400).json({
      success: false,
      error: "agentExt is required (agent extension who performed the callback)",
    });
  }

  if (!id && !caller) {
    return res.status(400).json({
      success: false,
      error: "Either 'id' or 'caller' must be provided",
    });
  }

  const effectiveTime = callbackTime || new Date().toISOString();

  try {
    let affectedRows = 0;

    if (id) {
      // ── Preferred path: update by primary key ──
      const [result] = await sequelize.query(
        `
        UPDATE MissedCalls
        SET
          status         = 'called_back',
          called_back_by = :agentExt,
          called_back_at = :effectiveTime,
          updatedAt      = NOW()
        WHERE id = :id
          AND status = 'pending'
        `,
        {
          replacements: { id, agentExt, effectiveTime },
          type: sequelize.QueryTypes.UPDATE,
        }
      );

      affectedRows = result?.affectedRows || 0;
    } else {
      // ── Fallback: match by caller (last pending record) ──
      // Using derived table to avoid MySQL "You can't specify target table for update in FROM clause"
      const [result] = await sequelize.query(
        `
        UPDATE MissedCalls mc
        SET
          status         = 'called_back',
          called_back_by = :agentExt,
          called_back_at = :effectiveTime,
          updatedAt      = NOW()
        WHERE mc.id = (
          SELECT id FROM (
            SELECT id
            FROM MissedCalls
            WHERE caller = :caller
              AND status = 'pending'
            ORDER BY time DESC
            LIMIT 1
          ) AS tmp
        )
        `,
        {
          replacements: { caller, agentExt, effectiveTime },
          type: sequelize.QueryTypes.UPDATE,
        }
      );

      affectedRows = result?.affectedRows || 0;
    }

    if (affectedRows === 0) {
      return res.status(404).json({
        success: false,
        error: "No pending missed call found matching the provided id or caller",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Missed call successfully marked as called back",
      updatedRows: affectedRows,
    });
  } catch (error) {
    console.error("Error in markMissedCallCallback:", {
      message: error.message,
      stack: error.stack,
      body: req.body,
    });

    return res.status(500).json({
      success: false,
      error: "Failed to update missed call",
      detail: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};
// Get all received calls (ANSWERED calls)
const getReceivedCalls = async (req, res) => {
  try {
    const { limit = 500, offset = 0 } = req.query;
    const receivedCalls = await sequelize.query(
      `SELECT 
        clid AS caller,
        cdrstarttime AS call_time,
        disposition,
        duration,
        src AS agent_extension,
        dst AS destination,
        dstchannel AS destination_channel
      FROM cdr 
      WHERE disposition = 'ANSWERED'
        AND clid IS NOT NULL
        AND clid != ''
      ORDER BY cdrstarttime DESC
      LIMIT :limit OFFSET :offset`,
      {
        replacements: { limit: parseInt(limit), offset: parseInt(offset) },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    const totalCount = await sequelize.query(
      `SELECT COUNT(*) AS total
       FROM cdr 
       WHERE disposition = 'ANSWERED'
         AND clid IS NOT NULL
         AND clid != ''`,
      {
        type: sequelize.QueryTypes.SELECT,
      }
    );

    res.json({
      calls: receivedCalls,
      total: totalCount[0]?.total || 0,
    });
  } catch (err) {
    console.error("Error retrieving received calls:", err.message);
    res.status(500).send("Internal Server Error");
  }
};
const syncMissedCallCallbacksFromCdrToday = async () => {
  try {
    const [result] = await sequelize.query(`
      UPDATE MissedCalls mc
      INNER JOIN cdr c
         ON c.disposition = 'ANSWERED'
        AND c.lastapp IS NULL          -- outbound calls
        AND c.clid = mc.caller
        AND c.cdrstarttime >= mc.time
        AND c.cdrstarttime <= DATE_ADD(mc.time, INTERVAL 30 MINUTE)
      SET
        mc.status         = 'called_back',
        mc.called_back_by = c.src,
        mc.called_back_at = c.cdrstarttime,
        mc.billsec        = c.billsec,
        mc.updatedAt      = NOW()
      WHERE mc.status = 'pending'
    `, { type: sequelize.QueryTypes.UPDATE });

    const affected = result?.affectedRows || 0;
    if (affected > 0) {
      console.log(`[CDR CALLBACK SYNC] Updated ${affected} missed calls`);
    }
  } catch (err) {
    console.error("[CDR CALLBACK SYNC ERROR]", err.message);
  }
};

// Get all lost calls (NO ANSWER calls that were in queue)
const getLostCalls = async (req, res) => {
  try {
    const { limit = 500, offset = 0 } = req.query;
       await syncMissedCallCallbacksFromCdrToday();
    const lostCalls = await sequelize.query(
      `SELECT 
        clid AS caller,
        cdrstarttime AS call_time,
        disposition,
        duration,
        src AS agent_extension,
        dst AS destination,
        lastapp
      FROM cdr 
      WHERE (disposition = 'NO ANSWER' OR disposition = 'BUSY' OR disposition = 'FAILED')
        AND duration > 60
        AND clid IS NOT NULL
        AND clid != ''
      ORDER BY cdrstarttime DESC
      LIMIT :limit OFFSET :offset`,
      {
        replacements: { limit: parseInt(limit), offset: parseInt(offset) },
        type: sequelize.QueryTypes.SELECT,
      }
    );


    const totalCount = await sequelize.query(
      `SELECT COUNT(*) AS total
       FROM cdr 
       WHERE (disposition = 'NO ANSWER' OR disposition = 'BUSY' OR disposition = 'FAILED')
         AND duration > 60
         AND clid IS NOT NULL
         AND clid != ''`,
      {
        type: sequelize.QueryTypes.SELECT,
      }
    );

    res.json({
      calls: lostCalls,
      total: totalCount[0]?.total || 0,
    });
  } catch (err) {
    console.error("Error retrieving lost calls:", err.message);
    res.status(500).send("Internal Server Error");
  }
};

// Get all dropped calls (calls that hung up without answer and were NOT in queue)
const getDroppedCalls = async (req, res) => {
  try {
    const { limit = 500, offset = 0 } = req.query;
    const droppedCalls = await sequelize.query(
      `SELECT 
        clid AS caller,
        cdrstarttime AS call_time,
        disposition,
        duration,
        src AS agent_extension,
        dst AS destination,
        lastapp
      FROM cdr 
      WHERE (disposition = 'NO ANSWER' OR disposition = 'BUSY' OR disposition = 'FAILED')
        AND duration <= 60
        AND clid IS NOT NULL
        AND clid != ''
      ORDER BY cdrstarttime DESC
      LIMIT :limit OFFSET :offset`,
      {
        replacements: { limit: parseInt(limit), offset: parseInt(offset) },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    const totalCount = await sequelize.query(
      `SELECT COUNT(*) AS total
       FROM cdr 
       WHERE (disposition = 'NO ANSWER' OR disposition = 'BUSY' OR disposition = 'FAILED')
         AND duration <= 60
         AND clid IS NOT NULL
         AND clid != ''`,
      {
        type: sequelize.QueryTypes.SELECT,
      }
    );

    res.json({
      calls: droppedCalls,
      total: totalCount[0]?.total || 0,
    });
  } catch (err) {
    console.error("Error retrieving dropped calls:", err.message);
    res.status(500).send("Internal Server Error");
  }
};

// Mark lost call as answered (called back)
const markLostCallAsAnswered = async (req, res) => {
  try {
    const { caller, call_time } = req.body;

    if (!caller || !call_time) {
      return res.status(400).json({
        error: "Missing required fields: caller and call_time",
      });
    }

    // Update the CDR record to change disposition from NO ANSWER to ANSWERED
    const result = await sequelize.query(
      `UPDATE cdr 
       SET disposition = 'ANSWERED'
       WHERE clid = :caller 
         AND DATE(cdrstarttime) = DATE(:call_time)
         AND (disposition = 'NO ANSWER' OR disposition = 'BUSY' OR disposition = 'FAILED')
         AND lastapp = 'Queue'`,
      {
        replacements: {
          caller: caller,
          call_time: call_time,
        },
        type: sequelize.QueryTypes.UPDATE,
      }
    );

    // For MySQL, result is an array where first element contains metadata with affectedRows
    const affectedRows = result?.[0]?.affectedRows || 0;

    if (affectedRows === 0) {
      return res.status(404).json({
        error: "Lost call not found or already updated",
      });
    }

    res.json({
      success: true,
      message: "Lost call marked as answered",
      updatedRows: affectedRows,
    });
  } catch (err) {
    console.error("Error marking lost call as answered:", err.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

// ✅ Correct combined export
module.exports = {
  getCdrCounts,
  getAgentCdrStats,
  dailyAgentCallStatus: getAgentCdrStatsToday,
  getLostCallsToday,
  getReceivedCalls,
  getLostCalls,
  getDroppedCalls,
  markLostCallAsAnswered,
  markMissedCallCallback,
  syncMissedCallsFromCdrToday,
};
