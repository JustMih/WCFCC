const path = require("path");
const fs = require("fs");
const sequelize = require("../../config/mysql_connection");
const { Op } = require("sequelize");
const {
  buildPlayablePath,
  resolveVoiceNoteFilePath,
} = require("../../utils/voiceNoteAudio");
const {
  buildSlaMetricsFromRow,
  SLA_AGGREGATE_SELECT,
} = require("../../utils/slaMetricsHelper");
const { checkSLACompliance } = require("../../services/workflowCommunicationService");

let offHoursReportController = {};
let slaReportController = {};
try {
  offHoursReportController = require("./offHoursReport.controller");
} catch (err) {
  console.warn(
    "[reports.controller] offHoursReport.controller not loaded:",
    err.message
  );
}
try {
  slaReportController = require("./slaReport.controller");
} catch (err) {
  console.warn(
    "[reports.controller] slaReport.controller not loaded:",
    err.message
  );
}

let VoiceNote;
let CDR;
let IVRDTMFMapping;
let IVRAction;
let IVRVoice;
let Ticket;
let User;
let Notification;
let TicketAssignment;
let RequesterDetails;
let IVRDTMFLog;
let Holiday;

try {
  VoiceNote = require("../../models/voice_notes.model");
  CDR = require("../../models/cdr.model");
  IVRDTMFMapping = require("../../models/ivr_dtmf_mappings.model");
  Ticket = require("../../models/Ticket");
  User = require("../../models/User");
  Notification = require("../../models/Notification");
  TicketAssignment = require("../../models/TicketAssignment");
  RequesterDetails = require("../../models/RequesterDetails");

  const models = require("../../models");
  IVRAction = models.IVRAction;
  IVRVoice = models.IVRVoice;
  IVRDTMFLog = models.IVRDTMFLog;
  Holiday = models.holidays;
} catch (error) {
  console.error("Error loading models in reports controller:", error.message);
  try {
    IVRAction = require("../../models/IVRAction");
  } catch (e) {
    /* optional */
  }
  try {
    IVRVoice = require("../../models/IVRVoice");
  } catch (e) {
    /* optional */
  }
  try {
    const { DataTypes } = require("sequelize");
    IVRDTMFLog = require("../../models/IVRDTMFLog")(sequelize, DataTypes);
  } catch (e) {
    /* optional */
  }
}

exports.getVoiceNotes = async (req, res) => {
  try {
    if (!VoiceNote) {
      throw new Error("VoiceNote model is not available");
    }
    const voiceNotes = await VoiceNote.findAll();
    res.json(voiceNotes);
  } catch (error) {
    console.error("Error in getVoiceNotes:", error);
    res.status(500).json({ error: error.message });
  }
};
exports.streamVoiceNote = async (req, res) => {
  const { id } = req.params;

  try {
    const voiceNote = await VoiceNote.findByPk(id);

    if (!voiceNote || !voiceNote.recording_path) {
      return res.status(404).json({ error: "Voice note not found in database" });
    }

    const filePath = resolveVoiceNoteFilePath(voiceNote.recording_path);

    if (!filePath) {
      console.warn(
        "Voice file missing on disk:",
        id,
        voiceNote.recording_path
      );
      return res.status(404).json({
        error: "Voice file not found on disk",
        recording_path: voiceNote.recording_path,
        hint: "Use /voice/custom/... URL from the live server if running API locally",
      });
    }

    res.sendFile(filePath, { headers: { "Content-Type": "audio/wav" } });
  } catch (error) {
    console.error("Error streaming voice note:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.getCDRReports = async (req, res) => {
  try {
    if (!CDR) {
      throw new Error("CDR model is not available");
    }
    const cdrReports = await CDR.findAll({
      order: [["cdrstarttime", "DESC"]], // Replace 'calldate' with your actual datetime column name
    });
    res.json(cdrReports);
  } catch (error) {
    console.error("Error in getCDRReports:", error);
    res.status(500).json({ error: error.message });
  }
};

// Test endpoint to verify table access
exports.testIVRTable = async (req, res) => {
  try {
    console.log("Testing IVR_DTMF_Logs table access...");

    // Try simple query first
    const testQuery = `SELECT COUNT(*) as count FROM IVR_DTMF_Logs`;
    const countResult = await sequelize.query(testQuery, {
      type: sequelize.QueryTypes.SELECT,
    });

    console.log("Table count result:", countResult);

    // Try to get a few records
    const sampleQuery = `SELECT * FROM IVR_DTMF_Logs ORDER BY timestamp DESC LIMIT 5`;
    const sampleResult = await sequelize.query(sampleQuery, {
      type: sequelize.QueryTypes.SELECT,
    });

    console.log("Sample records:", sampleResult);

    res.json({
      success: true,
      tableExists: true,
      recordCount: countResult[0]?.count || 0,
      sampleRecords: sampleResult,
      message: "Table is accessible",
    });
  } catch (error) {
    console.error("Test query error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
};

 
exports.getIVRInteractions = async (req, res) => {
  try {
    const { startDate, endDate } = req.params;
    const dateFilter =
      startDate && endDate
        ? `WHERE m.createdAt BETWEEN CONCAT(:startDate, ' 00:00:00') AND CONCAT(:endDate, ' 23:59:59')`
        : "";

    const query = `
      SELECT
        m.id,
        m.dtmf_digit,
        m.parameter,
        m.language,
        m.menu_context,
        m.createdAt,
        m.updatedAt,

        a.id   AS action_id,
        a.name AS action_name,

        v.id        AS voice_id,
        v.file_path AS voice_file_name

      FROM IVRDTMFMappings m
      LEFT JOIN IVRActions a
        ON a.id = m.action_id
      LEFT JOIN IVRVoices v
        ON v.id = m.ivr_voice_id
      ${dateFilter}
      ORDER BY m.createdAt DESC
      LIMIT 5000
    `;

    const rows = await sequelize.query(query, {
      replacements: startDate && endDate ? { startDate, endDate } : {},
      type: sequelize.QueryTypes.SELECT,
    });

    const formatted = rows.map(r => ({
      id: r.id,
      dtmf_digit: r.dtmf_digit,
      parameter: r.parameter,
      language: r.language,
      menu_context: r.menu_context,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      action: r.action_id
        ? { id: r.action_id, name: r.action_name }
        : null,
      voice: r.voice_id
        ? { id: r.voice_id, file_name: r.voice_file_name }
        : null,
    }));

    res.json(formatted);
  } catch (err) {
    console.error("IVR Interactions error:", err);
    res.status(500).json({ error: err.message });
  }
};


// Serve the audio files
exports.serveVoiceNote = (req, res) => {
  const filename = decodeURIComponent(req.params.filename);
  const filePath = path.join("/var/lib/asterisk/sounds/custom", filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send("File not found");
  }

  res.sendFile(filePath, { headers: { "Content-Type": "audio/wav" } });
};

exports.getVoiceReport = (req, res) => {
  const { startDate, endDate } = req.params; // <-- use req.params

  if (!startDate || !endDate) {
    return res
      .status(400)
      .json({ error: "Start date and end date are required" });
  }

 const query = sequelize.query(
  `
  SELECT 
    vn.id,
    vn.recording_path,
    CONCAT(
      'custom/',
      SUBSTRING_INDEX(
        SUBSTRING_INDEX(vn.recording_path, '/', -1),
        '.',
        1
      ),
      '.wav'
    ) AS playable_path,
    vn.clid,
    vn.assigned_extension,
    u.full_name AS assigned_agent_name,
    vn.is_played,
    vn.duration_seconds,
    vn.transcription,
    vn.created_at
  FROM Voice_Notes vn
  LEFT JOIN Users u
    ON u.extension = vn.assigned_extension
  WHERE vn.created_at BETWEEN
    CONCAT(:startDate, ' 00:00:00')
    AND
    CONCAT(:endDate, ' 23:59:59')
  ORDER BY vn.created_at DESC
  `,
  {
    replacements: { startDate, endDate },
    type: sequelize.QueryTypes.SELECT,
  }
);

  query
    .then((voices) => {
      if (voices.length === 0) {
        return res.status(404).json({ message: "No voice notes found" });
      }
      res.json(voices);
    })
    .catch((error) => {
      console.error("Error fetching voice notes:", error);
      res.status(500).json({ error: error.message });
    });
};

exports.getCDRReport = (req, res) => {
  const { startDate, endDate, disposition } = req.params;

  if (!startDate || !endDate) {
    return res
      .status(400)
      .json({ error: "Start date and end date are required" });
  }

  let query = `SELECT * FROM cdr WHERE cdrstarttime BETWEEN CONCAT(:startDate, ' 00:00:00') AND CONCAT(:endDate, ' 23:59:59')`;
  let replacements = { startDate, endDate };

  // Add disposition filter if provided
  if (disposition && disposition !== "all") {
    query += ` AND disposition = :disposition`;
    replacements.disposition = disposition;
  }

  query += ` ORDER BY cdrstarttime DESC`;

  const cdrQuery = sequelize.query(query, {
    replacements,
    type: sequelize.QueryTypes.SELECT,
  });

  cdrQuery
    .then((cdrData) => {
      if (cdrData.length === 0) {
        return res.status(404).json({ message: "No CDR records found" });
      }
      res.json(cdrData);
    })
    .catch((error) => {
      console.error("Error fetching CDR data:", error);
      res.status(500).json({ error: error.message });
    });
};

// Ticket CRM Report
exports.getTicketReport = async (req, res) => {
  const { startDate, endDate, status } = req.params;

  if (!startDate || !endDate) {
    return res
      .status(400)
      .json({ error: "Start date and end date are required" });
  }

  try {
    // Use raw SQL query to get ALL columns from Tickets table
    let query = `
      SELECT 
        t.*,
        u1.full_name as assigned_to_name,
        u1.email as assigned_to_email,
        u2.full_name as creator_name,
        u2.email as creator_email,
        u3.full_name as attended_by_name,
        u4.full_name as rated_by_name,
        u5.full_name as converted_by_name,
        u6.full_name as forwarded_by_name,
        u7.full_name as assigned_by_name
      FROM Tickets t
      LEFT JOIN Users u1 ON t.assigned_to_id = u1.id
      LEFT JOIN Users u2 ON t.created_by = u2.id
      LEFT JOIN Users u3 ON t.attended_by_id = u3.id
      LEFT JOIN Users u4 ON t.rated_by_id = u4.id
      LEFT JOIN Users u5 ON t.converted_by_id = u5.id
      LEFT JOIN Users u6 ON t.forwarded_by_id = u6.id
      LEFT JOIN Users u7 ON t.assigned_by = u7.id
      WHERE t.created_at BETWEEN :startDate AND :endDate
    `;

    const replacements = { startDate, endDate };

    if (status && status !== "all") {
      query += ` AND t.status = :status`;
      replacements.status = status;
    }

    query += ` ORDER BY t.created_at DESC`;

    const tickets = await sequelize.query(query, {
      replacements,
      type: sequelize.QueryTypes.SELECT,
    });

    // Return all ticket data with additional computed fields
    const formattedTickets = tickets.map((ticket) => {
      // Helper function to handle null, undefined, and empty strings
      const getValue = (val) =>
        val !== null && val !== undefined && val !== "" ? val : null;

      // Get name fields (handle null, undefined, and empty strings)
      const firstName = getValue(ticket.first_name);
      const middleName = getValue(ticket.middle_name);
      const lastName = getValue(ticket.last_name);
      const requester = getValue(ticket.requester);

      // Build full name if we have first and last name
      let fullName = null;
      if (firstName && lastName) {
        fullName = `${firstName}${
          middleName ? " " + middleName : ""
        } ${lastName}`.trim();
      } else if (requester) {
        fullName = requester;
      }

      // Build requester name (simpler version)
      const requesterName =
        firstName && lastName
          ? `${firstName} ${lastName}`.trim()
          : requester || "Unknown";

      const mappedTicket = {
        ...ticket, // Include all original ticket fields
        // Explicitly ensure name fields are available (preserve null/empty for display)
        first_name: firstName,
        middle_name: middleName,
        last_name: lastName,
        phone_number: getValue(ticket.phone_number),
        nida_number: getValue(ticket.nida_number),
      ticket_number:
        ticket.ticket_id ||
        `TKT-${ticket.id ? ticket.id.substring(0, 8) : "N/A"}`,
        requester_name: requesterName,
        full_name: fullName || requesterName,
      };
      return mappedTicket;
    });

    if (formattedTickets.length === 0) {
      return res.status(404).json({ message: "No tickets found" });
    }

    res.json(formattedTickets);
  } catch (error) {
    console.error("Error fetching ticket report:", error);
    res.status(500).json({ error: error.message });
  }
};

// Agent Performance Report
exports.getAgentPerformanceReport = async (req, res) => {
  const { startDate, endDate, agentId } = req.params;

  if (!startDate || !endDate) {
    return res
      .status(400)
      .json({ error: "Start date and end date are required" });
  }

  try {
    if (!CDR || !User) {
      throw new Error("Required models are not available");
    }

    // Get all agents if agentId is "all"
    let agents = [];
    if (agentId === "all") {
      agents = await User.findAll({
        where: {
          role: "agent",
        },
        attributes: ["id", "full_name", "extension"],
      });
    } else {
      const agent = await User.findByPk(agentId);
      if (agent) {
        agents = [agent];
      }
    }

    const performanceData = await Promise.all(
      agents.map(async (agent) => {
        // Get calls for this agent
        const calls = await sequelize.query(
          `SELECT * FROM cdr 
           WHERE src = :extension 
           AND cdrstarttime BETWEEN :startDate AND :endDate`,
          {
            replacements: {
              extension: agent.extension || "",
              startDate,
              endDate,
            },
            type: sequelize.QueryTypes.SELECT,
          }
        );

        const totalCalls = calls.length;
        const answeredCalls = calls.filter(
          (c) => c.disposition === "ANSWERED"
        ).length;
        const missedCalls = totalCalls - answeredCalls;
        const totalDuration = calls.reduce(
          (sum, c) => sum + (parseInt(c.duration) || 0),
          0
        );
        const avgDuration =
          answeredCalls > 0 ? Math.round(totalDuration / answeredCalls) : 0;
        const totalTalkTime = calls
          .filter((c) => c.disposition === "ANSWERED")
          .reduce((sum, c) => sum + (parseInt(c.billsec) || 0), 0);

        // Calculate FCR (First Call Resolution) - simplified
        const fcrRate =
          totalCalls > 0
            ? `${Math.round((answeredCalls / totalCalls) * 100)}%`
            : "0%";

        return {
          id: agent.id,
          agent_id: agent.id,
          agent_name: agent.full_name || "Unknown Agent",
          total_calls: totalCalls,
          answered_calls: answeredCalls,
          missed_calls: missedCalls,
          avg_duration: avgDuration,
          total_talk_time: totalTalkTime,
          fcr_rate: fcrRate,
        };
      })
    );

    if (performanceData.length === 0) {
      return res.status(404).json({ message: "No performance data found" });
    }

    res.json(performanceData);
  } catch (error) {
    console.error("Error fetching agent performance report:", error);
    res.status(500).json({ error: error.message });
  }
};

// Call Summary Report
exports.getCallSummaryReport = async (req, res) => {
  const { startDate, endDate } = req.params;

  if (!startDate || !endDate) {
    return res
      .status(400)
      .json({ error: "Start date and end date are required" });
  }

  try {
    if (!CDR) {
      throw new Error("CDR model is not available");
    }

    // Get daily summary
    const summaryQuery = `
      SELECT 
        DATE(cdrstarttime) as date,
        COUNT(*) as total_calls,
        SUM(CASE WHEN disposition = 'ANSWERED' THEN 1 ELSE 0 END) as answered,
        SUM(CASE WHEN disposition = 'NO ANSWER' THEN 1 ELSE 0 END) as no_answer,
        SUM(CASE WHEN disposition = 'BUSY' THEN 1 ELSE 0 END) as busy,
        SUM(duration) as total_duration,
        AVG(CASE WHEN disposition = 'ANSWERED' THEN duration ELSE NULL END) as avg_duration
      FROM cdr
      WHERE cdrstarttime BETWEEN :startDate AND :endDate
      GROUP BY DATE(cdrstarttime)
      ORDER BY date DESC
    `;

    const summaryData = await sequelize.query(summaryQuery, {
      replacements: { startDate, endDate },
      type: sequelize.QueryTypes.SELECT,
    });

    const formattedSummary = summaryData.map((row) => ({
      id: row.date,
      date: row.date,
      total_calls: parseInt(row.total_calls) || 0,
      answered: parseInt(row.answered) || 0,
      no_answer: parseInt(row.no_answer) || 0,
      busy: parseInt(row.busy) || 0,
      total_duration: parseInt(row.total_duration) || 0,
      avg_duration: Math.round(parseFloat(row.avg_duration) || 0),
    }));

    if (formattedSummary.length === 0) {
      return res.status(404).json({ message: "No call summary data found" });
    }


    

    res.json(formattedSummary);
  } catch (error) {
    console.error("Error fetching call summary report:", error);
    res.status(500).json({ error: error.message });
  }
};

// Ticket Assignments Report
exports.getTicketAssignmentsReport = async (req, res) => {
  const { startDate, endDate } = req.params;

  if (!startDate || !endDate) {
    return res
      .status(400)
      .json({ error: "Start date and end date are required" });
  }

  try {
    // Use raw SQL query to get ALL columns from Ticket_assignments table
    let query = `
      SELECT 
        ta.*,
        t.ticket_id as ticket_number,
        t.subject as ticket_subject,
        t.status as ticket_status,
        t.category as ticket_category,
        u1.full_name as assigned_by_name,
        u1.email as assigned_by_email,
        u2.full_name as assigned_to_name,
        u2.email as assigned_to_email
      FROM Ticket_assignments ta
      LEFT JOIN Tickets t ON ta.ticket_id = t.id
      LEFT JOIN Users u1 ON ta.assigned_by_id = u1.id
      LEFT JOIN Users u2 ON ta.assigned_to_id = u2.id
      WHERE ta.created_at BETWEEN :startDate AND :endDate
    `;

    const replacements = { startDate, endDate };

    query += ` ORDER BY ta.created_at DESC`;

    const assignments = await sequelize.query(query, {
      replacements,
      type: sequelize.QueryTypes.SELECT,
    });

    // Format the response
    const formattedAssignments = assignments.map((assignment) => ({
      ...assignment, // Include all original assignment fields
      ticket_number: assignment.ticket_number || "-",
      ticket_subject: assignment.ticket_subject || "-",
      ticket_status: assignment.ticket_status || "-",
      ticket_category: assignment.ticket_category || "-",
    }));

    if (formattedAssignments.length === 0) {
      return res.status(404).json({ message: "No ticket assignments found" });
    }

    res.json(formattedAssignments);
  } catch (error) {
    console.error("Error fetching ticket assignments report:", error);
    res.status(500).json({ error: error.message });
  }
};

if (typeof offHoursReportController.getOffHoursReport === "function") {
  exports.getOffHoursReport = offHoursReportController.getOffHoursReport;
} else {
  exports.getOffHoursReport = async (req, res) => {
    res.status(503).json({
      error:
        "Off-hours report is not available. Deploy offHoursReport.controller.js and utils/offHoursReportHelper.js.",
    });
  };
}

exports.getNotificationsReport = async (req, res) => {
  const { startDate, endDate } = req.params;

  if (!startDate || !endDate) {
    return res
      .status(400)
      .json({ error: "Start date and end date are required" });
  }

  try {
    // Use raw SQL query to get ALL notifications with related data
    let query = `
      SELECT 
        n.id,
        n.ticket_id,
        n.sender_id,
        n.recipient_id,
        n.message,
        n.channel,
        n.status,
        n.comment,
        n.created_at,
        n.updated_at,
        t.ticket_id as ticket_number,
        t.subject as ticket_subject,
        t.category as ticket_category,
        t.status as ticket_status,
        t.description as ticket_description,
        u1.full_name as sender_name,
        u1.email as sender_email,
        u2.full_name as recipient_name,
        u2.email as recipient_email
      FROM Notifications n
      LEFT JOIN Tickets t ON n.ticket_id = t.id
      LEFT JOIN Users u1 ON n.sender_id = u1.id
      LEFT JOIN Users u2 ON n.recipient_id = u2.id
      WHERE n.created_at BETWEEN :startDate AND :endDate
    `;

    const replacements = { 
      startDate: `${startDate} 00:00:00`,
      endDate: `${endDate} 23:59:59`
    };

    query += ` ORDER BY n.created_at DESC`;

    const notifications = await sequelize.query(query, {
      replacements,
      type: sequelize.QueryTypes.SELECT,
    });

    // Format the response
    const formattedNotifications = notifications.map((notification) => ({
      id: notification.id,
      ticket_id: notification.ticket_id,
      sender_id: notification.sender_id,
      recipient_id: notification.recipient_id,
      message: notification.message,
      channel: notification.channel,
      status: notification.status,
      comment: notification.comment,
      created_at: notification.created_at,
      updated_at: notification.updated_at,
      ticket: notification.ticket_id ? {
        id: notification.ticket_id,
        ticket_id: notification.ticket_number,
        subject: notification.ticket_subject,
        category: notification.ticket_category,
        status: notification.ticket_status,
        description: notification.ticket_description,
      } : null,
      sender: notification.sender_id ? {
        id: notification.sender_id,
        full_name: notification.sender_name,
        email: notification.sender_email,
      } : null,
      recipient: notification.recipient_id ? {
        id: notification.recipient_id,
        full_name: notification.recipient_name,
        email: notification.recipient_email,
      } : null,
    }));

    if (formattedNotifications.length === 0) {
      return res.status(404).json({ message: "No notifications found" });
    }

    res.json(formattedNotifications);
  } catch (error) {
    console.error("Error fetching notifications report:", error);
    res.status(500).json({ error: error.message });
  }
};

// Escalation Report
exports.getEscalationReport = async (req, res) => {
  const { startDate, endDate } = req.params;

  if (!startDate || !endDate) {
    return res
      .status(400)
      .json({ error: "Start date and end date are required" });
  }

  try {
    // Use raw SQL query to get escalated tickets with related data
    // Escalated tickets can be identified by:
    // 1. Tickets with status = 'Escalated'
    // 2. Tickets with is_escalated = true
    // 3. Tickets that have TicketAssignment records with action = 'Escalated'
    let query = `
      SELECT DISTINCT
        t.*,
        t.ticket_id as ticket_number,
        u1.full_name as assigned_to_name,
        u1.email as assigned_to_email,
        u2.full_name as creator_name,
        u2.email as creator_email,
        u3.full_name as attended_by_name,
        u4.full_name as rated_by_name,
        ta_escalated.id as escalation_assignment_id,
        ta_escalated.created_at as escalated_at,
        ta_escalated.reason as escalation_reason,
        ta_escalated.assigned_to_id as escalated_to_id,
        u5.full_name as escalated_to_name,
        u5.email as escalated_to_email
      FROM Tickets t
      LEFT JOIN Users u1 ON t.assigned_to_id = u1.id
      LEFT JOIN Users u2 ON t.created_by = u2.id
      LEFT JOIN Users u3 ON t.attended_by_id = u3.id
      LEFT JOIN Users u4 ON t.rated_by_id = u4.id
      LEFT JOIN Ticket_assignments ta_escalated ON t.id = ta_escalated.ticket_id 
        AND ta_escalated.action = 'Escalated'
        AND ta_escalated.created_at = (
          SELECT MAX(created_at) 
          FROM Ticket_assignments 
          WHERE ticket_id = t.id AND action = 'Escalated'
        )
      LEFT JOIN Users u5 ON ta_escalated.assigned_to_id = u5.id
      WHERE (
        t.status = 'Escalated' 
        OR t.is_escalated = 1
        OR EXISTS (
          SELECT 1 
          FROM Ticket_assignments ta 
          WHERE ta.ticket_id = t.id 
          AND ta.action = 'Escalated'
        )
      )
      AND (
        t.created_at BETWEEN :startDate AND :endDate
        OR ta_escalated.created_at BETWEEN :startDate AND :endDate
      )
    `;

    const replacements = { 
      startDate: `${startDate} 00:00:00`,
      endDate: `${endDate} 23:59:59`
    };

    query += ` ORDER BY COALESCE(ta_escalated.created_at, t.created_at) DESC`;

    const escalatedTickets = await sequelize.query(query, {
      replacements,
      type: sequelize.QueryTypes.SELECT,
    });

    // Format the response
    const formattedEscalations = escalatedTickets.map((ticket) => ({
      id: ticket.id,
      ticket_id: ticket.ticket_number || ticket.ticket_id,
      subject: ticket.subject,
      status: ticket.status,
      category: ticket.category,
      description: ticket.description,
      complaint_type: ticket.complaint_type,
      priority: ticket.priority,
      created_at: ticket.created_at,
      updated_at: ticket.updated_at,
      escalated_at: ticket.escalated_at || ticket.updated_at,
      escalation_reason: ticket.escalation_reason,
      is_escalated: ticket.is_escalated,
      assigned_to_id: ticket.assigned_to_id,
      assigned_to_name: ticket.assigned_to_name,
      assigned_to_email: ticket.assigned_to_email,
      escalated_to_id: ticket.escalated_to_id,
      escalated_to_name: ticket.escalated_to_name,
      escalated_to_email: ticket.escalated_to_email,
      creator_name: ticket.creator_name,
      creator_email: ticket.creator_email,
      attended_by_name: ticket.attended_by_name,
      rated_by_name: ticket.rated_by_name,
      // Include all other ticket fields
      ...ticket,
    }));

    if (formattedEscalations.length === 0) {
      return res.status(404).json({ message: "No escalated tickets found" });
    }

    res.json(formattedEscalations); 
  } catch (error) {
    console.error("Error fetching escalation report:", error);
    res.status(500).json({ error: error.message });
  }
};

/** Call-center SLA report (inline fallback if slaReport.controller.js missing on server) */
async function getSlaReportHandler(req, res) {
  const { startDate, endDate } = req.params;

  if (!startDate || !endDate) {
    return res
      .status(400)
      .json({ error: "Start date and end date are required" });
  }

  try {
    const [summaryRow] = await sequelize.query(
      `
      SELECT ${SLA_AGGREGATE_SELECT}
      FROM cdr
      WHERE cdrstarttime BETWEEN :startDate AND :endDate
      `,
      {
        replacements: {
          startDate: `${startDate} 00:00:00`,
          endDate: `${endDate} 23:59:59`,
        },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    const dailyRows = await sequelize.query(
      `
      SELECT
        DATE(cdrstarttime) AS date,
        ${SLA_AGGREGATE_SELECT}
      FROM cdr
      WHERE cdrstarttime BETWEEN :startDate AND :endDate
      GROUP BY DATE(cdrstarttime)
      ORDER BY date ASC
      `,
      {
        replacements: {
          startDate: `${startDate} 00:00:00`,
          endDate: `${endDate} 23:59:59`,
        },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    const summary = buildSlaMetricsFromRow(summaryRow);
    const daily = dailyRows.map((row) =>
      buildSlaMetricsFromRow(row, row.date)
    );

    res.json({ summary, daily });
  } catch (error) {
    console.error("Error fetching SLA report:", error);
    res.status(500).json({ error: error.message });
  }
}

/** Ticket SLA report (inline fallback) */
async function getTicketSlaReportHandler(req, res) {
  const { startDate, endDate } = req.params;
  const statusFilter = (req.query.status || "all").toLowerCase();

  if (!startDate || !endDate) {
    return res
      .status(400)
      .json({ error: "Start date and end date are required" });
  }

  try {
    const tickets = await sequelize.query(
      `
      SELECT
        t.*,
        u1.full_name AS assigned_to_name,
        u2.full_name AS creator_name
      FROM Tickets t
      LEFT JOIN Users u1 ON t.assigned_to_id = u1.id
      LEFT JOIN Users u2 ON t.created_by = u2.id
      WHERE t.created_at BETWEEN :startDate AND :endDate
      ORDER BY t.created_at DESC
      `,
      {
        replacements: {
          startDate: `${startDate} 00:00:00`,
          endDate: `${endDate} 23:59:59`,
        },
        type: sequelize.QueryTypes.SELECT,
      }
    );

    const summary = {
      total: 0,
      onTime: 0,
      approaching: 0,
      overdue: 0,
      noSla: 0,
      unknown: 0,
    };

    const rows = tickets.map((ticket) => {
      const compliance = checkSLACompliance(ticket);
      const slaStatus = compliance?.status || "Unknown";
      const slaDetails = compliance?.details || "";
      const slaSeverity = compliance?.severity || null;

      switch (slaStatus) {
        case "On Time":
          summary.onTime += 1;
          break;
        case "Approaching Deadline":
          summary.approaching += 1;
          break;
        case "Overdue":
          summary.overdue += 1;
          break;
        case "No SLA":
          summary.noSla += 1;
          break;
        default:
          summary.unknown += 1;
      }
      summary.total += 1;

      return {
        id: ticket.id,
        ticket_id: ticket.ticket_id || ticket.id,
        subject: ticket.subject || "-",
        status: ticket.status || "-",
        workflow_current_role: ticket.workflow_current_role || "-",
        assigned_to_name: ticket.assigned_to_name || "-",
        created_at: ticket.created_at,
        sla_status: slaStatus,
        sla_details: slaDetails,
        sla_severity: slaSeverity,
      };
    });

    const statusMap = {
      overdue: "Overdue",
      approaching: "Approaching Deadline",
      "on-time": "On Time",
      ontime: "On Time",
      "no-sla": "No SLA",
    };

    const filterLabel = statusMap[statusFilter];
    const filtered =
      filterLabel && statusFilter !== "all"
        ? rows.filter((r) => r.sla_status === filterLabel)
        : rows;

    res.json({ summary, tickets: filtered });
  } catch (error) {
    console.error("Error fetching ticket SLA report:", error);
    res.status(500).json({ error: error.message });
  }
}

exports.getSlaReport =
  slaReportController.getSlaReport || getSlaReportHandler;
exports.getTicketSlaReport =
  slaReportController.getTicketSlaReport || getTicketSlaReportHandler;

let ticketWorkflowTatReportController = {};
try {
  ticketWorkflowTatReportController = require("./ticketWorkflowTatReport.controller");
} catch (err) {
  console.warn(
    "[reports.controller] ticketWorkflowTatReport.controller:",
    err.message
  );
}
exports.getTicketWorkflowTatReport =
  ticketWorkflowTatReportController.getTicketWorkflowTatReport;
