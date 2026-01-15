// const VoiceNote = require('../../models/voice_notes.model');
// const CDR = require('../../models/cdr.model');
// const IVRDTMFMapping = require('../../models/ivr_dtmf_mappings.model');
// const {IVRAction, IVRVoice } = require('../../models');

// exports.getVoiceNotes = async (req, res) => {
//   try {
//     const voiceNotes = await VoiceNote.findAll();
//     res.json(voiceNotes);
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// };

// exports.getCDRReports = async (req, res) => {
//   console.log("CDR REPORT API HIT"); // Add this
//   try {
//     const cdrReports = await CDR.findAll();
//     console.log("CDR fetched successfully:", cdrReports.length);
//     res.json(cdrReports);
//   } catch (error) {
//     console.error("CDR REPORT ERROR:", error); // Add this
//     res.status(500).json({ error: error.message });
//   }
// };

// exports.getIVRInteractions = async (req, res) => {
//   try {
//     const ivrInteractions = await IVRDTMFMapping.findAll({
//       include: [
//         {
//           model: IVRAction, // Include action details
//           attributes: ['name'], // Only get the 'name' attribute
//           as: 'action', // Specify the alias 'action' if it was set in the association
//         },
//         {
//           model: IVRVoice, // Include voice details
//           attributes: ['file_name'], // Only get the 'file_name' attribute
//           as: 'voice', // Specify the alias 'voice' if it was set in the association
//         },
//       ],
//     });
//     res.json(ivrInteractions);
//   } catch (error) {
//     console.error("Error fetching IVR Interactions:", error);
//     res.status(500).json({ error: error.message });
//   }
// };

// Safely require models with error handling
let VoiceNote,
  CDR,
  IVRDTMFMapping,
  IVRAction,
  IVRVoice,
  Ticket,
  User,
  IVRDTMFLog;
try {
  console.log("Loading VoiceNote model...");
  VoiceNote = require("../../models/voice_notes.model");
  console.log("Loading CDR model...");
  CDR = require("../../models/cdr.model");
  console.log("Loading IVRDTMFMapping model...");
  IVRDTMFMapping = require("../../models/ivr_dtmf_mappings.model");
  console.log("Loading Ticket model...");
  Ticket = require("../../models/Ticket");
  console.log("Loading User model...");
  User = require("../../models/User");
  console.log("Loading models index...");
  let models;
  try {
    models = require("../../models");
    console.log("Models loaded, available keys:", Object.keys(models || {}));
    // Safely get IVRAction, IVRVoice, and IVRDTMFLog with fallback
    if (models) {
      IVRAction = models.IVRAction;
      IVRVoice = models.IVRVoice;
      IVRDTMFLog = models.IVRDTMFLog;
    }
  } catch (modelsError) {
    console.error(
      "Error loading models index, trying direct require:",
      modelsError.message
    );
  }

  // Fallback: try direct require if models index failed
  if (!IVRAction) {
    try {
      IVRAction = require("../../models/IVRAction");
    } catch (e) {
      console.error("Failed to load IVRAction:", e.message);
    }
  }
  if (!IVRVoice) {
    try {
      IVRVoice = require("../../models/IVRVoice");
    } catch (e) {
      console.error("Failed to load IVRVoice:", e.message);
    }
  }
  if (!IVRDTMFLog) {
    try {
      const DataTypes = require("sequelize").DataTypes;
      IVRDTMFLog = require("../../models/IVRDTMFLog")(sequelize, DataTypes);
    } catch (e) {
      console.error("Failed to load IVRDTMFLog:", e.message);
    }
  }
  console.log("Model loading complete");
} catch (error) {
  console.error("Error loading models in reports controller:", error);
  console.error("Error stack:", error.stack);
  // Models will be undefined, but we'll handle this in the functions
}

const path = require("path");
const fs = require("fs");
const sequelize = require("../../config/mysql_connection"); // Adjust the path as necessary
const { Op } = require("sequelize");

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
      return res.status(404).send("Voice note not found in database");
    }

    const filePath = path.resolve(voiceNote.recording_path);

    if (!fs.existsSync(filePath)) {
      return res.status(404).send("Voice file not found on disk");
    }

    res.sendFile(filePath, { headers: { "Content-Type": "audio/wav" } });
  } catch (error) {
    console.error("Error streaming voice note:", error);
    res.status(500).send("Internal server error");
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
    console.log("IVR Interactions route hit - Params:", req.params);
    console.log("IVR Interactions route hit - Query:", req.query);

    const { startDate, endDate } = req.params;

    // Try to load IVRDTMFLog model from models index
    let IVRDTMFLogModel;
    try {
      const models = require("../../models");
      IVRDTMFLogModel = models.IVRDTMFLog;
      if (!IVRDTMFLogModel) {
        // Fallback: load directly
        const DataTypes = require("sequelize").DataTypes;
        IVRDTMFLogModel = require("../../models/IVRDTMFLog")(
          sequelize,
          DataTypes
        );
      }
    } catch (modelLoadError) {
      console.error("Error loading IVRDTMFLog model:", modelLoadError);
    }

    let ivrLogs = [];
    const whereClause = {};

    // Add date filtering if provided
    const start = startDate || req.query.startDate;
    const end = endDate || req.query.endDate;

    if (start && end) {
      const startDateTime = start.includes(" ") ? start : `${start} 00:00:00`;
      const endDateTime = end.includes(" ") ? end : `${end} 23:59:59`;
      whereClause.timestamp = {
        [Op.between]: [new Date(startDateTime), new Date(endDateTime)],
      };
    }

    // Try using the model first
    if (IVRDTMFLogModel) {
      try {
        console.log("Attempting to use IVRDTMFLog model...");
        ivrLogs = await IVRDTMFLogModel.findAll({
          where: Object.keys(whereClause).length > 0 ? whereClause : undefined,
          order: [["timestamp", "DESC"]],
          limit: 1000,
          raw: true, // Get plain objects instead of model instances
        });
        console.log(`Found ${ivrLogs.length} IVR log records using model`);
      } catch (modelError) {
        console.error(
          "Error using model, falling back to raw query:",
          modelError
        );
        // Fall through to raw query
      }
    }

    // Fallback to raw SQL query if model fails or doesn't exist
    if (!IVRDTMFLogModel || ivrLogs.length === 0) {
      console.log("Using raw SQL query...");
      let query = `SELECT * FROM IVR_DTMF_Logs`;
      const replacements = {};

      if (start && end) {
        const startDateTime = start.includes(" ") ? start : `${start} 00:00:00`;
        const endDateTime = end.includes(" ") ? end : `${end} 23:59:59`;
        query += ` WHERE timestamp BETWEEN :startDate AND :endDate`;
        replacements.startDate = startDateTime;
        replacements.endDate = endDateTime;
      }

      query += ` ORDER BY timestamp DESC LIMIT 1000`;

      console.log("Executing query:", query);
      console.log("With replacements:", replacements);

      try {
        ivrLogs = await sequelize.query(query, {
          replacements,
          type: sequelize.QueryTypes.SELECT,
        });
        console.log(`Found ${ivrLogs.length} IVR log records using raw query`);
      } catch (queryError) {
        console.error("Raw query also failed:", queryError);
        throw queryError;
      }
    }

    // Format the response to match expected structure
    const formattedLogs = ivrLogs.map((log) => {
      return {
        id: log.id || log.ID || null,
        caller_id: log.caller_id || log.caller_ID || "-",
        digit_pressed: log.digit_pressed || log.digit_Pressed || "-",
        menu_context: log.menu_context || log.menu_Context || "-",
        language: log.language || "-",
        timestamp: log.timestamp || log.Timestamp || null,
      };
    });

    console.log(`Returning ${formattedLogs.length} formatted log records`);
    res.json(formattedLogs);
  } catch (error) {
    console.error("Error in getIVRInteractions:", error);
    console.error("Error stack:", error.stack);
    res.status(500).json({
      error: error.message,
      details: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
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
    `SELECT * FROM Voice_Notes WHERE created_at BETWEEN :startDate AND :endDate`,
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

  let query = `SELECT * FROM cdr WHERE cdrstarttime BETWEEN :startDate AND :endDate`;
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
