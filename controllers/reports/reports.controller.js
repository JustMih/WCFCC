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
let VoiceNote, CDR, IVRDTMFMapping, IVRAction, IVRVoice, Ticket, User;
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
    // Safely get IVRAction and IVRVoice with fallback
    if (models) {
      IVRAction = models.IVRAction;
      IVRVoice = models.IVRVoice;
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

exports.getIVRInteractions = async (req, res) => {
  try {
    if (!IVRDTMFMapping || !IVRAction || !IVRVoice) {
      throw new Error("IVR models are not available");
    }
    const ivrInteractions = await IVRDTMFMapping.findAll({
      include: [
        { model: IVRAction, attributes: ["name"], as: "action" },
        { model: IVRVoice, attributes: ["file_name"], as: "voice" },
      ],
    });
    res.json(ivrInteractions);
  } catch (error) {
    console.error("Error in getIVRInteractions:", error);
    res.status(500).json({ error: error.message });
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
    // Use raw SQL query for better compatibility
    let query = `
      SELECT 
        t.id,
        t.ticket_id,
        t.subject,
        t.status,
        t.category,
        t.complaint_type,
        t.first_name,
        t.last_name,
        t.created_at,
        t.date_of_resolution,
        t.assigned_to_id,
        u1.full_name as assigned_to_name,
        u2.full_name as creator_name
      FROM Tickets t
      LEFT JOIN Users u1 ON t.assigned_to_id = u1.id
      LEFT JOIN Users u2 ON t.created_by = u2.id
      WHERE t.created_at BETWEEN :startDate AND :endDate
    `;

    const replacements = { startDate, endDate };

    if (status && status !== "all") {
      query += ` AND t.status = :status`;
      replacements.status = status;
    }

    // Note: Priority filter removed as Tickets table doesn't have a priority column
    // Using complaint_type or category instead

    query += ` ORDER BY t.created_at DESC`;

    const tickets = await sequelize.query(query, {
      replacements,
      type: sequelize.QueryTypes.SELECT,
    });

    // Format the response
    const formattedTickets = tickets.map((ticket) => ({
      id: ticket.id,
      ticket_number:
        ticket.ticket_id ||
        `TKT-${ticket.id ? ticket.id.substring(0, 8) : "N/A"}`,
      subject: ticket.subject || "No Subject",
      status: ticket.status || "Open",
      priority: ticket.complaint_type || ticket.category || "N/A", // Use complaint_type or category as priority
      category: ticket.category || "N/A",
      complaint_type: ticket.complaint_type || null,
      requester_name:
        ticket.first_name && ticket.last_name
          ? `${ticket.first_name} ${ticket.last_name}`.trim()
          : "Unknown",
      assigned_to_name: ticket.assigned_to_name || "Unassigned",
      created_at: ticket.created_at,
      resolved_at: ticket.date_of_resolution || null,
    }));

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
