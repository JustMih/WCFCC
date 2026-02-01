const Ticket = require("../../models/Ticket");
const User = require("../../models/User");
const FunctionData = require("../../models/FunctionData");
const Function = require("../../models/Function");
const Section = require("../../models/Section");
const Notification = require("../../models/Notification");
const AgentLoginLog = require("../../models/agent_activity_logs");
const ChatMassage = require("../../models/chart_message");
const bcrypt = require("bcryptjs");
const { validationResult } = require("express-validator");
const { Op, Sequelize } = require("sequelize");
const { sendQuickSms } = require("../../services/smsService");
const { sendEmail, sendEmailNonBlocking, renderEmailCard } = require("../../services/emailService");
const RequesterDetails = require("../../models/RequesterDetails");
const Employer = require("../../models/Employer");
const TicketAssignment = require("../../models/TicketAssignment");
const AssignedOfficer = require("../../models/AssignedOfficer");
const TicketUpdate = require("../../models/TicketUpdate");
const TicketClarification = require("../../models/TicketClarification");
const { calculateAssignmentsAging, getAgingStatus, formatAging } = require('../../utils/agingCalculator');
const workflowService = require("../../services/workflowCommunicationService");

/**
 * Helper function to get attachments array from ticket
 * @param {Object} ticket - Ticket object
 * @returns {Array} Array of attachment paths (empty if no attachments)
 */
const getTicketAttachments = (ticket) => {
  if (!ticket) return [];
  const attachmentPath = ticket.attachment_path || ticket.attachmentPath;
  return attachmentPath ? [attachmentPath] : [];
};

// Utility: Calculate working days between two dates, excluding weekends and optional holidays
/**
 * Calculate the number of working days (Mon-Fri) between two dates, excluding optional holidays.
 * @param {Date|string} startDate - The start date (inclusive)
 * @param {Date|string} endDate - The end date (inclusive)
 * @param {string[]} holidays - Array of holiday dates in 'YYYY-MM-DD' format (optional)
 * @returns {number} Number of working days
 */
function getWorkingDays(startDate, endDate, holidays = []) {
  let count = 0;
  let current = new Date(startDate);
  const end = new Date(endDate);
  const holidaySet = new Set(
    (holidays || []).map((h) => new Date(h).toDateString())
  );
  while (current <= end) {
    const day = current.getDay();
    const isWeekend = day === 0 || day === 6;
    const isHoliday = holidaySet.has(current.toDateString());
    if (!isWeekend && !isHoliday) count++;
    current.setDate(current.getDate() + 1);
  }
  return count;
}

// Utility: Capitalize first letter of each word
/**
 * Capitalizes the first letter of each word in a string.
 * @param {string} str - The string to capitalize
 * @returns {string} The capitalized string, or empty string if input is null/undefined/empty
 */
function capitalizeWords(str) {
  if (!str || typeof str !== 'string') return str || '';
  return str
    .trim()
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

// SLA rules mapping
const SLA_RULES = {
  inquiry: 3, // days
  complaint_minor: 7, // total days for minor complaint (adjust as needed)
  complaint_major: 15, // total days for major complaint (adjust as needed)
};

/**
 * Checks if a ticket has breached its SLA based on working days since created_at.
 * @param {Object} ticket - The ticket object (must have category, complaint_type, created_at)
 * @param {string[]} holidays - Array of holiday dates in 'YYYY-MM-DD' format (optional)
 * @returns {Object} { workingDays, slaDays, breached }
 */
function checkTicketSlaBreach(ticket, holidays = []) {
  if (!ticket || !ticket.created_at)
    return { workingDays: 0, slaDays: 0, breached: false };

  // Determine SLA days
  let slaDays = 0;
  if (ticket.category === "Inquiry") {
    slaDays = SLA_RULES.inquiry;
  } else if (ticket.category === "Complaint") {
    const type =
      ticket.complaint_type === "major" ? "complaint_major" : "complaint_minor";
    slaDays = SLA_RULES[type];
  }

  // Calculate working days since created_at
  const workingDays = getWorkingDays(ticket.created_at, new Date(), holidays);

  // Check if breached
  const breached = workingDays > slaDays;

  return { workingDays, slaDays, breached };
}

/**
 * Escalate and update ticket if SLA is breached (per-role SLA logic).
 * @param {Object} ticket - The ticket object (must have id, category, complaint_type, created_at, assigned_to_id, assigned_to_role, unit_section)
 * @param {string[]} holidays - Array of holiday dates in 'YYYY-MM-DD' format (optional)
 * @returns {Promise<boolean>} true if escalated, false otherwise
 */
async function escalateAndUpdateTicketOnSlaBreach(ticket, holidays = []) {
  // Per-role SLA days
  const SLA_ROLE_DAYS = {
    reviewer: 2,
    attendee: { minor: 3, major: 10 },
    "head-of-unit": 1,
    manager: 1,
    director: 1,
    "director-general": 1,
    "super-admin": { minor: 3, major: 10 },
  };
  function getSlaDaysForRole(role, complaintType) {
    if (role === "attendee") {
      return SLA_ROLE_DAYS.attendee[complaintType] || 3;
    }
    if (role === "super-admin") {
      return SLA_ROLE_DAYS["super-admin"][complaintType] || 3;
    }
    return SLA_ROLE_DAYS[role] || 1;
  }

  // Get latest assignment for this ticket
  const lastAssignment = await TicketAssignment.findOne({
    where: { ticket_id: ticket.id },
    order: [["created_at", "DESC"]],
  });
  if (!lastAssignment) return false;
  const assignedAt = lastAssignment.created_at;
  const currentRole = (lastAssignment.assigned_to_role || "").toLowerCase();
  const complaintType = (ticket.complaint_type || "").toLowerCase();

  // Determine SLA days for this role
  let slaDays = 0;
  if (ticket.category === "Inquiry") {
    slaDays = 3; // Inquiries: 3 days
  } else if (ticket.category === "Complaint") {
    slaDays = getSlaDaysForRole(currentRole, complaintType);
  } else {
    return false; // Not applicable
  }

  // Calculate working days since assigned to this role
  const workingDays = getWorkingDays(assignedAt, new Date(), holidays);

  // Debug log for escalation decision
  console.log("Escalation debug:", {
    ticketId: ticket.id,
    category: ticket.category,
    complaint_type: ticket.complaint_type,
    currentRole,
    assignedAt,
    slaDays,
    workingDays,
    breached: workingDays > slaDays,
  });

  // Check if breached
  const breached = workingDays > slaDays;
  if (!breached) return false;

  // Determine if ticket is for directorate or unit
  const isTicketDirectorate = ticket.section && ticket.section.toLowerCase().includes("directorate");
  const isTicketUnit = ticket.section && ticket.section.toLowerCase() === "unit";

  // Check if current role is one that needs special escalation handling
  const isEntryLevelRole = ["attendee", "super-admin", "focal-person", "supervisor", "reviewer"].includes(currentRole);

  // Determine escalation path based on ticket type and current role
  let nextRole;
  
  if (isEntryLevelRole) {
    // For attendee, super-admin, focal-person, supervisor, reviewer
    if (isTicketDirectorate) {
      // Directorate path: attendee/super-admin/focal-person/supervisor/reviewer → manager → director → director-general
      if (currentRole === "attendee" || currentRole === "super-admin" || 
          currentRole === "focal-person" || currentRole === "supervisor" || currentRole === "reviewer") {
        nextRole = "manager";
      } else if (currentRole === "manager") {
        nextRole = "director";
      } else if (currentRole === "director") {
        nextRole = "director-general";
      } else {
        return false; // Already at top
      }
    } else if (isTicketUnit) {
      // Unit path: head-of-unit (of that unit) → director-general
      if (currentRole === "attendee" || currentRole === "super-admin" || 
          currentRole === "focal-person" || currentRole === "supervisor" || currentRole === "reviewer") {
        nextRole = "head-of-unit";
      } else if (currentRole === "head-of-unit") {
        nextRole = "director-general";
      } else {
        return false; // Already at top
      }
    } else {
      // Fallback: use old logic for other cases
      const ESCALATION_PATH = {
        inquiry: [
          "reviewer",
          "head-of-unit",
          "director-general",
        ],
        complaint_minor: ["reviewer", "head-of-unit", "director-general"],
        complaint_major: [
          "reviewer",
          "head-of-unit",
          "director-general",
        ],
      };
      let path;
      if (ticket.category === "Inquiry") path = ESCALATION_PATH.inquiry;
      else if (ticket.category === "Complaint" && complaintType === "major")
        path = ESCALATION_PATH.complaint_major;
      else if (ticket.category === "Complaint")
        path = ESCALATION_PATH.complaint_minor;
      else return false;

      const idx = path.indexOf(currentRole);
      if (idx === -1 || idx === path.length - 1) return false;
      nextRole = path[idx + 1];
    }
  } else {
    // For other roles (reviewer, head-of-unit, manager, director, etc.)
    // Use standard escalation paths
    const ESCALATION_PATH = {
      inquiry: [
        "reviewer",
        "head-of-unit",
        "director-general",
      ],
      complaint_minor: ["reviewer", "head-of-unit", "director-general"],
      complaint_major: [
        "reviewer",
        "head-of-unit",
        "director-general",
      ],
    };
    let path;
    if (ticket.category === "Inquiry") path = ESCALATION_PATH.inquiry;
    else if (ticket.category === "Complaint" && complaintType === "major")
      path = ESCALATION_PATH.complaint_major;
    else if (ticket.category === "Complaint")
      path = ESCALATION_PATH.complaint_minor;
    else return false;

    const idx = path.indexOf(currentRole);
    if (idx === -1 || idx === path.length - 1) return false;
    nextRole = path[idx + 1];
  }

  // Find next user in same unit_section or sub_section
  let sectionValue;
  
  if (isTicketDirectorate) {
    // For directorate: use section to match user's unit_section
    sectionValue = ticket.section;
  } else if (isTicketUnit) {
    // For unit: use sub_section to match user's unit_section
    sectionValue = ticket.sub_section;
  } else {
    // Fallback: use unit_section
    sectionValue = ticket.unit_section;
  }
  
  const userWhere = { role: nextRole };
  if (sectionValue) {
    // Both directorate and unit match by unit_section in users table
    userWhere.unit_section = sectionValue;
  }
  let nextUser = await User.findOne({ where: userWhere });
  if (!nextUser) {
    // Fallback: if no user found with role and section, escalate to supervisor
    console.warn(
      `No user found for role '${nextRole}' with section '${sectionValue}'. Escalating to supervisor instead.`
    );
    nextUser = await User.findOne({ where: { role: "supervisor" } });
    if (!nextUser) {
      console.error(
        `Escalation failed: No supervisor found. Cannot escalate ticket ${ticket.id}.`
      );
      return false;
    }
    // Update nextRole to supervisor for assignment
    nextRole = "supervisor";
  }

  // Update ticket assignment
  await Ticket.update(
    {
      assigned_to_id: nextUser.id,
      assigned_to_role: nextRole,
      status: "Assigned", // Set to 'Assigned' so new assignee sees it as new
      is_escalated: true,
    },
    { where: { id: ticket.id } }
  );

  // Find system user for assigned_by_id
  const systemUser = await User.findOne({ where: { username: "system" } });

  // Record escalation in assignment history
  await TicketAssignment.create({
    ticket_id: ticket.id,
    assigned_by_id: systemUser ? systemUser.id : (ticket.assigned_to_id || nextUser.id), // Fallback to nextUser.id if both are null
    assigned_to_id: nextUser.id,
    assigned_to_role: nextRole,
    action: "Escalated",
    reason: `SLA breached for role '${currentRole}' after ${workingDays} working days (SLA: ${slaDays} days). Escalated automatically to ${nextRole}.`,
    created_at: new Date(),
  });

  // Send email notifications to previous and new assignee
  const previousAssignee = await User.findOne({
    where: { id: lastAssignment.assigned_to_id },
  });
  if (previousAssignee && previousAssignee.email) {
    setImmediate(() => {
      const emailSubject = `Ticket Escalated: ${ticket.ticket_id || ticket.id}`;
      const bodyHtml = `<p>Dear ${previousAssignee.full_name},</p><p>The ticket has been escalated from your queue to ${nextUser.full_name} (${nextRole}) due to SLA breach.</p>`;
      const detailsHtml = `
        <ul>
          <li><strong>Ticket ID:</strong> ${ticket.ticket_id || ticket.id}</li>
          <li><strong>Subject:</strong> ${ticket.subject || 'N/A'}</li>
          <li><strong>Category:</strong> ${ticket.category || 'N/A'}</li>
          <li><strong>Requester:</strong> ${getRequesterDisplayName(ticket)}</li>
          <li><strong>Escalated To:</strong> ${nextUser.full_name} (${nextRole})</li>
          <li><strong>Reason:</strong> SLA breach</li>
        </ul>
      `;
      const emailHtmlBody = renderEmailCard(emailSubject, bodyHtml, detailsHtml);
      
      const attachments = getTicketAttachments(ticket);
      sendEmail({
        // to: [previousAssignee.email, "grace.tarimo@wcf.go.tz"],
        to:`grace.tarimo@wcf.go.tz`,
        subject: emailSubject,
        htmlBody: emailHtmlBody,
        attachments: attachments,
      }).catch((e) =>
        console.error("Error sending escalation email:", e.message)
      );
    });
  }
  if (nextUser && nextUser.email) {
    setImmediate(() => {
      const emailSubject = `New Escalated Ticket Assigned: ${ticket.ticket_id || ticket.id}`;
      const bodyHtml = `<p>Dear ${nextUser.full_name},</p><p>A ticket has been escalated to you for action. Please review and resolve as soon as possible.</p>`;
      const detailsHtml = `
        <ul>
          <li><strong>Ticket ID:</strong> ${ticket.ticket_id || ticket.id}</li>
          <li><strong>Subject:</strong> ${ticket.subject || 'N/A'}</li>
          <li><strong>Category:</strong> ${ticket.category || 'N/A'}</li>
          <li><strong>Description:</strong> ${ticket.description || 'N/A'}</li>
          <li><strong>Requester:</strong> ${getRequesterDisplayName(ticket)}</li>
          <li><strong>Escalated To:</strong> ${nextUser.full_name} (${nextRole})</li>
          <li><strong>Reason:</strong> SLA breach - Ticket escalated due to SLA time limit exceeded</li>
          <li><strong>Section/Unit:</strong> ${ticket.section || 'N/A'}</li>
          <li><strong>Sub-section:</strong> ${ticket.sub_section || 'N/A'}</li>
          <li><strong>Channel:</strong> ${ticket.channel || 'N/A'}</li>
          <li><strong>Status:</strong> ${ticket.status || 'N/A'}</li>
        </ul>
      `;
      const emailHtmlBody = renderEmailCard(emailSubject, bodyHtml, detailsHtml);
      
      const attachments = getTicketAttachments(ticket);
      sendEmail({
        // to: [nextUser.email, "grace.tarimo@wcf.go.tz"],
        to: `grace.tarimo@wcf.go.tz`,
        subject: emailSubject,
        htmlBody: emailHtmlBody,
        attachments: attachments,
      }).catch((e) =>
        console.error("Error sending escalation email:", e.message)
      );
    });
  }

  return true;
}
const getTicketCounts = async (req, res) => {
  try {
    const { userId: id } = req.params;

    console.log("Request URL:", req.originalUrl);
    console.log("Request Params:", req.params);
    console.log("Request Method:", req.method);

    if (!id) {
      return res.status(400).json({ message: "User ID is required" });
    }

    console.log("Fetching ticket counts for user ID:", id);

    const user = await User.findOne({
      where: { id },
      attributes: ["id", "full_name", "role"],
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const isSuperAdmin = user.role === "super-admin" || user.role === "supervisor";
    const whereUserCondition = isSuperAdmin ? {} : { created_by: id };

    // Count tickets by status
    const statuses = [
      "Open",
      "Assigned",
      "Closed",
      "Carried Forward",
      "In Progress",
    ];
    const counts = {};

    for (const status of statuses) {
      const key = status.toLowerCase().replace(/ /g, "");
      const condition = isSuperAdmin ? { status } : { created_by: id, status };
      counts[key] = await Ticket.count({ where: condition });
    }

    // Total tickets
    const total = await Ticket.count({ where: whereUserCondition });

    // Overdue: Open tickets older than 10 days
    const tenDaysAgo = new Date();
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
    const overdueCount = await Ticket.count({
      where: {
        ...whereUserCondition,
        status: { [Op.in]: ["Assigned", "Open", "Returned", "Forwarded"] },
        created_at: { [Op.lt]: tenDaysAgo },
      },
    });

    // New Tickets: Created today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const newTicketsCount = await Ticket.count({
      where: {
        ...whereUserCondition,
        created_at: { [Op.gte]: today },
      },
    });

    // In/Hour: Created in the last hour
    const lastHour = new Date(new Date().setHours(new Date().getHours() - 1));
    const inHourCount = await Ticket.count({
      where: {
        ...whereUserCondition,
        created_at: { [Op.gte]: lastHour },
      },
    });

    // Resolved/Hour: Closed in the last hour
    const resolvedHourCount = await Ticket.count({
      where: {
        ...whereUserCondition,
        status: "Closed",
        updated_at: { [Op.gte]: lastHour },
      },
    });

    // Pending: Open + In Progress
    const pendingCount = counts.open + counts.inprogress;

    // Wait Time metrics
    const tickets = await Ticket.findAll({ where: whereUserCondition });
    let longestWait = "00:00";
    let avgWait = "00:00";
    let maxWait = "00:00";
    let slaBreaches = 0;

    if (tickets.length > 0) {
      const waitTimes = tickets
        .filter((t) => t.status === "Open" || t.status === "In Progress")
        .map((t) => {
          const created = new Date(t.created_at);
          const now = new Date();
          return Math.floor((now - created) / 1000 / 60); // Minutes
        });

      if (waitTimes.length > 0) {
        const maxWaitMinutes = Math.max(...waitTimes);
        const avgWaitMinutes =
          waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length;
        longestWait = `${Math.floor(maxWaitMinutes / 60)}:${String(
          maxWaitMinutes % 60
        ).padStart(2, "0")}`;
        avgWait = `${Math.floor(avgWaitMinutes / 60)}:${String(
          Math.round(avgWaitMinutes % 60)
        ).padStart(2, "0")}`;
        maxWait = longestWait;
        slaBreaches = waitTimes.filter((t) => t > 1440).length; // > 24 hours
      }
    }

    let assignedCount = 0;
    if (!isSuperAdmin) {
      assignedCount = await Ticket.count({
        where: {
          assigned_to_id: id,
          status: { [Op.ne]: "Closed" }
        }
      });
    } else {
      assignedCount = counts.assigned || 0;
    }

    const ticketStats = {
      total,
      open: counts.open || 0,
      assigned: assignedCount,
      closed: counts.closed || 0,
      carriedForward: counts.carriedforward || 0,
      inProgress: counts.inprogress || 0,
      overdue: overdueCount || 0,
      newTickets: newTicketsCount || 0,
      inHour: inHourCount || 0,
      resolvedHour: resolvedHourCount || 0,
      pending: pendingCount || 0,
      longestWait,
      avgWait,
      maxWait,
      lastHour: inHourCount || 0,
      avgDelay: avgWait,
      maxDelay: maxWait,
      slaBreaches: slaBreaches || 0,
    };

    res.status(200).json({
      message: "Ticket counts fetched successfully",
      ticketStats,
    });
  } catch (error) {
    console.error("Error fetching ticket counts:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const generateTicketId = async () => {
  const date = new Date();
  const dateStr = date.toISOString().split('T')[0].replace(/-/g, ''); // Format: YYYYMMDD
  const prefix = `WCF-CC-${dateStr}-`;
  
  // Find the most recent ticket for today's date to get the counter for today
  const todayPrefix = `WCF-CC-${dateStr}-`;
  const lastTicket = await Ticket.findOne({
    where: {
      ticket_id: {
        [Op.like]: `${todayPrefix}%`
      }
    },
    attributes: ['ticket_id', 'created_at'],
    order: [['created_at', 'DESC']] // Order by creation date, not ticket_id string
  });
  
  let counter = 1;
  if (lastTicket && lastTicket.ticket_id) {
    // Extract the counter from the last ticket ID
    const parts = lastTicket.ticket_id.split('-');
    const lastCounter = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(lastCounter)) {
      counter = lastCounter + 1;
    }
  }
  
  // Format counter with leading zeros (e.g., 001, 002, ..., 999)
  const counterStr = counter.toString().padStart(6, '0'); // Use 6 digits to allow more tickets per day
  return `${prefix}${counterStr}`;
};

// Function to get function_id from function_data_id using database relationship
const getFunctionIdFromFunctionDataId = async (functionDataId) => {
  if (!functionDataId) {
    return null;
  }

  try {
    // First, check if it's already a function_id by trying to find it in Function table
    const functionRecord = await Function.findOne({
      where: { id: functionDataId }
    });

    if (functionRecord) {
      // It's already a function_id, return it
      return functionDataId;
    }

    // If not found in Function table, try to find it in FunctionData table
    const functionData = await FunctionData.findOne({
      where: { id: functionDataId },
      include: [{ model: Function, as: "function" }],
    });

    if (functionData && functionData.function_id) {
      // Return the function_id from the relationship
      return functionData.function_id;
    }

    // If not found, return null
    return null;
  } catch (error) {
    console.error("Error getting function_id from function_data_id:", error);
    return null;
  }
};

// Helper function to find head of unit or manager for a section
const findSupervisorForSection = async (section) => {
  try {
    const supervisors = [];
    
    console.log(`🔍 Looking for supervisors for section: "${section}"`);
    
    // Debug: Let's see what users exist with these roles
    const allHeadOfUnits = await User.findAll({
      where: { role: "head-of-unit" },
      attributes: ["id", "full_name", "email", "role", "unit_section"],
    });
    
    const allManagers = await User.findAll({
      where: { role: "manager" },
      attributes: ["id", "full_name", "email", "role", "unit_section"],
    });
    
    const allSupervisors = await User.findAll({
      where: { role: "supervisor" },
      attributes: ["id", "full_name", "email", "role", "unit_section"],
    });
    
    console.log(`📊 Found ${allHeadOfUnits.length} head-of-unit users:`);
    allHeadOfUnits.forEach(user => {
      console.log(`  - ${user.full_name} (${user.role}) - unit_section: "${user.unit_section}"`);
    });
    
    console.log(`📊 Found ${allManagers.length} manager users:`);
    allManagers.forEach(user => {
      console.log(`  - ${user.full_name} (${user.role}) - unit_section: "${user.unit_section}"`);
    });
    
    console.log(`📊 Found ${allSupervisors.length} supervisor users:`);
    allSupervisors.forEach(user => {
      console.log(`  - ${user.full_name} (${user.role}) - unit_section: "${user.unit_section}"`);
    });
    
    // First try to find head-of-unit or director for the specific section/unit
    let headOfUnit = await User.findOne({
      where: {
        role: {
          [Op.in]: ["head-of-unit", "director"]
        },
        unit_section: section,
      },
      attributes: ["id", "full_name", "email", "role", "unit_section"],
    });

    // If head-of-unit found for the section, add to supervisors list
    if (headOfUnit) {
      supervisors.push(headOfUnit);
      console.log(`✅ Found head-of-unit: ${headOfUnit.full_name} (${headOfUnit.role}) for section: ${section}`);
    } else {
      console.log(`❌ No head-of-unit found for section: "${section}"`);
    }

    // Try to find manager for the specific section/unit
    let manager = await User.findOne({
      where: {
        role: "manager",
        unit_section: section,
      },
      attributes: ["id", "full_name", "email", "role", "unit_section"],
    });

    // If manager found for the section, add to supervisors list
    if (manager) {
      supervisors.push(manager);
      console.log(`✅ Found manager: ${manager.full_name} (${manager.role}) for section: ${section}`);
    } else {
      console.log(`❌ No manager found for section: "${section}"`);
    }

    // Always try to find any supervisor (general role) - this should always be included
    let generalSupervisor = await User.findOne({
      where: {
        role: "supervisor",
      },
      attributes: ["id", "full_name", "email", "role", "unit_section"],
    });

    // If general supervisor found, add to supervisors list
    if (generalSupervisor) {
      supervisors.push(generalSupervisor);
      console.log(`✅ Found general supervisor: ${generalSupervisor.full_name} (${generalSupervisor.role})`);
    } else {
      console.log(`❌ No general supervisor found`);
    }

    // If still no supervisors found, try to find any head-of-unit, director, or manager (any section) as fallback
    if (supervisors.length === 0) {
      let fallbackSupervisor = await User.findOne({
        where: {
          role: {
            [Op.in]: ["head-of-unit", "director", "manager"]
          }
        },
        attributes: ["id", "full_name", "email", "role", "unit_section"],
      });
      
      if (fallbackSupervisor) {
        supervisors.push(fallbackSupervisor);
        console.log(`✅ Found fallback supervisor: ${fallbackSupervisor.full_name} (${fallbackSupervisor.role}) for section: ${section}`);
      }
    }

    if (supervisors.length > 0) {
      console.log(`✅ Found ${supervisors.length} supervisor(s) for section: ${section}`);
      supervisors.forEach(sup => {
        console.log(`  - ${sup.full_name} (${sup.role}) - ${sup.unit_section || 'General'}`);
      });
    } else {
      console.log(`⚠️ No supervisors found for section: ${section}`);
    }

    return supervisors;
  } catch (error) {
    console.error("Error finding supervisors for section:", error);
    return [];
  }
};

const createTicket = async (req, res) => {
  console.log("🎯 CREATE TICKET ENDPOINT CALLED!");
  console.log("Request body received:", req.body);
  
  // ========== EARLY ALLOCATED USER CHECK ==========
  console.log("🔵 ========== EARLY ALLOCATED USER CHECK ==========");
  console.log("🔵 Checking req.body for allocated user fields BEFORE destructuring:");
  console.log("  - req.body.allocated_user_username:", req.body.allocated_user_username);
  console.log("  - req.body.allocatedUserUsername:", req.body.allocatedUserUsername);
  console.log("  - req.body.employerAllocatedStaffUsername:", req.body.employerAllocatedStaffUsername);
  console.log("  - req.body.allocatedUser:", req.body.allocatedUser);
  console.log("  - req.body.allocated_user:", req.body.allocated_user);
  console.log("  - req.body.category:", req.body.category);
  console.log("  - req.body.isInquiry:", req.body.isInquiry);
  console.log("  - req.body.hasClaim:", req.body.hasClaim);
  console.log("🔵 CRITICAL: For Inquiry tickets, if ANY allocated user field has value, it MUST be used (not checklist user)");
  console.log("🔵 ================================================");

  try {
    console.log("Incoming ticket creation request body:", req.body);
    console.log("Subject field received:", req.body.subject);
    console.log("FunctionId field received:", req.body.functionId);
    console.log("Dependents field received:", req.body.dependents);

    const {
      firstName: rawFirstName,
      middleName: rawMiddleName,
      lastName: rawLastName,
      phoneNumber,
      nidaNumber,
      requester,
      institution: rawInstitution,
      channel,
      region,
      district,
      category,
      inquiry_type,
      functionId,
      description,
      status,
      subject,
      responsible_unit_id,
      responsible_unit_name,
      section,
      sub_section: inputSection,
      shouldClose,
      resolution_details,
      resolution_type,
      // New fields for representative
      requesterName: rawRequesterName,
      requesterPhoneNumber,
      requesterEmail,
      requesterAddress,
      relationshipToEmployee,
      // New fields for employer (when requester is Employer)
      employerRegistrationNumber,
      employerName: rawEmployerName,
      employerTin,
      employerPhone,
      employerEmail,
      employerStatus,
      employerAllocatedStaffId,
      employerAllocatedStaffName,
      employerAllocatedStaffUsername,
      // New fields for representative
      representative_name: rawRepresentativeName,
      representative_phone,
      representative_email,
      representative_address,
      representative_relationship,
      // New fields for dependents
      dependents,
    } = req.body;

    // Debug: Log raw representative_name from request
    console.log("🔍 RAW DATA FROM REQUEST BODY:");
    console.log("- rawRepresentativeName:", rawRepresentativeName);
    console.log("- requester:", requester);
    console.log("- rawEmployerName:", rawEmployerName);
    console.log("- rawRequesterName:", rawRequesterName);
    console.log("- req.body.representative_name:", req.body.representative_name);

    // Capitalize name fields
    const firstName = capitalizeWords(rawFirstName);
    const middleName = capitalizeWords(rawMiddleName);
    const lastName = capitalizeWords(rawLastName);
    const institution = capitalizeWords(rawInstitution);
    const requesterName = capitalizeWords(rawRequesterName);
    const employerName = capitalizeWords(rawEmployerName);
    const representative_name = capitalizeWords(rawRepresentativeName);
    
    // Debug: Log processed representative_name
    console.log("🔍 PROCESSED DATA:");
    console.log("- representative_name (processed):", representative_name);
    console.log("- employerName (processed):", employerName);

    // Initialize finalSection before any use
    let finalSection = inputSection;
    if (finalSection === "Unit") {
      finalSection = section; // Use section instead of undefined sub_section
    }

    const userId = req?.user?.userId;
    if (!userId) {
      return res
        .status(400)
        .json({ message: "User ID is required to create a ticket." });
    }

    // Get function_id from function_data_id using database relationship
    const inputId = responsible_unit_id || functionId;
    const mappedResponsibleUnitId = await getFunctionIdFromFunctionDataId(inputId);
    
    // Get the function_data with its function and section relationships
    let functionDataWithRelations = null;
    if (inputId) {
      try {
        // First check if inputId is a function_data_id
        functionDataWithRelations = await FunctionData.findOne({
          where: { id: inputId },
          include: [
            {
              model: Function,
              as: "function",
              include: [
                {
                  model: Section,
                  as: "section"
                }
              ]
            }
          ],
        });
      } catch (error) {
        console.error("Error fetching function_data with relations:", error);
      }
    }
    
    // Get responsibleUnit (Function) with section relationship early for focal-person assignment
    let responsibleUnit = null;
    if (mappedResponsibleUnitId) {
      try {
        responsibleUnit = await Function.findOne({
          where: { id: mappedResponsibleUnitId },
          include: [{ model: Section, as: "section" }],
        });
      } catch (error) {
        console.error("Error fetching responsibleUnit:", error);
      }
    }

    // Get the function name to use as subject if subject is not provided
    let finalSubject = subject;
    console.log("Initial finalSubject:", finalSubject);

    if (!finalSubject && functionId) {
      console.log(
        "Subject not provided, trying to get from functionId:",
        functionId
      );
      try {
        const functionData = await FunctionData.findOne({
          where: { id: functionId },
          include: [{ model: Function, as: "function" }],
        });
        console.log("FunctionData found:", functionData);
        if (functionData && functionData.function) {
          finalSubject = functionData.function.name;
          console.log("Using function name as subject:", finalSubject);
        }
      } catch (error) {
        console.error("Error fetching function name:", error);
      }
    }

    console.log("Final subject to be used:", finalSubject);

    if (!finalSubject) {
      return res.status(400).json({ message: "Subject is required." });
    }

    // --- Assignment Logic ---
    let assignedUser = null;

    // If ticket is closed on creation, set creator as assigned user and skip assignment logic
    if (shouldClose) {
      console.log("✅ Ticket is closed on creation - Setting creator as assigned user");
      const creatorUser = await User.findOne({
        where: { id: userId },
        attributes: ["id", "full_name", "email", "role", "unit_section", "sub_section"],
      });
      if (creatorUser) {
        assignedUser = creatorUser;
        console.log("✅ Creator set as assigned user:", creatorUser.full_name, "Role:", creatorUser.role);
      } else {
        console.error("⚠️ Creator user not found, will use default assignment");
      }
    }

    // Get allocated user from search response (not from institution details)
    // This comes from the search response when an allocated user is assigned to the employer
    // ========== COMPREHENSIVE REQ.BODY LOGGING FOR ALLOCATED USER ==========
    console.log("🔵 ========== ALLOCATED USER DEBUG - START ==========");
    console.log("🔵 FULL REQ.BODY KEYS:", Object.keys(req.body));
    console.log("🔵 ALLOCATED USER FIELDS IN REQ.BODY:");
    console.log("  - req.body.allocated_user_username:", req.body.allocated_user_username);
    console.log("  - req.body.allocatedUserUsername:", req.body.allocatedUserUsername);
    console.log("  - req.body.employerAllocatedStaffUsername:", req.body.employerAllocatedStaffUsername);
    console.log("  - req.body.allocatedUser:", req.body.allocatedUser);
    console.log("  - req.body.allocated_user:", req.body.allocated_user);
    console.log("  - req.body.allocated_user_id:", req.body.allocated_user_id);
    console.log("  - req.body.allocated_user_name:", req.body.allocated_user_name);
    console.log("🔵 TICKET CONTEXT:");
    console.log("  - category:", category);
    console.log("  - shouldClose:", shouldClose);
    console.log("  - isInquiry:", category === "Inquiry");
    console.log("  - willRunAssignmentLogic:", !shouldClose && category === "Inquiry");
    
    // Check multiple possible field names including employerAllocatedStaffUsername
    // CRITICAL: Check ALL possible field names to ensure we capture allocated user
    console.log("🔵 ========== ALLOCATED USER EXTRACTION - START ==========");
    console.log("🔵 Checking ALL possible allocated user field names:");
    console.log("  - req.body.allocated_user_username:", req.body.allocated_user_username, "(type:", typeof req.body.allocated_user_username, ")");
    console.log("  - req.body.allocatedUserUsername:", req.body.allocatedUserUsername, "(type:", typeof req.body.allocatedUserUsername, ")");
    console.log("  - req.body.employerAllocatedStaffUsername:", req.body.employerAllocatedStaffUsername, "(type:", typeof req.body.employerAllocatedStaffUsername, ")");
    console.log("  - req.body.allocatedUser:", req.body.allocatedUser, "(type:", typeof req.body.allocatedUser, ")");
    console.log("  - req.body.allocated_user:", req.body.allocated_user, "(type:", typeof req.body.allocated_user, ")");
    
    let allocatedUserUsername = req.body.allocated_user_username || 
                                req.body.allocatedUserUsername || 
                                req.body.employerAllocatedStaffUsername ||
                                req.body.allocatedUser || 
                                req.body.allocated_user;
    
    console.log("🔵 ALLOCATED USER EXTRACTION RESULT:");
    console.log("  - Final allocatedUserUsername:", allocatedUserUsername);
    console.log("  - allocatedUserUsername type:", typeof allocatedUserUsername);
    console.log("  - allocatedUserUsername is truthy:", !!allocatedUserUsername);
    console.log("  - allocatedUserUsername === null:", allocatedUserUsername === null);
    console.log("  - allocatedUserUsername === undefined:", allocatedUserUsername === undefined);
    console.log("  - allocatedUserUsername === '':", allocatedUserUsername === '');
    console.log("  - allocatedUserUsername trimmed:", allocatedUserUsername ? allocatedUserUsername.trim() : "N/A");
    console.log("  - allocatedUserUsername trimmed length:", allocatedUserUsername ? allocatedUserUsername.trim().length : 0);
    console.log("  - Will proceed to Inquiry assignment?", !shouldClose && category === "Inquiry" && allocatedUserUsername && allocatedUserUsername.trim() !== "");
    console.log("🔵 ========== ALLOCATED USER DEBUG - END ==========");

    // Only run assignment logic if ticket is NOT closed on creation
    if (!shouldClose && category === "Inquiry") {
      console.log("🔵 ========== INQUIRY ASSIGNMENT LOGIC STARTED ==========");
      console.log("🔵 CRITICAL: For Inquiry tickets, allocated user ALWAYS takes priority over checklist user, even if claim exists");
      console.log("🔵 STEP 1 CHECK - Allocated User Username:");
      console.log("  - allocatedUserUsername value:", allocatedUserUsername);
      console.log("  - allocatedUserUsername type:", typeof allocatedUserUsername);
      console.log("  - allocatedUserUsername is truthy:", !!allocatedUserUsername);
      console.log("  - allocatedUserUsername trimmed:", allocatedUserUsername ? allocatedUserUsername.trim() : "N/A");
      console.log("  - allocatedUserUsername trimmed length:", allocatedUserUsername ? allocatedUserUsername.trim().length : 0);
      console.log("  - Will enter STEP 1?", allocatedUserUsername && allocatedUserUsername.trim() !== "");
      
      // ASSIGNMENT PRIORITY FOR INQUIRY:
      // CRITICAL RULE: If Inquiry + allocated user exists (not null/empty) -> ALWAYS assign to allocated user, NEVER to checklist user
      // This applies to ALL sub-sections, but especially for "Compliance Section"
      // 1. If Inquiry + allocated user exists -> Assign to allocated user by username (ALWAYS, regardless of sub-section or claim existence)
      // 2. If no allocated user -> Assign to focal-person based on sub_section (for directorate) or unit_section (for units)
      
      // Get sub_section from request body for special handling
      const ticketSubSection = req.body.sub_section || inputSection || null;
      const normalizedSubSection = ticketSubSection ? ticketSubSection.toLowerCase().trim() : null;
      const isComplianceSection = normalizedSubSection === "compliance section";
      const isSpecialSubSection = isComplianceSection;
      
      console.log("🔵 INQUIRY SUB-SECTION CHECK:");
      console.log("  - ticketSubSection:", ticketSubSection);
      console.log("  - normalizedSubSection:", normalizedSubSection);
      console.log("  - isComplianceSection:", isComplianceSection);
      console.log("  - isSpecialSubSection:", isSpecialSubSection);
      console.log("  - allocatedUserUsername:", allocatedUserUsername);
      
      // STEP 1: CRITICAL - Check if allocated user exists and assign by username
      // RULE: If Inquiry + allocated user exists (not null/empty) -> ALWAYS assign to allocated user, NEVER to checklist user
      // This applies regardless of claim existence or sub-section
      if (allocatedUserUsername && allocatedUserUsername.trim() !== "") {
        const trimmedUsername = allocatedUserUsername.trim();
        console.log("🔍 STEP 1: CRITICAL - Allocated user provided for Inquiry ticket");
        console.log("🔍 STEP 1: Checking for allocated user with username:", trimmedUsername);
        console.log("🔍 STEP 1: This will OVERRIDE any checklist user assignment, even if claim exists");
        
        // Try exact match first
        assignedUser = await User.findOne({
          where: { username: trimmedUsername },
          attributes: ["id", "full_name", "email", "role", "unit_section", "sub_section"],
        });
        
        // If not found, try case-insensitive match (MySQL compatible)
        if (!assignedUser) {
          console.log("🔍 STEP 1: Exact match not found, trying case-insensitive search for username:", trimmedUsername);
          assignedUser = await User.findOne({
            where: Sequelize.where(
              Sequelize.fn('LOWER', Sequelize.col('username')),
              Sequelize.fn('LOWER', trimmedUsername)
            ),
            attributes: ["id", "full_name", "email", "role", "unit_section", "sub_section"],
          });
        }
        
        // If still not found, try finding by email
        if (!assignedUser) {
          const emailToSearch = `${trimmedUsername}@wcf.go.tz`;
          console.log("🔍 STEP 1: Username not found, trying to find by email:", emailToSearch);
          assignedUser = await User.findOne({
            where: Sequelize.where(
              Sequelize.fn('LOWER', Sequelize.col('email')),
              Sequelize.fn('LOWER', emailToSearch)
            ),
            attributes: ["id", "full_name", "email", "role", "unit_section", "sub_section"],
          });
          if (assignedUser) {
            console.log("✅ STEP 1: Found user by email:", assignedUser.email);
          }
        }
        
        if (assignedUser) {
          if (isSpecialSubSection) {
            console.log(`✅ STEP 1 SUCCESS: Found allocated user for Compliance Section:`, assignedUser.full_name);
            console.log(`✅ STEP 1 SUCCESS: Assigning to allocated user (OVERRIDING checklist user, even with claim)`);
          } else {
            console.log("✅ STEP 1 SUCCESS: Found allocated user:", assignedUser.full_name);
            console.log("✅ STEP 1 SUCCESS: Assigning to allocated user (OVERRIDING checklist user, even with claim)");
          }
          // CRITICAL: Set assignedUser and skip all other assignment logic
          // This ensures allocated user takes priority over checklist user
        } else {
          // If allocated user not found in database, create the user
          console.log("⚠️ STEP 1: Allocated user not found in database (by username or email), creating new user with username:", trimmedUsername);
          const nameParts = trimmedUsername
            .split(".")
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1));
          const newUser = await User.create({
            username: trimmedUsername,
            full_name: nameParts.join(" "),
            email: `${trimmedUsername}@wcf.go.tz`,
            role: "attendee",
            unit_section: finalSection || responsible_unit_name,
            password: await bcrypt.hash("user12345", 10),
            status: "active",
          });
          assignedUser = newUser;
          console.log("✅ STEP 1 SUCCESS: Created and assigned to new allocated user:", newUser.full_name);
          console.log("✅ STEP 1 SUCCESS: This OVERRIDES any checklist user assignment");
        }
      } else {
        console.log("⚠️ STEP 1 SKIPPED: No allocated user username provided or it was empty.");
        console.log("⚠️ STEP 1 SKIPPED - Details:");
        console.log("  - allocatedUserUsername:", allocatedUserUsername);
        console.log("  - allocatedUserUsername === null:", allocatedUserUsername === null);
        console.log("  - allocatedUserUsername === undefined:", allocatedUserUsername === undefined);
        console.log("  - allocatedUserUsername === '':", allocatedUserUsername === '');
        console.log("  - allocatedUserUsername?.trim() === '':", allocatedUserUsername?.trim() === '');
        console.log("⚠️ STEP 1 SKIPPED: Will proceed to STEP 2 (focal-person assignment)");
      }

      // STEP 2: Second priority - If no allocated user found/assigned, assign to focal-person with matching sub_section
      // Only proceed if STEP 1 did not find/assign an allocated user
      if (!assignedUser) {
        console.log("🔍 ========== STEP 2 STARTED ==========");
        console.log("🔍 STEP 2: No allocated user found/assigned, checking for focal-person with matching sub_section...");
        console.log("🔍 STEP 2 - assignedUser check:", assignedUser);
        console.log("🔍 STEP 2 - assignedUser is null/undefined:", !assignedUser);
        // Helper function to determine if section is directorate or unit
        const getSectionType = (sectionName) => {
          if (!sectionName) return null;
          const name = sectionName.toLowerCase();
          if (name.includes('directorate')) {
            return 'directorate';
          } else if (name.includes('unit')) {
            return 'unit';
          }
          return null;
        };

        // Get section and sub-section from function_data relationship (most accurate)
        let sectionName = null;
        let subSectionName = null;
        
        // First, try to get from function_data relationship
        if (functionDataWithRelations?.function?.section?.name) {
          sectionName = functionDataWithRelations.function.section.name;
          subSectionName = functionDataWithRelations.function.name;
          console.log("Using section/sub-section from function_data relationship:", sectionName, "/", subSectionName);
        } 
        // If not available, try to get from responsibleUnit
        else if (responsibleUnit?.section?.name) {
          sectionName = responsibleUnit.section.name;
          subSectionName = responsibleUnit.name;
          console.log("Using section/sub-section from responsibleUnit:", sectionName, "/", subSectionName);
        }
        // Fallback to section from request body
        else if (section && section.trim() !== "") {
          sectionName = section;
          subSectionName = finalSection || responsible_unit_name;
          console.log("Using section/sub-section from request body:", sectionName, "/", subSectionName);
        }

        // Determine section type (directorate or unit)
        const sectionType = getSectionType(sectionName);
        let ticketSectionForFocalPerson = null;

        if (sectionType === 'directorate') {
          // For directorate: use sub-section (function name) to match focal-person's sub_section
          ticketSectionForFocalPerson = subSectionName;
          console.log("Section is directorate, using sub-section (function name) for focal-person:", ticketSectionForFocalPerson);
        } else if (sectionType === 'unit') {
          // For unit: use sub-section (function name) to match focal-person's unit_section
          ticketSectionForFocalPerson = subSectionName;
          console.log("Section is unit, using sub-section (function name) for focal-person:", ticketSectionForFocalPerson);
        } else {
          // Fallback: use sub-section if available, otherwise section name
          ticketSectionForFocalPerson = subSectionName || sectionName;
          console.log("Section type unknown, using fallback for focal-person:", ticketSectionForFocalPerson);
        }

        console.log(
          "TicketSection for focal-person assignment:",
          ticketSectionForFocalPerson
        );

        // Only query if ticketSectionForFocalPerson is defined and not empty
        // AND ensure we still don't have an assigned user (double-check from STEP 1)
        if (ticketSectionForFocalPerson && ticketSectionForFocalPerson.trim() !== "" && !assignedUser) {
          // For directorate: match by sub_section, for unit: match by unit_section
          if (sectionType === 'directorate') {
            console.log("🔍 STEP 2: Searching for focal-person with sub_section:", ticketSectionForFocalPerson, "for directorate");
            assignedUser = await User.findOne({
              where: {
                role: "focal-person",
                sub_section: ticketSectionForFocalPerson,
              },
              attributes: ["id", "full_name", "email", "role", "unit_section", "sub_section"],
            });
            console.log(
              "Found focal-person with matching sub_section (directorate):",
              assignedUser?.full_name || "None found"
            );
          } else if (sectionType === 'unit') {
            // For units: match by unit_section (as before)
            console.log("🔍 STEP 2: Searching for focal-person with unit_section:", ticketSectionForFocalPerson, "for unit");
            assignedUser = await User.findOne({
              where: {
                role: "focal-person",
                unit_section: ticketSectionForFocalPerson,
              },
              attributes: ["id", "full_name", "email", "role", "unit_section", "sub_section"],
            });
            console.log(
              "Found focal-person with matching unit_section (unit):",
              assignedUser?.full_name || "None found"
            );
          } else {
            console.log("⚠️ STEP 2: Section type is not directorate or unit, skipping focal-person assignment");
          }
        } else if (assignedUser) {
          console.log("✅ STEP 2 SKIPPED: Already have assigned user from STEP 1, skipping focal-person assignment");
        } else {
          console.log("⚠️ STEP 2 SKIPPED: ticketSectionForFocalPerson is empty or undefined");
        }
        
        // If no focal-person found with matching sub_section/unit_section, log and leave assignedUser as null
        // Do NOT assign to any focal-person - ticket will remain unassigned
        if (!assignedUser) {
          console.log("⚠️ STEP 2: No focal-person found with matching sub_section/unit_section. Ticket will not be assigned to any focal-person.");
        }
      }
      
      // CRITICAL CHECK: After Inquiry assignment logic, verify that if allocated user was provided, it was used
      // This prevents any other logic from overriding the allocated user assignment
      if (allocatedUserUsername && allocatedUserUsername.trim() !== "" && !assignedUser) {
        console.error("❌ ERROR: Allocated user was provided but assignment failed!");
        console.error("❌ ERROR: allocatedUserUsername:", allocatedUserUsername);
        console.error("❌ ERROR: assignedUser:", assignedUser);
        return res.status(500).json({
          message: "Failed to assign ticket to allocated user. Please check if the allocated user exists in the system.",
          error: "ALLOCATED_USER_ASSIGNMENT_FAILED",
          allocatedUserUsername: allocatedUserUsername
        });
      }
      
      // CRITICAL: If assignedUser is set from allocated user, log confirmation
      if (assignedUser && allocatedUserUsername && allocatedUserUsername.trim() !== "") {
        console.log("✅ CONFIRMED: Inquiry ticket assigned to allocated user:", assignedUser.full_name);
        console.log("✅ CONFIRMED: This assignment OVERRIDES any checklist user routing, even with claim");
      }
    } else if (!shouldClose && ["Complaint", "Suggestion", "Compliment"].includes(category)) {
      // Assign to reviewer
      assignedUser = await User.findOne({
        where: { role: "reviewer" },
        attributes: ["id", "full_name", "email", "role", "unit_section"],
      });
    }
    
    if (!assignedUser) {
      // For Inquiry category, provide more specific error message
      if (category === "Inquiry") {
        return res.status(400).json({
          message: `No appropriate user found to assign the ${category} ticket to. Please ensure there is either an allocated user or a focal-person with matching sub-section/unit-section.`,
          error: "NO_ASSIGNEE_FOUND",
          category: category
        });
      }
      return res.status(400).json({
        message: `No appropriate user found to assign the ${category} ticket to.`,
        error: "NO_ASSIGNEE_FOUND",
        category: category
      });
    }

    // --- Ticket Data Preparation ---
    const ticketId = await generateTicketId();

    console.log("ResponsibleUnit found:", responsibleUnit);
    console.log("ResponsibleUnit section:", responsibleUnit?.section);
    console.log("Mapped responsible unit ID:", mappedResponsibleUnitId);
    console.log("FunctionData with relations:", functionDataWithRelations);
    
    // Determine section and sub_section from function_data relationship (most accurate)
    let finalSectionName = null;
    let finalSubSectionName = null;
    
    // Priority 1: Get from function_data relationship
    if (functionDataWithRelations?.function?.section?.name) {
      finalSectionName = functionDataWithRelations.function.section.name;
      finalSubSectionName = functionDataWithRelations.function.name;
      console.log("Using section/sub-section from function_data relationship:", finalSectionName, "/", finalSubSectionName);
    }
    // Priority 2: Get from responsibleUnit
    else if (responsibleUnit?.section?.name) {
      finalSectionName = responsibleUnit.section.name;
      finalSubSectionName = responsibleUnit.name;
      console.log("Using section/sub-section from responsibleUnit:", finalSectionName, "/", finalSubSectionName);
    }
    // Priority 3: Fallback to request body or defaults
    else {
      finalSectionName = responsible_unit_name || section || "Unit";
      finalSubSectionName = responsibleUnit?.name || finalSection || "Unit";
      console.log("Using section/sub-section from fallback:", finalSectionName, "/", finalSubSectionName);
    }

    const initialStatus = shouldClose ? "Closed" : status || "Open";
    let ticketEmployerId = null;
    console.log("🔍 PHONE NUMBER DEBUG:");
    console.log("- Original phoneNumber:", phoneNumber);
    console.log("- Type:", typeof phoneNumber);
    console.log("- Is null:", phoneNumber === null);
    console.log("- Is undefined:", phoneNumber === undefined);
    console.log("- Is empty string:", phoneNumber === "");
    console.log("- Trimmed length:", phoneNumber ? phoneNumber.toString().trim().length : 0);
    
    // Use null instead of "N/A" for phone number to avoid issues with SMS sending
    let ticketPhoneNumber = phoneNumber || null;
    console.log("- Final ticketPhoneNumber:", ticketPhoneNumber);
    console.log("- Final type:", typeof ticketPhoneNumber);
    let ticketInstitution = institution;
    let requesterFullName = `${firstName} ${lastName || ""}`;
    // Handle Employer details and association
    if (requester === "Employer") {
      let employer = null;
      
      // Only search by registration_number if it's provided
      if (employerRegistrationNumber) {
        employer = await Employer.findOne({
          where: { registration_number: employerRegistrationNumber },
        });
      }
      
      if (!employer) {
        // Create new employer record (registration_number can be null now)
        employer = await Employer.create({
          registration_number: employerRegistrationNumber || null,
          name: employerName,
          tin: employerTin,
          phone: employerPhone,
          email: employerEmail,
          employer_status: employerStatus,
          allocated_staff_id: employerAllocatedStaffId,
          allocated_staff_name: employerAllocatedStaffName,
          allocated_staff_username: employerAllocatedStaffUsername,
        });
      }
      ticketEmployerId = employer.id;
      ticketPhoneNumber = employerPhone || phoneNumber || null; // Use null instead of "N/A"
      // For Employer, use employerName as institution (company/employer name)
      // Fallback to institution field if employerName is not provided
      ticketInstitution = employerName && employerName.trim() ? employerName.trim() : (institution && institution.trim() ? institution.trim() : "");
    }
    
    // Determine requesterFullName based on requester type
    if (requester === "Employee") {
      // For Employee, use first_name + last_name
      const employeeName = `${firstName} ${lastName || ""}`.trim();
      // If employee name is not available, fall back to representative_name
      const trimmedRepName = representative_name ? representative_name.trim() : "";
      requesterFullName = employeeName || trimmedRepName || "Customer";
    } else {
      // For all non-Employee requesters (Employer, Representative, Pensioners, Stakeholders, Spouse, Parent, Child, Sibling, etc.)
      // Use representative_name directly (it's always submitted)
      const trimmedRepName = representative_name ? representative_name.trim() : "";
      requesterFullName = trimmedRepName || "Customer";
      
      // Update phone number for Representative
      if (requester === "Representative") {
        ticketPhoneNumber = requesterPhoneNumber || phoneNumber || null;
      }
    }
    
    console.log("🔍 PHONE NUMBER PROCESSING DEBUG:");
    console.log("- Requester type:", requester);
    console.log("- Original phoneNumber:", phoneNumber);
    console.log("- employerPhone:", employerPhone);
    console.log("- requesterPhoneNumber:", requesterPhoneNumber);
    console.log("- Final ticketPhoneNumber:", ticketPhoneNumber);
    console.log("- Final ticketPhoneNumber type:", typeof ticketPhoneNumber);
    console.log("- Final ticketPhoneNumber length:", ticketPhoneNumber ? ticketPhoneNumber.length : 0);

    const ticketData = {
      ticket_id: ticketId,
      first_name: firstName,
      middle_name: middleName || "",
      last_name: lastName,
      phone_number: ticketPhoneNumber,
      nida_number: nidaNumber,
      requester,
      institution: ticketInstitution,
      channel,
      region,
      district,
      category,
      responsible_unit_id: mappedResponsibleUnitId,
      responsible_unit_name: responsible_unit_name,
      section: finalSectionName || "Unit",
      sub_section: finalSubSectionName || "Unit",
      subject: finalSubject || "",
      description,
      status: initialStatus,
      userId: userId,
      assigned_to: assignedUser.id,
      assigned_to_id: assignedUser.id,
      assigned_to_role: assignedUser.role,
      employerId: ticketEmployerId,
      representative_name,
      representative_phone,
      representative_email,
      representative_address,
      representative_relationship,
      // Add dependents as comma-separated string
      dependents: Array.isArray(dependents)
        ? dependents.join(", ")
        : dependents,
    };

    console.log("Final dependents value to be saved:", ticketData.dependents);
    console.log("Ticket data section:", ticketData.section);

    // Log complete ticket data being saved
    console.log("🎯 COMPLETE TICKET DATA BEING SAVED:");
    console.log("=====================================");
    console.log(JSON.stringify(ticketData, null, 2));
    console.log("=====================================");
    console.log("🔍 DEPENDENTS DETAILS:");
    console.log("- Type:", typeof ticketData.dependents);
    console.log("- Value:", ticketData.dependents);
    console.log(
      "- Length:",
      ticketData.dependents ? ticketData.dependents.length : 0
    );
    console.log("=====================================");

    if (shouldClose) {
      ticketData.resolution_details =
        resolution_details || description || "Ticket resolved during creation";
      ticketData.resolution_type = resolution_type || "Resolved";
      ticketData.date_of_resolution = new Date();
      ticketData.attended_by_id = userId;
    }
    // --- Ticket Creation ---
    const newTicket = await Ticket.create(ticketData);

    // Log what was actually saved to the database
    console.log("✅ TICKET CREATED SUCCESSFULLY:");
    console.log("=====================================");
    console.log("Ticket ID:", newTicket.id);
    console.log("Ticket ID (display):", newTicket.ticket_id);
    console.log("Requester:", newTicket.requester);
    console.log("First Name:", newTicket.first_name);
    console.log("Last Name:", newTicket.last_name);
    console.log("Representative Name:", newTicket.representative_name);
    console.log("Institution:", newTicket.institution);
    console.log("RequesterFullName (for SMS):", requesterFullName);
    console.log("Saved Dependents:", newTicket.dependents);
    console.log("Dependents Type:", typeof newTicket.dependents);
    console.log(
      "Dependents Length:",
      newTicket.dependents ? newTicket.dependents.length : 0
    );
    console.log("=====================================");

    // Dependents are now stored as comma-separated string in the Tickets table
    // No need for separate Dependent records

    // --- Create Ticket Assignment Record ---
    if (!shouldClose) {
      // For tickets that are NOT closed on creation, create "Assigned" action
      // await AssignedOfficer.create({
      //   ticket_id: newTicket.id,
      //   assigned_to_id: assignedUser.id,
      //   assigned_to_role: assignedUser.role,
      //   assigned_by_id: userId,
      //   status: 'Active',
      //   assigned_at: new Date(),
      //   notes: 'Initial assignment'
      // });
      await TicketAssignment.create({
        ticket_id: newTicket.id,
        assigned_by_id: userId,
        assigned_to_id: assignedUser.id,
        assigned_to_role: assignedUser.role,
        action: "Assigned",
        reason: description,
        created_at: new Date(),
      });
    } else {
      // If ticket is closed at creation, only create "Closed" action (no "Created" or "Assigned" action)
      // This prevents duplicate entries in the stepper
      const closingUser = await User.findOne({ where: { id: userId } });
      await TicketAssignment.create({
        ticket_id: newTicket.id,
        assigned_by_id: userId,
        assigned_to_id: userId,
        assigned_to_role: closingUser.role,
        action: "Closed",
        reason: resolution_details || "Ticket closed by agent",
        created_at: new Date(),
      });
    }

    // Format phone number for SMS: ensure it starts with +255 and is followed by 9 digits
    let smsRecipient = String(ticketPhoneNumber || "")
      .replace(/^\+/, "")
      .replace(/^0/, "255");
    const isValidTzPhone = (num) => /^255\d{9}$/.test(num);
    
    console.log("🔍 PHONE NUMBER SAVING DEBUG:");
    console.log("- Original phoneNumber from request:", phoneNumber);
    console.log("- ticketPhoneNumber after processing:", ticketPhoneNumber);
    console.log("- smsRecipient:", smsRecipient);
    console.log("- Requester type:", requester);
    console.log("- employerPhone:", employerPhone);
    console.log("- requesterPhoneNumber:", requesterPhoneNumber);
    console.log("- shouldClose value:", shouldClose);
    console.log("- !shouldClose value:", !shouldClose);

    // Only send SMS if ticket is NOT closed at creation
    // Include all requester types: Employee, Employer, Pensioners, Stakeholders, Representative, Spouse, Parent, Child, Sibling
    if (
      !shouldClose &&
      (requester === "Employee" || requester === "Employer" || requester === "Pensioners" || requester === "Stakeholders" || requester === "Representative" || requester === "Spouse" || requester === "Parent" || requester === "Child" || requester === "Sibling") &&
      isValidTzPhone(smsRecipient)
    ) {
      // Ensure requesterFullName is never empty
      const finalName = requesterFullName && requesterFullName.trim() ? requesterFullName.trim() : "Customer";
      const smsMessage = `Dear ${finalName}, your ticket (ID: ${newTicket.ticket_id}) has been created.`;
      
      console.log(`🔍 Name for SMS (creation) ${newTicket.ticket_id}:`, {
        requester_type: requester,
        requesterFullName: requesterFullName,
        finalName: finalName,
        representative_name: representative_name,
        firstName: firstName,
        lastName: lastName
      });
      
      // Send SMS asynchronously to avoid blocking the response
      sendQuickSms({ message: smsMessage, recipient: smsRecipient })
        .then(() => {
          console.log("SMS sent successfully to", smsRecipient);
        })
        .catch((smsError) => {
          console.error("Error sending SMS:", smsError.message);
        });
    } else if (!shouldClose) {
      console.log("Not sending SMS, invalid phone:", smsRecipient);
    }

    // --- Email Notification to Assignee ---
    let emailWarning = "";
    if (assignedUser.email && !shouldClose) {
      const emailSubject = `New ${category} Ticket Assigned: ${finalSubject} (ID: ${newTicket.ticket_id})`;
      const bodyHtml = `<p>Dear ${assignedUser.full_name},</p><p>A new ${category} ticket has been assigned to you.</p>`;
      const detailsHtml = `
        <ul>
          <li><strong>Ticket ID:</strong> ${newTicket.ticket_id}</li>
          <li><strong>Subject:</strong> ${newTicket.subject}</li>
          <li><strong>Category:</strong> ${newTicket.category}</li>
          <li><strong>Description:</strong> ${newTicket.description}</li>
          <li><strong>Requester:</strong> ${requesterFullName} (${ticketPhoneNumber})</li>
          <li><strong>Channel:</strong> ${newTicket.channel}</li>
        </ul>`;
      const emailHtmlBody = renderEmailCard(emailSubject, bodyHtml, detailsHtml);
      const attachments = getTicketAttachments(newTicket);
      // Send emails in background to avoid blocking the assignment
      sendEmailNonBlocking({ to: assignedUser.email, subject: emailSubject, htmlBody: emailHtmlBody, attachments: attachments });
      sendEmailNonBlocking({
        to: "grace.tarimo@wcf.go.tz",
        subject: emailSubject,
        htmlBody: emailHtmlBody,
        attachments: attachments,
      });
    }
    // --- Create Notification for Assignee (only if ticket is not closed) ---
    if (!shouldClose) {
    await Notification.create({
      ticket_id: newTicket.id,
      sender_id: userId,
      recipient_id: assignedUser.id,
        message: `New ${category} ticket assigned to you: ${finalSubject}`,
      channel: channel,
      status: "unread",
        category: category,
    });
    }

    // --- Email to Supervisors (Head of Unit/Manager + General Supervisor) ---
    const supervisors = await findSupervisorForSection(newTicket.section);
    if (supervisors && supervisors.length > 0) {
      const supervisorEmailSubject = `New ${category} Ticket Created: ${finalSubject} (ID: ${newTicket.ticket_id})`;
      
      // Send email to each supervisor
      for (const supervisor of supervisors) {
        const supervisorBodyHtml = `<p>Dear ${supervisor.full_name},</p><p>A new ${category} ticket has been created and assigned to ${assignedUser.full_name}.</p>`;
        const supervisorDetailsHtml = `
          <ul>
            <li><strong>Ticket ID:</strong> ${newTicket.ticket_id}</li>
            <li><strong>Subject:</strong> ${newTicket.subject}</li>
            <li><strong>Category:</strong> ${newTicket.category}</li>
            <li><strong>Description:</strong> ${newTicket.description}</li>
            <li><strong>Requester:</strong> ${requesterFullName} (${ticketPhoneNumber})</li>
            <li><strong>Assigned To:</strong> ${assignedUser.full_name} (${assignedUser.role})</li>
            <li><strong>Section/Unit:</strong> ${newTicket.section}</li>
            <li><strong>Channel:</strong> ${newTicket.channel}</li>
            <li><strong>Status:</strong> ${shouldClose ? "Closed" : "Open"}</li>
          </ul>`;
        const supervisorEmailHtmlBody = renderEmailCard(supervisorEmailSubject, supervisorBodyHtml, supervisorDetailsHtml);
        
        // Get attachments for email
        const attachments = getTicketAttachments(newTicket);
        
        // Send email in background to avoid blocking
        sendEmailNonBlocking({
          to: "grace.tarimo@wcf.go.tz", // For testing, replace with supervisor.email in production
          subject: supervisorEmailSubject,
          htmlBody: supervisorEmailHtmlBody,
          attachments: attachments,
        });
        console.log(`✅ Email queued for ${supervisor.role} ${supervisor.full_name} for ticket ${newTicket.ticket_id}`);
      }
    } else {
      console.log(`⚠️ No supervisors found for section: ${newTicket.section}`);
    }

    // --- Additional Email to Supervisor for Inquiry Tickets ---
    if (category === "Inquiry") {
      // Find all supervisors (role = "supervisor")
      const allSupervisors = await User.findAll({
        where: { role: "supervisor" },
        attributes: ["id", "full_name", "email"],
      });

      if (allSupervisors && allSupervisors.length > 0) {
        const inquirySupervisorEmailSubject = `New Inquiry Ticket Created: ${finalSubject} (ID: ${newTicket.ticket_id})`;
        
        for (const supervisor of allSupervisors) {
          if (supervisor.email) {
            const supervisorBodyHtml = `<p>Dear ${supervisor.full_name},</p><p>A new Inquiry ticket has been created and assigned to ${assignedUser.full_name}.</p>`;
            const supervisorDetailsHtml = `
              <ul>
                <li><strong>Ticket ID:</strong> ${newTicket.ticket_id}</li>
                <li><strong>Subject:</strong> ${newTicket.subject}</li>
                <li><strong>Category:</strong> Inquiry</li>
                <li><strong>Description:</strong> ${newTicket.description}</li>
                <li><strong>Requester:</strong> ${requesterFullName} (${ticketPhoneNumber})</li>
                <li><strong>Assigned To:</strong> ${assignedUser.full_name} (${assignedUser.role})</li>
                <li><strong>Section/Unit:</strong> ${newTicket.section}</li>
                <li><strong>Sub-section:</strong> ${newTicket.sub_section}</li>
                <li><strong>Channel:</strong> ${newTicket.channel}</li>
                <li><strong>Status:</strong> ${shouldClose ? "Closed" : "Open"}</li>
              </ul>`;
            const supervisorEmailHtmlBody = renderEmailCard(inquirySupervisorEmailSubject, supervisorBodyHtml, supervisorDetailsHtml);
            
            // Get attachments for email
            const attachments = getTicketAttachments(newTicket);
            
            // Send email in background to avoid blocking
            sendEmailNonBlocking({
              to: supervisor.email,
              subject: inquirySupervisorEmailSubject,
              htmlBody: supervisorEmailHtmlBody,
              attachments: attachments,
            });
            console.log(`✅ Inquiry email queued for supervisor ${supervisor.full_name} (${supervisor.email}) for ticket ${newTicket.ticket_id}`);
          }
        }
      } else {
        console.log(`⚠️ No supervisors found for Inquiry ticket ${newTicket.ticket_id}`);
      }
    }

    // --- Email to Creator (Agent) when ticket is created ---
    if (userId && !shouldClose) {
      const creatorUser = await User.findOne({
        where: { id: userId },
        attributes: ["id", "full_name", "email"],
      });

      if (creatorUser && creatorUser.email) {
        const creatorEmailSubject = `Ticket Created: ${finalSubject} (ID: ${newTicket.ticket_id})`;
        const creatorBodyHtml = `<p>Dear ${creatorUser.full_name},</p><p>You have successfully created a new ticket.</p>`;
        const creatorDetailsHtml = `
          <ul>
            <li><strong>Ticket ID:</strong> ${newTicket.ticket_id}</li>
            <li><strong>Subject:</strong> ${newTicket.subject}</li>
            <li><strong>Category:</strong> ${newTicket.category}</li>
            <li><strong>Description:</strong> ${newTicket.description}</li>
            <li><strong>Requester:</strong> ${requesterFullName}</li>
            <li><strong>Assigned To:</strong> ${assignedUser.full_name} (${assignedUser.role})</li>
            <li><strong>Section/Unit:</strong> ${newTicket.section}</li>
            <li><strong>Channel:</strong> ${newTicket.channel}</li>
            <li><strong>Status:</strong> Open</li>
          </ul>`;
        const creatorEmailHtmlBody = renderEmailCard(creatorEmailSubject, creatorBodyHtml, creatorDetailsHtml);
        
        // Get attachments for email
        const attachments = getTicketAttachments(newTicket);
        
        // Send email in background to avoid blocking
        sendEmailNonBlocking({
          to: "grace.tarimo@wcf.go.tz", // For testing, replace with creatorUser.email in production
          subject: creatorEmailSubject,
          htmlBody: creatorEmailHtmlBody,
          attachments: attachments,
        });
        console.log(`✅ Email queued for creator (${creatorUser.full_name}) for ticket ${newTicket.ticket_id}`);
      }
    }

    // --- Email to Head of Unit if Closed on Creation (background) ---
    if (shouldClose) {
      // Find head-of-unit or director for the ticket's section/unit
      let headOfUnit = await User.findOne({
        where: {
          role: {
            [Op.in]: ["head-of-unit", "director"]
          },
          unit_section: newTicket.section,
        },
        attributes: ["id", "full_name", "email"],
      });

      // Get the agent's name who closed the ticket
      const closingAgent = await User.findOne({
        where: { id: userId },
        attributes: ["id", "full_name"],
      });

      if (headOfUnit && headOfUnit.email) {
        const emailSubject = `Ticket Closed: ${newTicket.subject} (ID: ${newTicket.ticket_id})`;
        const emailBody = `
          <p>Dear ${closingAgent.full_name},</p>
          <p>You have closed the ticket. Here are the details:</p>
          <ul>
            <li><strong>Ticket ID:</strong> ${newTicket.ticket_id}</li>
            <li><strong>Subject:</strong> ${newTicket.subject}</li>
            <li><strong>Category:</strong> ${newTicket.category}</li>
            <li><strong>Requester:</strong> ${requesterFullName}</li>
            <li><strong>Closed by:</strong> ${
              closingAgent ? closingAgent.full_name : "Unknown Agent"
            }</li>
            <li><strong>Resolution:</strong> ${
              resolution_details ||
              description ||
              "Ticket resolved during creation"
            }</li>
          </ul>
          <p>Please review the resolution details above.</p>
        `;
        const attachments = getTicketAttachments(newTicket);
        sendEmail({
          // to: [headOfUnit.email, "grace.tarimo@wcf.go.tz"],
          to:`grace.tarimo@wcf.go.tz`,
          subject: emailSubject,
          htmlBody: emailBody,
          attachments: attachments,
        }).catch((emailError) => {
          console.error(
            "Error sending email to head-of-unit:",
            emailError.message
          );
        });
      }

      // --- Send SMS and Email to Creator/Requester when ticket is closed at creation (same as closeTicket) ---
      // Get creator user
      const creatorUser = await User.findOne({
        where: { id: userId },
        attributes: ["id", "full_name", "email"],
      });

      if (creatorUser) {
        // Create in-system notification for creator
        const creatorNotificationMsg = `Your ticket ${newTicket.ticket_id} has been closed and resolved.`;
        
        try {
          await Notification.create({
            ticket_id: newTicket.id,
            sender_id: userId,
            recipient_id: creatorUser.id,
            message: creatorNotificationMsg,
            channel: "In-System",
            status: "unread",
            category: newTicket.category || "Ticket Closure",
          });
          console.log(`✅ In-system notification sent to creator (${creatorUser.full_name}) for ticket ${newTicket.ticket_id}`);
        } catch (notificationError) {
          console.error("Error creating notification for creator:", notificationError.message);
        }

        // Send SMS notification to ticket requester (if phone number is available)
        // Use the same logic as when creating ticket to extract phone number
        let ticketPhoneNumberForSMS = null;
        
        // Extract phone number based on requester type (same logic as create ticket)
        if (requester === "Employer") {
          // For Employer: get phone from employerPhone or ticketPhoneNumber
          ticketPhoneNumberForSMS = employerPhone || ticketPhoneNumber || null;
        } else if (requester === "Representative") {
          // For Representative: get phone from requesterPhoneNumber or ticketPhoneNumber
          ticketPhoneNumberForSMS = requesterPhoneNumber || ticketPhoneNumber || null;
        } else {
          // For Employee, Pensioners, Stakeholders: use ticketPhoneNumber
          ticketPhoneNumberForSMS = ticketPhoneNumber || null;
        }
        
        console.log(`🔍 Phone number extraction for closed-at-creation ticket ${newTicket.ticket_id}:`, {
          requester_type: requester,
          ticket_phone_number: ticketPhoneNumber,
          employer_phone: employerPhone,
          requester_phone: requesterPhoneNumber,
          final_phone: ticketPhoneNumberForSMS
        });
        
        // Format phone number for SMS: use same format as create ticket
        if (ticketPhoneNumberForSMS && 
            ticketPhoneNumberForSMS !== "N/A" && 
            ticketPhoneNumberForSMS !== "n/a" && 
            ticketPhoneNumberForSMS !== "" && 
            ticketPhoneNumberForSMS !== null && 
            ticketPhoneNumberForSMS !== undefined) {
          
          let smsRecipient = String(ticketPhoneNumberForSMS || "")
            .replace(/^\+/, "")
            .replace(/^0/, "255");
          const isValidTzPhone = (num) => /^255\d{9}$/.test(num);
          
          if (isValidTzPhone(smsRecipient)) {
            // Truncate resolution details if too long for SMS
            const resolutionText = resolution_details ? 
              (resolution_details.length > 80 ? resolution_details.substring(0, 80) + '...' : resolution_details) : 
              '';
            // Re-extract name using data from newTicket object (which has the saved data) or variables
            let finalName = "Customer";
            
            // Use data from newTicket object (saved in database) as primary source
            const ticketRequester = newTicket.requester || requester;
            const ticketFirstName = newTicket.first_name || firstName;
            const ticketLastName = newTicket.last_name || lastName;
            const ticketRepName = newTicket.representative_name || representative_name;
            
            if (ticketRequester === "Employee") {
              const employeeName = `${ticketFirstName} ${ticketLastName || ""}`.trim();
              const trimmedRepName = ticketRepName ? ticketRepName.trim() : "";
              finalName = employeeName || trimmedRepName || "Customer";
            } else {
              // For all non-Employee requesters, use representative_name directly (it's always submitted)
              const trimmedRepName = ticketRepName ? ticketRepName.trim() : "";
              finalName = trimmedRepName || "Customer";
            }
            
            const smsMessage = `Dear ${finalName}, your ticket (ID: ${newTicket.ticket_id}) has been closed and resolved.`;
            
            console.log(`🔍 Name for SMS (closed at creation) ${newTicket.ticket_id}:`, {
              requester_type: ticketRequester,
              newTicket_requester: newTicket.requester,
              newTicket_first_name: newTicket.first_name,
              newTicket_last_name: newTicket.last_name,
              newTicket_representative_name: newTicket.representative_name,
              variable_representative_name: representative_name,
              original_requesterFullName: requesterFullName,
              finalName: finalName
            });
            
            // Send SMS asynchronously to avoid blocking the response
            sendQuickSms({ message: smsMessage, recipient: smsRecipient })
              .then(() => {
                console.log(`✅ SMS sent successfully to ${smsRecipient} for ticket ${newTicket.ticket_id} closed at creation`);
              })
              .catch((smsError) => {
                console.error("Error sending closure SMS:", smsError.message);
              });
          } else {
            console.log(`⚠️ Not sending closure SMS, invalid phone format: ${smsRecipient} (original: ${ticketPhoneNumberForSMS})`);
          }
        } else {
          console.log(`⚠️ No valid phone number found for ticket ${newTicket.ticket_id} closed at creation, skipping SMS notification`);
        }

        // Send email notification to creator if email is available
        if (creatorUser.email) {
          const emailSubject = `Ticket Closed: ${newTicket.subject}`;
          const emailBody = `
            <p>Dear ${creatorUser.full_name},</p>
            <p>Your ticket has been closed successfully. Here are the details:</p>
          `;
          
          const detailsHtml = `
            <ul>
              <li><strong>Ticket ID:</strong> ${newTicket.ticket_id}</li>
              <li><strong>Subject:</strong> ${newTicket.subject}</li>
              <li><strong>Category:</strong> ${newTicket.category}</li>
              <li><strong>Description:</strong> ${newTicket.description}</li>
              <li><strong>Requester:</strong> ${requesterFullName}</li>
              <li><strong>Closed By:</strong> ${creatorUser.full_name} (${creatorUser.role || "Agent"})</li>
              <li><strong>Resolution Type:</strong> ${resolution_type || "Resolved"}</li>
              <li><strong>Resolution Details:</strong> ${resolution_details || "Ticket closed by agent"}</li>
              <li><strong>Closed Date:</strong> ${new Date().toLocaleString()}</li>
            </ul>
          `;
          
          const { renderEmailCard } = require('../../services/emailService');
          const htmlBody = renderEmailCard(emailSubject, emailBody, detailsHtml);
          
          // Get attachments for email
          const attachments = getTicketAttachments(newTicket);
          
          sendEmail({
            // to: creatorUser.email,
            to: "grace.tarimo@wcf.go.tz",
            subject: emailSubject,
            htmlBody: htmlBody,
            attachments: attachments,
          }).catch((emailError) => {
            console.error(
              "Error sending closure email to creator:",
              emailError.message
            );
          });
        }

        // --- Email to Supervisors (Head of Unit/Manager + General Supervisor) for ticket closure ---
        const supervisors = await findSupervisorForSection(newTicket.section);
        if (supervisors && supervisors.length > 0) {
          const supervisorEmailSubject = `Ticket Closed: ${newTicket.subject} (ID: ${newTicket.ticket_id})`;
          
          // Send email to each supervisor
          for (const supervisor of supervisors) {
            const supervisorBodyHtml = `<p>Dear ${supervisor.full_name},</p><p>A ticket has been closed in your unit/section.</p>`;
            const supervisorDetailsHtml = `
              <ul>
                <li><strong>Ticket ID:</strong> ${newTicket.ticket_id}</li>
                <li><strong>Subject:</strong> ${newTicket.subject}</li>
                <li><strong>Category:</strong> ${newTicket.category}</li>
                <li><strong>Description:</strong> ${newTicket.description}</li>
                <li><strong>Requester:</strong> ${requesterFullName}</li>
                <li><strong>Assigned To:</strong> ${assignedUser.full_name || "Unknown"}</li>
                <li><strong>Section/Unit:</strong> ${newTicket.section}</li>
                <li><strong>Closed By:</strong> ${creatorUser.full_name || "Unknown"} (${creatorUser.role || "Unknown Role"})</li>
                <li><strong>Resolution Type:</strong> ${resolution_type || "Resolved"}</li>
                <li><strong>Resolution Details:</strong> ${resolution_details || "Ticket closed by agent"}</li>
                <li><strong>Closed Date:</strong> ${new Date().toLocaleString()}</li>
              </ul>`;
            const supervisorEmailHtmlBody = renderEmailCard(supervisorEmailSubject, supervisorBodyHtml, supervisorDetailsHtml);
            
            // Get attachments for email
            const attachments = getTicketAttachments(newTicket);
            
            // Send email in background to avoid blocking
            sendEmailNonBlocking({
              to: "grace.tarimo@wcf.go.tz", // For testing, replace with supervisor.email in production
              subject: supervisorEmailSubject,
              htmlBody: supervisorEmailHtmlBody,
              attachments: attachments,
            });
            console.log(`✅ Closure email queued for ${supervisor.role} ${supervisor.full_name} for ticket ${newTicket.ticket_id}`);
          }
        } else {
          console.log(`⚠️ No supervisors found for section: ${newTicket.section || newTicket.responsible_unit_name}`);
        }
      }
    }
    // --- Respond to client immediately ---
    const assignedToLabel = assignedUser
      ? `${assignedUser.full_name || assignedUser.username || assignedUser.id} (${assignedUser.role || "user"})`
      : "Unassigned";

    res.status(201).json({
      message: `Ticket created successfully${
        shouldClose ? " and closed" : ""
      }${emailWarning}${shouldClose ? "" : ` and assigned to ${assignedToLabel}`}`,
      ticket: newTicket,
      assigned_to: assignedUser
        ? { id: assignedUser.id, full_name: assignedUser.full_name, role: assignedUser.role }
        : null,
    });
    // --- Send email to assignee in background ---
    if (assignedUser.email && !shouldClose) {
      const emailSubject = `New ${category} Ticket Assigned: ${finalSubject} (ID: ${newTicket.ticket_id})`;
      const bodyHtml2 = `<p>Dear ${assignedUser.full_name},</p><p>A new ${category} ticket has been assigned to you.</p>`;
      const detailsHtml2 = `
        <ul>
          <li><strong>Ticket ID:</strong> ${newTicket.ticket_id}</li>
          <li><strong>Subject:</strong> ${newTicket.subject}</li>
          <li><strong>Category:</strong> ${newTicket.category}</li>
          <li><strong>Description:</strong> ${newTicket.description}</li>
          <li><strong>Requester:</strong> ${requesterFullName} (${ticketPhoneNumber})</li>
          <li><strong>Channel:</strong> ${newTicket.channel}</li>
        </ul>`;
      const emailHtmlBody = renderEmailCard(emailSubject, bodyHtml2, detailsHtml2);
      
      // Get attachments for email
      const attachments = getTicketAttachments(newTicket);
      
      sendEmail({
        to: "grace.tarimo@wcf.go.tz",
        subject: emailSubject,
        htmlBody: emailHtmlBody,
        attachments: attachments,
      }).catch((emailError) => {
        console.error("Error sending email:", emailError.message);
      });
    }
    // --- Email to Supervisor if Closed on Creation (background) ---
    if (shouldClose) {
      // Find head-of-unit or director for the ticket's section/unit
      let headOfUnit = await User.findOne({
        where: {
          role: {
            [Op.in]: ["head-of-unit", "director"]
          },
          unit_section: newTicket.section,
        },
        attributes: ["id", "full_name", "email"],
      });

      // Get the agent's name who closed the ticket
      const closingAgent = await User.findOne({
        where: { id: userId },
        attributes: ["id", "full_name"],
      });

      if (headOfUnit && headOfUnit.email) {
        const emailSubject = `Ticket Closed: ${newTicket.subject} (ID: ${newTicket.ticket_id})`;
        const emailBody = `
          <p>Dear ${closingAgent.full_name},</p>
          <p>You have closed the ticket. Here are the details:</p>
          <ul>
            <li><strong>Ticket ID:</strong> ${newTicket.ticket_id}</li>
            <li><strong>Subject:</strong> ${newTicket.subject}</li>
            <li><strong>Category:</strong> ${newTicket.category}</li>
            <li><strong>Description:</strong> ${newTicket.description}</li>
            <li><strong>Resolution:</strong> ${
              resolution_details || "Ticket closed by agent"
            }</li>
          </ul>
          <p>Thank you for using the WCF Customer Care System.</p>
        `;
        // Get attachments for email
        const attachments = getTicketAttachments(newTicket);
        
        sendEmail({
          // to: [closingAgent.email, "grace.tarimo@wcf.go.tz"],
          to:`grace.tarimo@wcf.go.tz`,
          subject: emailSubject,
          htmlBody: emailBody,
          attachments: attachments,
        }).catch((emailError) => {
          console.error(
            "Error sending closure email to agent:",
            emailError.message
          );
        });
      }
    }
    return;
  } catch (error) {
    console.error("Ticket creation error:", error);
    return res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};

const getTickets = async (req, res) => {
  try {
    const { userId } = req.params; // Get userId from URL

    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    console.log("Fetching tickets for user ID:", userId);

    // Fetch User details including role
    const user = await User.findOne({
      where: { id: userId },
      attributes: ["id", "full_name", "role"], // Fetch ID, Name & Role
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    let tickets;

    if (user.role === "super-admin") {
      // Fetch all tickets for super_admin
      tickets = await Ticket.findAll({
        attributes: { exclude: ["userId"] },
        order: [["created_at", "DESC"]],
      });
    } else if (user.role === "focal-person") {
      // Focal person: Fetch tickets for their section/unit
      // For directorate: match by sub_section, for unit: match by unit_section
      const isDirectorate = user.unit_section && user.unit_section.toLowerCase().includes("directorate");
      
      let whereClause = {
          status: { [Op.ne]: "Closed" },
      };
      
      if (isDirectorate && user.sub_section) {
        // For directorate: match ticket's sub_section with focal-person's sub_section
        whereClause.sub_section = user.sub_section;
        console.log(`Focal-person (directorate) fetching tickets with sub_section: "${user.sub_section}"`);
      } else if (user.unit_section) {
        // For units: match ticket's section with focal-person's unit_section (as before)
        whereClause.section = user.unit_section;
        console.log(`Focal-person (unit) fetching tickets with section: "${user.unit_section}"`);
      }
      
      tickets = await Ticket.findAll({
        where: whereClause,
        attributes: { exclude: ["userId"] },
        order: [["created_at", "DESC"]],
      });
    } else {
      // Fetch only tickets created by this agent
      tickets = await Ticket.findAll({
        where: { userId },
        attributes: { exclude: ["userId"] },
        order: [["created_at", "DESC"]],
      });
    }

    if (tickets.length === 0) {
      return res.status(404).json({ message: "No tickets found." });
    }

    // Modify response to include `created_by` (user.name instead of userId)
    const response = tickets.map((ticket) => ({
      ...ticket.toJSON(),
      created_by: user.full_name, // Replace userId with user name
    }));

    res
      .status(200)
      .json({ message: "Tickets fetched successfully", Tickets: response });
  } catch (error) {
    console.error("No tickets to assign:", error);
    res.status(404).json({ message: "Server error", error: error.message });
  }
};

const getOpenTickets = async (req, res) => {
  try {
    const { userId } = req.params; // Get userId from URL

    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    console.log("Fetching OPEN tickets for user ID:", userId);

    // Fetch User details including role
    const user = await User.findOne({
      where: { id: userId },
      attributes: ["id", "full_name", "role"], // Fetch ID, Name & Role
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    let tickets;

    if (user.role === "super-admin" || user.role === "supervisor") {
      // Super admin and supervisor: Fetch all OPEN tickets
      tickets = await Ticket.findAll({
        where: { status: ["Open", "Assigned"] }, // Filter by status
        attributes: { exclude: ["userId"] },
        include: [
          {
            model: User,
            as: "creator",
            attributes: ["id", "full_name", "email"],
          },
          {
            model: User,
            as: "assignee",
            attributes: ["id", "full_name", "email"],
          },
          {
            model: User,
            as: "attendedBy",
            attributes: ["id", "full_name", "email"],
          },
          {
            model: User,
            as: "ratedBy",
            attributes: ["id", "full_name", "email"],
          },
          {
            model: User,
            as: "convertedBy",
            attributes: ["id", "full_name", "email"],
          },
          {
            model: User,
            as: "forwardedBy",
            attributes: ["id", "full_name", "email"],
          },
          {
            model: TicketAssignment,
            as: "assignments",
            include: [
              {
                model: User,
                as: "assignedTo",
                attributes: ["id", "full_name", "email"]
              }
            ]
          },
          {
            model: RequesterDetails,
            as: "RequesterDetail",
          },
        ],
        order: [["created_at", "DESC"]],
      });
    } else {
      // Agent: Fetch only OPEN tickets assigned to this agent
      tickets = await Ticket.findAll({
        where: {
          assigned_to_id: userId,
          status: { [Op.in]: ["Assigned", "Open", "Returned", "Forwarded"] },
        },
        include: [
          {
            model: User,
            as: "creator",
            attributes: ["id", "full_name", "email"],
          },
          {
            model: User,
            as: "assignee",
            attributes: ["id", "full_name", "email"],
          },
          {
            model: User,
            as: "attendedBy",
            attributes: ["id", "full_name", "email"],
          },
          {
            model: User,
            as: "ratedBy",
            attributes: ["id", "full_name", "email"],
          },
          {
            model: User,
            as: "convertedBy",
            attributes: ["id", "full_name", "email"],
          },
          {
            model: User,
            as: "forwardedBy",
            attributes: ["id", "full_name", "email"],
          },
          {
            model: TicketAssignment,
            as: "assignments",
            include: [
              {
                model: User,
                as: "assignedTo",
                attributes: ["id", "full_name", "email"]
              }
            ]
          },
          {
            model: RequesterDetails,
            as: "RequesterDetail",
          },
        ],
        order: [["created_at", "DESC"]],
      });
    }

    if (tickets.length === 0) {
      return res.status(404).json({ message: "No open tickets found." });
    }

    // Modify response to include created_by (user.name) and assignment history
    const response = tickets.map((ticket) => {
      const t = ticket.toJSON();
      t.assignments = (t.assignments || [])
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
        .map((a) => ({
          assigned_to_id: a.assigned_to_id,
          assigned_to_name: a.assignedTo?.full_name || null,
          assigned_to_role: a.assignedTo?.role || null,
          reason: a.reason,
          action: a.action,
          created_at: a.created_at,
        }));
      // Debug: Log the RequesterDetail for each ticket
      console.log(
        "OPEN DEBUG - Ticket ID:",
        t.id,
        "RequesterDetail:",
        t.RequesterDetail
      );
      return {
        ...t,
        created_by: user.full_name,
      };
    });
    console.log("all ticketd open", response);
    res.status(200).json({
      message: "Open tickets fetched successfully",
      totalTickets: tickets.length,
      tickets: response,
    });
  } catch (error) {
    console.error("Error fetching open tickets:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getAssignedTickets = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }
    console.log("Fetching Assigned tickets for user ID:", userId);
    const user = await User.findOne({
      where: { id: userId },
      attributes: ["id", "full_name", "role"],
    });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    let tickets;
    if (user.role === "super-admin" || user.role === "supervisor") {
      // All roles: Fetch only tickets assigned to this user
      tickets = await Ticket.findAll({
        where: { 
          assigned_to_id: userId,
          status: { [Op.in]: ["Assigned", "Open", "Forwarded", "Attended and Recommended",
            "Reversed","Returned", "Escalated"] } 
        },
        include: [
          {
            model: User,
            as: "assignee",
            attributes: ["id", "full_name", "email"],
          },
          {
            model: TicketAssignment,
            as: "assignments",
            include: [
              {
                model: User,
                as: "assignedTo",
                attributes: ["id", "full_name", "email"]
              }
            ]
          },
          {
            model: RequesterDetails,
            as: "RequesterDetail",
          },
        ],
        order: [["created_at", "DESC"]],
      });
    } else {
      // Fetch tickets assigned to this user (attendee)
      tickets = await Ticket.findAll({
        where: {
          assigned_to_id: userId,
          status: { [Op.in]: ["Assigned", "Open", "Returned", "Forwarded", "Escalated", 
            "Reversed","In Progress", "Attended and Recommended"] }
        },
        include: [
          {
            model: User,
            as: "assignee",
            attributes: ["id", "full_name", "email"],
          },
          {
            model: TicketAssignment,
            as: "assignments",
            include: [
              {
                model: User,
                as: "assignedTo",
                attributes: ["id", "full_name", "email"]
              }
            ]
          },
          {
            model: RequesterDetails,
            as: "RequesterDetail",
          },
        ],
        order: [["created_at", "DESC"]],
      });
    }
    if (!tickets || tickets.length === 0) {
      return res.status(404).json({ message: "No assigned tickets found." });
    }
    const response = tickets.map((ticket) => {
      const t = ticket.toJSON();
      t.assignments = (t.assignments || [])
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
        .map((a) => ({
          assigned_to_id: a.assigned_to_id,
          assigned_to_name: a.assignedTo?.full_name || null,
          assigned_to_role: a.assignedTo?.role || null,
          reason: a.reason,
          action: a.action,
          created_at: a.created_at,
        }));
      // Debug: Log the RequesterDetail for each ticket
      console.log(
        "ASSIGNED DEBUG - Ticket ID:",
        t.id,
        "RequesterDetail:",
        t.RequesterDetail
      );
      return {
        ...t,
        created_by: user.full_name,
      };
    });

    res.status(200).json({
      message: "Assigned tickets fetched successfully",
      totalTickets: tickets.length,
      tickets: response,
    });
  } catch (error) {
    console.error("Error fetching assigned tickets:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// const getInprogressTickets = async (req, res) => {
//   try {
//     const { userId } = req.params; // Get userId from URL

//     if (!userId) {
//       return res.status(400).json({ message: "User ID is required" });
//     }

//     console.log("Fetching OPEN tickets for user ID:", userId);

//     // Fetch User details including role
//     const user = await User.findOne({
//       where: { id: userId },
//       attributes: ["id", "full_name", "role"], // Fetch ID, Name & Role
//     });

//     if (!user) {
//       return res.status(404).json({ message: "User not found" });
//     }

//     let tickets;

//     if (user.role === "super-admin" || user.role === "supervisor") {
//       // Super admin: Fetch all OPEN tickets
//       tickets = await Ticket.findAll({
//         where: {
//           assigned_to_id: userId,
//           status: {
//             [Op.in]: [
//               "Assigned",
//               "Open",
//               "Returned",
//               "Forwarded",
//               "In Progress",
//             ],
//           },
//         },
//         include: [
//           {
//             model: User,
//             as: "assignee",
//             attributes: ["id", "full_name", "email"],
//           },
//           {
//             model: TicketAssignment,
//             as: "assignments",
//             include: [
//               {
//                 model: User,
//                 as: "assignedTo",
//                 attributes: ["id", "full_name", "email"]
//               }
//             ]
//           },
//           {
//             model: RequesterDetails,
//             as: "RequesterDetail",
//           },
//         ],
//         order: [["created_at", "DESC"]],
//       });
//     } else {
//       // Agent: Fetch only OPEN tickets assigned to this agent
//       tickets = await Ticket.findAll({
//         where: {
//           assigned_to_id: userId,
//           status: {
//             [Op.in]: [
//               "Assigned",
//               "Open",
//               "Returned",
//               "Forwarded",
//               "In Progress",
//             ],
//           },
//         },
//         include: [
//           {
//             model: User,
//             as: "assignee",
//             attributes: ["id", "full_name", "email"],
//           },
//           {
//             model: TicketAssignment,
//             as: "assignments",
//             include: [
//               {
//                 model: User,
//                 as: "assignedTo",
//                 attributes: ["id", "full_name", "email"]
//               }
//             ]
//           },
//           {
//             model: RequesterDetails,
//             as: "RequesterDetail",
//           },
//         ],
//         order: [["created_at", "DESC"]],
//       });
//     }

//     if (tickets.length === 0) {
//       return res.status(404).json({ message: "No In progress tickets found." });
//     }

//     // Modify response to include created_by (user.name) and assignment history
//     const response = tickets.map((ticket) => {
//       const t = ticket.toJSON();
//       t.assignments = (t.assignments || [])
//         .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
//         .map((a) => ({
//           assigned_to_id: a.assigned_to_id,
//           assigned_to_name: a.assignedTo?.full_name || null,
//           assigned_to_role: a.assignedTo?.role || null,
//           reason: a.reason,
//           action: a.action,
//           created_at: a.created_at,
//         }));
//       // Debug: Log the RequesterDetail for each ticket
//       console.log(
//         "INPROGRESS DEBUG - Ticket ID:",
//         t.id,
//         "RequesterDetail:",
//         t.RequesterDetail
//       );
//       return {
//         ...t,
//         created_by: user.full_name,
//       };
//     });

//     res.status(200).json({
//       message: "Open tickets fetched successfully",
//       totalTickets: tickets.length,
//       tickets: response,
//     });
//   } catch (error) {
//     console.error("Error fetching open tickets:", error);
//     res.status(500).json({ message: "Server error", error: error.message });
//   }
// };






const getInprogressTickets = async (req, res) => {
  try {
    const { userId } = req.params; // Get userId from URL

    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    console.log("Fetching OPEN tickets for user ID:", userId);

    // Fetch User details including role
    const user = await User.findOne({
      where: { id: userId },
      attributes: ["id", "full_name", "role"], // Fetch ID, Name & Role
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    let tickets;

    if (user.role === "super-admin" || user.role === "supervisor") {
      // Super admin: Fetch all OPEN tickets
      tickets = await Ticket.findAll({
        where: {
          // assigned_to_id: userId,
          status: {
            [Op.in]: [
              "Assigned",
              "Open",
              "Returned",
              "Forwarded",
              "In Progress",
              "Attended and Recommended",
              "Reversed",
            ],
          },
        },
        include: [
          {
            model: User,
            as: "assignee",
            attributes: ["id", "full_name", "email"],
          },
          {
            model: TicketAssignment,
            as: "assignments",
            include: [
              {
                model: User,
                as: "assignedTo",
                attributes: ["id", "full_name", "email"]
              }
            ]
          },
          {
            model: RequesterDetails,
            as: "RequesterDetail",
          },
        ],
        order: [["created_at", "DESC"]],
      });
    } else {
      // Agent and other roles: Fetch OPEN tickets assigned to this user
      // Include "Attended and Recommended" as these are in-progress tickets
      tickets = await Ticket.findAll({
        where: {
          assigned_to_id: userId,
          status: {
            [Op.in]: [
              "Assigned",
              "Open",
              "Returned",
              "Forwarded",
              "In Progress",
              "Attended and Recommended",
              "Reversed",
            ],
          },
        },
        include: [
          {
            model: User,
            as: "assignee",
            attributes: ["id", "full_name", "email"],
          },
          {
            model: TicketAssignment,
            as: "assignments",
            include: [
              {
                model: User,
                as: "assignedTo",
                attributes: ["id", "full_name", "email"]
              }
            ]
          },
          {
            model: RequesterDetails,
            as: "RequesterDetail",
          },
        ],
        order: [["created_at", "DESC"]],
      });
    }

    if (tickets.length === 0) {
      return res.status(404).json({ message: "No In progress tickets found." });
    }

    // Modify response to include created_by (user.name) and assignment history
    const response = tickets.map((ticket) => {
      const t = ticket.toJSON();
      t.assignments = (t.assignments || [])
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
        .map((a) => ({
          assigned_to_id: a.assigned_to_id,
          assigned_to_name: a.assignedTo?.full_name || null,
          assigned_to_role: a.assignedTo?.role || null,
          reason: a.reason,
          action: a.action,
          created_at: a.created_at,
        }));
      // Debug: Log the RequesterDetail for each ticket
      console.log(
        "INPROGRESS DEBUG - Ticket ID:",
        t.id,
        "RequesterDetail:",
        t.RequesterDetail
      );
      return {
        ...t,
        created_by: user.full_name,
      };
    });

    res.status(200).json({
      message: "Open tickets fetched successfully",
      totalTickets: tickets.length,
      tickets: response,
    });
  } catch (error) {
    console.error("Error fetching open tickets:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};



const getCarriedForwardTickets = async (req, res) => {
  try {
    const { userId } = req.params; // Get userId from URL

    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    console.log("Fetching OPEN tickets for user ID:", userId);

    // Fetch User details including role
    const user = await User.findOne({
      where: { id: userId },
      attributes: ["id", "full_name", "role"], // Fetch ID, Name & Role
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    let tickets;

    if (user.role === "super-admin" || user.role === "supervisor") {
      // Super admin and supervisor: Fetch all carried forward tickets
      tickets = await Ticket.findAll({
        where: { status: "Carried Forward" }, // Filter by status
        attributes: { exclude: ["userId"] },
        include: [
          {
            model: User,
            as: "assignee",
            attributes: ["id", "full_name", "email"],
          },
          {
            model: TicketAssignment,
            as: "assignments",
            include: [
              {
                model: User,
                as: "assignedTo",
                attributes: ["id", "full_name", "email"]
              }
            ]
          },
          {
            model: RequesterDetails,
            as: "RequesterDetail",
          },
        ],
        order: [["created_at", "DESC"]],
      });
    } else {
      // Agent: Fetch only carried forward tickets created by this agent
      tickets = await Ticket.findAll({
        where: { userId, status: "Carried Forward" }, // Filter by userId and status
        include: [
          {
            model: User,
            as: "assignee",
            attributes: ["id", "full_name", "email"],
          },
          {
            model: TicketAssignment,
            as: "assignments",
            include: [
              {
                model: User,
                as: "assignedTo",
                attributes: ["id", "full_name", "email"]
              }
            ]
          },
          {
            model: RequesterDetails,
            as: "RequesterDetail",
          },
        ],
        order: [["created_at", "DESC"]],
      });
    }

    if (tickets.length === 0) {
      return res.status(404).json({ message: "No open tickets found." });
    }

    // Modify response to include created_by (user.name) and assignment history
    const response = tickets.map((ticket) => {
      const t = ticket.toJSON();
      t.assignments = (t.assignments || [])
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
        .map((a) => ({
          assigned_to_id: a.assigned_to_id,
          assigned_to_name: a.assignedTo?.full_name || null,
          assigned_to_role: a.assignedTo?.role || null,
          reason: a.reason,
          action: a.action,
          created_at: a.created_at,
        }));
      // Debug: Log the RequesterDetail for each ticket
      console.log(
        "CARRIED FORWARD DEBUG - Ticket ID:",
        t.id,
        "RequesterDetail:",
        t.RequesterDetail
      );
      return {
        ...t,
        created_by: user.full_name,
      };
    });

    res.status(200).json({
      message: "Carried forward tickets fetched successfully",
      totalTickets: tickets.length,
      tickets: response,
    });
  } catch (error) {
    console.error("Error fetching Carried forward tickets:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getClosedTickets = async (req, res) => {
  try {
    const { userId } = req.params; // Get userId from URL

    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    console.log("Fetching Closed tickets for user ID:", userId);

    // Fetch User details including role
    const user = await User.findOne({
      where: { id: userId },
      attributes: ["id", "full_name", "role"], // Fetch ID, Name & Role
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    let tickets;

    if (user.role === "super-admin" || user.role === "supervisor") {
      // Super admin and supervisor: Fetch all Closed tickets
      tickets = await Ticket.findAll({
        where: { status: "Closed" }, // Filter by status
        attributes: { exclude: ["userId"] },
        include: [
          {
            model: User,
            as: "assignee",
            attributes: ["id", "full_name", "email"],
          },
          {
            model: TicketAssignment,
            as: "assignments",
            include: [
              {
                model: User,
                as: "assignedTo",
                attributes: ["id", "full_name", "email"]
              }
            ]
          },
          {
            model: RequesterDetails,
            as: "RequesterDetail",
          },
        ],
        order: [["created_at", "DESC"]],
      });
    } else {
      // Only tickets closed by this user
      tickets = await Ticket.findAll({
        where: {
          attended_by_id: userId,
          status: "Closed",
        },
        include: [
          {
            model: User,
            as: "assignee",
            attributes: ["id", "full_name", "email"],
          },
          {
            model: TicketAssignment,
            as: "assignments",
            include: [
              {
                model: User,
                as: "assignedTo",
                attributes: ["id", "full_name", "email"]
              }
            ]
          },
          {
            model: RequesterDetails,
            as: "RequesterDetail",
          },
        ],
        order: [["created_at", "DESC"]],
      });
    }

    if (tickets.length === 0) {
      return res.status(404).json({ message: "No closed tickets found." });
    }

    // Modify response to include created_by (user.name) and assignment history
    const response = tickets.map((ticket) => {
      const t = ticket.toJSON();
      t.assignments = (t.assignments || [])
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
        .map((a) => ({
          assigned_to_id: a.assigned_to_id,
          assigned_to_name: a.assignedTo?.full_name || null,
          assigned_to_role: a.assignedTo?.role || null,
          reason: a.reason,
          action: a.action,
          created_at: a.created_at,
        }));
      // Debug: Log the RequesterDetail for each ticket
      console.log(
        "CLOSED DEBUG - Ticket ID:",
        t.id,
        "RequesterDetail:",
        t.RequesterDetail
      );
      return {
        ...t,
        created_by: user.full_name,
      };
    });

    res.status(200).json({
      message: "Carried closed fetched successfully",
      totalTickets: tickets.length,
      tickets: response,
    });
  } catch (error) {
    console.error("Error fetching closed tickets:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getOverdueTickets = async (req, res) => {
  try {
    const { userId } = req.params; // Get userId from URL

    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    console.log("Fetching escalated tickets for user ID:", userId);

    // Fetch User details including role
    const user = await User.findOne({
      where: { id: userId },
      attributes: ["id", "full_name", "role"] // Fetch ID, Name & Role
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    let tickets;

    if (user.role === "super-admin" || user.role === "supervisor") {
      // Super admin: Fetch all escalated tickets
      tickets = await Ticket.findAll({
        where: {
          status: { [Op.in]: ["Escalated", ""] }
        },
        include: [
          {
            model: User,
            as: "assignee",
            attributes: ["id", "full_name", "email"]
          },
          {
            model: TicketAssignment,
            as: "assignments",
            include: [
              {
                model: User,
                as: "assignedTo",
                attributes: ["id", "full_name", "email"]
              }
            ]
          },
          {
            model: RequesterDetails,
            as: "RequesterDetail"
          }
        ],
        order: [["created_at", "ASC"]]
      });
    } else {
      // Agent: Find tickets that were escalated FROM this user using TicketAssignment
      const escalatedAssignments = await TicketAssignment.findAll({
        where: {
          assigned_to_id: userId,
          action: 'Escalated'
        },
        attributes: ['ticket_id'],
        group: ['ticket_id']
      });
      
      const escalatedTicketIds = escalatedAssignments.map(a => a.ticket_id);
      
      if (escalatedTicketIds.length === 0) {
        return res.status(404).json({ message: "No escalated tickets found." });
      }

      tickets = await Ticket.findAll({
        where: {
          id: { [Op.in]: escalatedTicketIds },
          status: { [Op.ne]: 'Closed' } // Include all statuses except Closed
        },
        include: [
          {
            model: User,
            as: "assignee",
            attributes: ["id", "full_name", "email"]
          },
          {
            model: TicketAssignment,
            as: "assignments",
            include: [
              {
                model: User,
                as: "assignedTo",
                attributes: ["id", "full_name", "email"]
              }
            ]
          },
          {
            model: RequesterDetails,
            as: "RequesterDetail"
          }
        ],
        order: [["created_at", "ASC"]]
      });
    }

    if (tickets.length === 0) {
      return res.status(404).json({ message: "No escalated tickets found." });
    }

    // Modify response to include created_by (user.name) and assignment history
    const response = tickets.map((ticket) => {
      const t = ticket.toJSON();
      t.assignments = (t.assignments || [])
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
        .map((a) => ({
          assigned_to_id: a.assigned_to_id,
          assigned_to_name: a.assignedTo?.full_name || null,
          assigned_to_role: a.assignedTo?.role || null,
          reason: a.reason,
          action: a.action,
          created_at: a.created_at
        }));
      // Debug: Log the RequesterDetail for each ticket
      console.log("ESCALATED DEBUG - Ticket ID:", t.id, "RequesterDetail:", t.RequesterDetail);
      return {
        id: t.id, // Assignment ID (using ticket ID as assignment ID)
        ticket: {
          ...t,
          created_by: user.full_name
        }
      };
    });

    res.status(200).json({
      message: "Escalated tickets fetched successfully",
      totalTickets: tickets.length,
      assignments: response
    });
  } catch (error) {
    console.error("Error fetching escalated tickets:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};
const getAllCustomersTickets = async (req, res) => {
  try {
    const tickets = await Ticket.findAll({
      order: [["created_at", "DESC"]],
      include: [
        {
          model: Section,
          as: "responsibleSection",
          attributes: ["id", "name"],
          include: [
            {
              model: Function,
              as: "functions",
              attributes: ["id", "name"],
              include: [
                {
                  model: FunctionData,
                  as: "functionData",
                  attributes: ["id", "name"],
                },
              ],
            },
          ],
        },
        {
          model: User,
          as: "creator",
          attributes: ["id", "full_name", "email"],
        },
        {
          model: User,
          as: "assignee",
          attributes: ["id", "full_name", "email"],
        },
        {
          model: User,
          as: "attendedBy",
          attributes: ["id", "full_name", "email"],
        },
        {
          model: User,
          as: "ratedBy",
          attributes: ["id", "full_name", "email"],
        },
        // Commented out for simplicity (can be re-added if needed)
        // {
        //   model: User,
        //   as: 'convertedBy',
        //   attributes: ['id', 'full_name', 'email']
        // },
        // {
        //   model: User,
        //   as: 'forwardedBy',
        //   attributes: ['id', 'full_name', 'email']
        // }
      ],
    });

    return res.status(200).json({
      message: "Tickets fetched successfully",
      totalTickets: tickets.length,
      tickets,
    });
  } catch (error) {
    console.error("Error fetching tickets:", error.stack);
    return res
      .status(500)
      .json({ message: "Server error", error: error.message });
  }
};

// for status on dashboard of agent
const getAllTickets = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }
    console.log("Fetching All tickets for user ID:", userId);
    const user = await User.findOne({
      where: { id: userId },
      attributes: ["id", "full_name", "role"],
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    let tickets;

    if (user.role === "super-admin" || user.role === "supervisor") {
      // Super-admin and supervisor see all tickets
      tickets = await Ticket.findAll({
        attributes: { exclude: ["userId"] },
        include: [
          {
            model: Section,
            as: "responsibleSection",
            attributes: ["id", "name"],
            include: [
              {
                model: Function,
                as: "functions",
                attributes: ["id", "name"],
                include: [
                  {
                    model: FunctionData,
                  as: "functionData",
                  attributes: ["id", "name"],
                  },
                ],
              },
            ],
          },
          {
            model: User,
            as: "creator",
            attributes: ["id", "full_name", "email"],
          },
          {
            model: User,
            as: "assignee",
            attributes: ["id", "full_name", "email"],
          },
          {
            model: TicketAssignment,
            as: "assignments",
            include: [
              {
                model: User,
                as: "assignedTo",
                attributes: ["id", "full_name", "email"]
              }
            ]
          },
          {
            model: RequesterDetails,
            as: "RequesterDetail",
          },
          {
            model: TicketUpdate,
            as: "updates",
            attributes: ["id", "ticket_id", "user_id", "user_name", "user_role", "update_text", "update_date", "is_active", "assignment_id", "created_at", "updated_at"],
            separate: true,
            order: [["update_date", "DESC"]],
            include: [
              {
                model: User,
                as: "user",
                attributes: ["id", "full_name", "email", "role"],
              }
            ]
          },
        ],
        order: [["created_at", "DESC"]],
      });
    } else {
      // For all other roles (including head-of-unit, director, manager, focal-person, attendee, etc.)
      // Show only tickets created by this user (Total Opened by Me)
      tickets = await Ticket.findAll({
        where: { 
          [Op.or]: [
            { userId: userId },
            { created_by: userId }
          ]
        },
        attributes: { exclude: ["userId"] },
        include: [
          {
            model: Section,
            as: "responsibleSection",
            attributes: ["id", "name"],
            include: [
              {
                model: Function,
                as: "functions",
                attributes: ["id", "name"],
                include: [
                  {
                    model: FunctionData,
                  as: "functionData",
                  attributes: ["id", "name"],
                  },
                ],
              },
            ],
          },
          {
            model: User,
            as: "creator",
            attributes: ["id", "full_name", "email"],
          },
          {
            model: User,
            as: "assignee",
            attributes: ["id", "full_name", "email"],
          },
          {
            model: TicketAssignment,
            as: "assignments",
            include: [
              {
                model: User,
                as: "assignedTo",
                attributes: ["id", "full_name", "email"]
              }
            ]
          },
          {
            model: RequesterDetails,
            as: "RequesterDetail",
          },
          {
            model: TicketUpdate,
            as: "updates",
            attributes: ["id", "ticket_id", "user_id", "user_name", "user_role", "update_text", "update_date", "is_active", "assignment_id", "created_at", "updated_at"],
            separate: true,
            order: [["update_date", "DESC"]],
            include: [
              {
                model: User,
                as: "user",
                attributes: ["id", "full_name", "email", "role"],
              }
            ]
          },
        ],
        order: [["created_at", "DESC"]],
      });
    }

    if (tickets.length === 0) {
      return res
        .status(404)
        .json({ message: "No tickets found for this user." });
    }

    const response = tickets.map((ticket) => {
      const t = ticket.toJSON();
      t.assignments = (t.assignments || [])
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
        .map((a) => ({
          assigned_to_id: a.assigned_to_id,
          assigned_to_name: a.assignee?.full_name || "N/A",
          assigned_to_role: a.assignee?.role || "N/A",
          action: a.action,
          reason: a.reason || t.description,
          created_at: a.created_at,
        }));
      return {
        ...t,
        created_by: user.full_name,
      };
    });
    console.log("all ticket", response);
    res.status(200).json({
      message: "All tickets fetched successfully",
      totalTickets: tickets.length,
      tickets: response,
    });
  } catch (error) {
    console.error("Error fetching all tickets:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Mock function to simulate complaint workflow
const mockComplaintWorkflow = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { action, userId } = req.body;

    // Mock ticket data
    const mockTicket = {
      id: ticketId,
      category: "complaint",
      status: "pending",
      complaint_rating: null,
      complaint_type: null,
      assigned_to_id: null,
      attended_by_id: null,
      recommendation: null,
      evidence_url: null,
      review_notes: null,
      approval_notes: null,
    };

    // Mock workflow actions
    switch (action) {
      case "rate":
        // Reviewer rates and assigns complaint
        mockTicket.complaint_rating = "minor";
        mockTicket.complaint_type = "unit";
        mockTicket.status = "assigned";
        mockTicket.assigned_to_id = userId;
        break;

      case "progress":
        // Head of Unit/Manager updates progress
        mockTicket.status = "in_progress";
        mockTicket.attended_by_id = userId;
        mockTicket.recommendation = "Working on resolution";
        break;

      case "recommend":
        // Attendee makes recommendation
        mockTicket.status = "recommended";
        mockTicket.recommendation = "Proposed solution";
        mockTicket.evidence_url = "https://example.com/evidence.pdf";
        break;

      case "review":
        // Head of Unit/Manager reviews
        mockTicket.status = "reviewed";
        mockTicket.review_notes = "Review completed";
        break;

      case "approve":
        // DG approves
        mockTicket.status = "approved";
        mockTicket.approval_notes = "Approved by DG";
        mockTicket.closed_at = new Date();
        break;

      case "reverse":
        // Any approver can reverse
        mockTicket.status = "reversed";
        mockTicket.review_notes = "Reversed for further review";
        break;

      case "convert":
        // Reviewer converts to inquiry
        mockTicket.category = "inquiry";
        mockTicket.status = "pending";
        break;

      default:
        return res.status(400).json({ message: "Invalid action" });
    }

    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 500));

    res.json({
      message: `Complaint ${action} completed successfully`,
      ticket: mockTicket,
    });
  } catch (error) {
    console.error("Error in mock workflow:", error);
    res.status(500).json({ message: "Error in mock workflow" });
  }
};

const searchByPhoneNumber = async (req, res) => {
  try {
    let { phoneNumber } = req.params;
    if (!phoneNumber) {
      return res.status(400).json({ message: "Phone number is required" });
    }
    // Normalize phone number for Tanzanian format
    let normalized = phoneNumber.replace(/[^0-9]/g, "");
    if (normalized.startsWith("0")) normalized = "255" + normalized.slice(1);
    if (normalized.length === 9) normalized = "255" + normalized;
    const plusFormat = "+255" + normalized.slice(-9);
    const plainFormat = "255" + normalized.slice(-9);
    // Search for all common formats
    const tickets = await Ticket.findAll({
      where: {
        [Op.or]: [
          { phone_number: phoneNumber },
          { phone_number: normalized },
          { phone_number: plusFormat },
          { phone_number: plainFormat },
          { phone_number: { [Op.like]: `%${normalized.slice(-9)}` } },
          { nida_number: phoneNumber },
        ],
      },
      order: [["created_at", "DESC"]],
      include: [
        {
          model: User,
          as: "creator",
          attributes: ["id", "full_name", "role"],
        },
        {
          model: User,
          as: "attendedBy",
          attributes: ["id", "full_name", "role"],
          required: false,
        },
      ],
    });
    if (tickets.length === 0) {
      return res.status(200).json({
        found: false,
        message: "No tickets found for this phone number",
      });
    }
    return res.status(200).json({
      found: true,
      message: "Tickets found successfully",
      tickets: tickets,
    });
  } catch (error) {
    console.error("Error searching tickets by phone number:", error);
    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

const searchByTicketId = async (req, res) => {
  try {
    const { ticketId } = req.params;
    
    if (!ticketId) {
      return res.status(400).json({ 
        success: false,
        message: "Ticket ID is required" 
      });
    }

    // Search by ticket_id (the formatted ticket number like WCF-CC-20251226-000002)
    const ticket = await Ticket.findOne({
      where: { ticket_id: ticketId },
      include: [
        {
          model: User,
          as: "creator",
          attributes: ["id", "full_name", "role"],
        },
        {
          model: User,
          as: "attendedBy",
          attributes: ["id", "full_name", "role"],
          required: false,
        },
      ],
    });

    if (!ticket) {
      return res.status(200).json({
        success: false,
        message: "Ticket not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Ticket found successfully",
      ticket: ticket,
    });
  } catch (error) {
    console.error("Error searching ticket by ticket_id:", error);
    return res.status(500).json({ 
      success: false,
      message: "Internal server error", 
      error: error.message 
    });
  }
};

const getTicketById = async (req, res) => {
  try {
    const { ticketId } = req.params;

    if (!ticketId) {
      return res.status(400).json({
        success: false,
        message: "Ticket ID is required",
        details: {
          missing_field: "ticketId",
          suggestion:
            "Please provide a valid ticket ID in the request parameters",
        },
      });
    }

    const ticket = await Ticket.findOne({
      where: { id: ticketId },
      include: [
        {
          model: Section,
            as: "responsibleSection",
            attributes: ["id", "name"],
          include: [
            {
              model: Function,
                as: "functions",
                attributes: ["id", "name"],
              include: [
                {
                  model: FunctionData,
                  as: "functionData",
                  attributes: ["id", "name"],
                },
              ],
            },
          ],
        },
        {
          model: User,
          as: "creator",
          attributes: ["id", "full_name", "username"],
        },
        {
          model: User,
          as: "assignee",
          attributes: ["id", "full_name", "role"],
        },
        {
          model: User,
          as: "attendedBy",
          attributes: ["id", "full_name", "email"],
        },
        {
          model: User,
          as: "ratedBy",
          attributes: ["id", "full_name", "email"],
        },
        {
          model: User,
          as: "convertedBy",
          attributes: ["id", "full_name", "email"],
        },
        {
          model: User,
          as: "forwardedBy",
          attributes: ["id", "full_name", "email"],
        },
        {
          model: TicketAssignment,
          as: "assignments",
          include: [
            {
              model: User,
              as: "assignedTo",
              attributes: ["id", "full_name", "email"]
            }
          ],
          order: [["created_at", "DESC"]],
        },
        {
          model: RequesterDetails,
          as: "RequesterDetail",
        },
      ],
    });

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: "Ticket not found",
        details: {
          ticket_id: ticketId,
          suggestion:
            "Please check the ticket ID and ensure the ticket exists in the system",
        },
      });
    }
    // Debug: Log the RequesterDetail association
    console.log("RequesterDetail", ticket?.RequesterDetail);
    return res.status(200).json({ ticket: ticket.toJSON() });
  } catch (error) {
    console.error("Error fetching ticket:", error);
    return res
      .status(500)
      .json({ message: "Server error", error: error.message });
  }
};

// Helper to notify all users with a given role when ticket closed
async function notifyUsersByRole(
  roles,
  subject,
  htmlBody,
  ticketId,
  senderId,
  message
) {
  const users = await User.findAll({ where: { role: roles } });
  // Fetch sender's role for channel
  let senderRole = "system";
  if (senderId) {
    const senderUser = await User.findOne({ where: { id: senderId } });
    if (senderUser && senderUser.role) senderRole = senderUser.role;
  }
  
  // Fetch ticket to get attachments
  let ticket = null;
  let attachments = [];
  if (ticketId) {
    try {
      ticket = await Ticket.findByPk(ticketId);
      if (ticket) {
        attachments = getTicketAttachments(ticket);
      }
    } catch (error) {
      console.error("Error fetching ticket for attachments:", error);
    }
  }
  
  for (const user of users) {
    if (user.email) {
      setImmediate(() => {
        sendEmail({
          // to: [user.email, "grace.tarimo@wcf.go.tz"],
          to:`grace.tarimo@wcf.go.tz`,
          subject,
          htmlBody,
          attachments: attachments,
        }).catch((e) =>
          console.error("Error sending notifyUsersByRole email:", e.message)
        );
      });
    }
    try {
    await Notification.create({
      ticket_id: ticketId,
      sender_id: senderId,
      recipient_id: user.id,
      message,
      status: "unread",
      channel: senderRole,
    });
      console.log(`✅ Notification created for ${user.role} ${user.id} for ticket ${ticketId}`);
    } catch (notifError) {
      console.error(`❌ Error creating notification for ${user.role} ${user.id}:`, notifError);
      // Don't fail the whole operation if notification creation fails
    }
  }
}

const closeTicket = async (req, res) => {
  console.log("🔵 ========== CLOSE TICKET STARTED ==========");
  console.log("🔵 Request params:", req.params);
  console.log("🔵 Request body:", req.body);
  console.log("🔵 Request file:", req.file);
  
  try {
    const { ticketId } = req.params;
    const { resolution_details, userId, resolution_type } = req.body;
    const { deactivateUserUpdates } = require('./ticketUpdateController');

    console.log("🔵 Extracted values:");
    console.log("  - ticketId:", ticketId);
    console.log("  - userId:", userId);
    console.log("  - resolution_details:", resolution_details);
    console.log("  - resolution_type:", resolution_type);

    if (!ticketId) {
      console.log("❌ ERROR: Ticket ID is missing");
      return res.status(400).json({ message: "Ticket ID is required" });
    }

    if (!userId) {
      console.log("❌ ERROR: User ID is missing");
      return res.status(400).json({ message: "User ID is required" });
    }

    console.log("🔵 Fetching ticket from database...");
    const ticket = await Ticket.findOne({
      where: { id: ticketId },
      include: [
        {
          model: User,
          as: "creator",
          attributes: ["id", "full_name", "email"],
        },
        {
          model: RequesterDetails,
          as: "RequesterDetail",
        },
        {
          model: Employer,
          as: "employer",
        },
      ],
    });

    if (!ticket) {
      console.log("❌ ERROR: Ticket not found with ID:", ticketId);
      return res.status(404).json({ message: "Ticket not found" });
    }
    
    console.log("✅ Ticket found:");
    console.log("  - Ticket ID:", ticket.ticket_id);
    console.log("  - Status:", ticket.status);
    console.log("  - Category:", ticket.category);
    console.log("  - Creator:", ticket.creator ? ticket.creator.full_name : "N/A");
    console.log("  - Requester:", ticket.requester);
    console.log("  - First Name:", ticket.first_name);
    console.log("  - Last Name:", ticket.last_name);
    console.log("  - Representative Name:", ticket.representative_name);
    console.log("  - Institution:", ticket.institution);
    console.log("  - Full Ticket Data:", JSON.stringify(ticket.toJSON(), null, 2));

    // Handle attachment if uploaded
    let attachmentPath = null;
    if (req.file) {
      attachmentPath = `ticket_attachments/${req.file.filename}`; // Save relative path
      console.log("✅ Attachment uploaded:", attachmentPath);
    } else {
      console.log("🔵 No attachment uploaded");
    }

    // Update ticket status and add resolution details
    console.log("🔵 Updating ticket status to Closed...");
    const updateData = {
      status: "Closed",
      resolution_details: resolution_details || "Ticket closed by agent",
      resolution_type: resolution_type || "Resolved",
      attachment_path: attachmentPath, // Save attachment path to ticket
      date_of_resolution: new Date(),
      attended_by_id: userId,
    };
    console.log("🔵 Update data:", updateData);
    
    await ticket.update(updateData);
    console.log("✅ Ticket updated successfully");

    // Fetch attended_by user name and role
    console.log("🔵 Fetching attended_by user...");
    let attended_by_name = null;
    let attended_by_role = null;
    if (userId) {
      const attendedByUser = await User.findOne({ where: { id: userId } });
      if (attendedByUser) {
        attended_by_name = attendedByUser.full_name;
        attended_by_role = attendedByUser.role;
        console.log("✅ Attended by user found:", attended_by_name, "Role:", attended_by_role);
      } else {
        console.log("⚠️ WARNING: Attended by user not found for userId:", userId);
      }
    } else {
      console.log("⚠️ WARNING: userId is null or undefined");
    }

    // Check if this is a Minor or Major complaint
    const isMinorOrMajorComplaint = ticket.category === "Complaint" && 
                                    (ticket.complaint_type === "Minor" || ticket.complaint_type === "Major");
    
    // Notify all reviewers and supervisors
    console.log("🔵 Preparing notifications for reviewers and supervisors...");
    try {
    const notifySubject = `Ticket Closed: ${ticket.subject}`;
    const notifyBody = `
        <p>A ticket has been closed successfully by ${attended_by_name || "Unknown"} (${attended_by_role || "Unknown Role"}). Here are the details:</p>
    `;
    const notifyDetails = `
      <ul>
        <li><strong>Ticket ID:</strong> ${ticket.ticket_id}</li>
        <li><strong>Subject:</strong> ${ticket.subject}</li>
        <li><strong>Category:</strong> ${ticket.category}</li>
        <li><strong>Description:</strong> ${ticket.description}</li>
        <li><strong>Requester:</strong> ${getRequesterDisplayName(ticket)}</li>
        <li><strong>Closed By:</strong> ${attended_by_name || "Unknown"} (${attended_by_role || "Unknown Role"})</li>
        <li><strong>Resolution Type:</strong> ${resolution_type || "Resolved"}</li>
        <li><strong>Resolution Details:</strong> ${resolution_details || "Ticket closed by agent"}</li>
        <li><strong>Closed Date:</strong> ${new Date().toLocaleString()}</li>
      </ul>
    `;
    
    const { renderEmailCard } = require('../../services/emailService');
    const notifyHtml = renderEmailCard(notifySubject, notifyBody, notifyDetails);
      const categoryText = ticket.category ? ` (${ticket.category})` : '';
      const notifyMsg = `Ticket ${ticket.ticket_id}${categoryText} has been closed by ${
      attended_by_name || "Unknown"
    } (${attended_by_role || "Unknown Role"}).`;
      
      console.log("🔵 Calling notifyUsersByRole...");
      
      // Send notifications to supervisors always
      await notifyUsersByRole(
        ["supervisor"],
        notifySubject,
        notifyHtml,
        ticketId,
        userId,
        notifyMsg
      );

      // Send notifications to reviewers ONLY if it's a Minor or Major (including Inquiry rated Minor/Major)
      const isMinorOrMajor = (ticket.complaint_type === "Minor" || ticket.complaint_type === "Major");
      if (isMinorOrMajor) {
        console.log(`🔵 Ticket is ${ticket.complaint_type} (category: ${ticket.category}) - sending email to reviewers`);
        await notifyUsersByRole(
          ["reviewer"],
          notifySubject,
          notifyHtml,
          ticketId,
          userId,
          notifyMsg
        );
        console.log("✅ Notifications sent to reviewers for Minor/Major complaint");
      } else {
        console.log(`🔵 Ticket is not Minor/Major complaint (category: ${ticket.category}, type: ${ticket.complaint_type}) - skipping reviewer email`);
      }
      
      console.log("✅ Notifications sent to supervisors");
    } catch (notifyError) {
      console.error("❌ ERROR in notifyUsersByRole:", notifyError);
      console.error("❌ Error stack:", notifyError.stack);
      // Continue execution even if notification fails
    }

    // --- Email to Supervisors (Head of Unit/Manager + General Supervisor) for ticket closure ---
    console.log("🔵 Finding supervisors for section:", ticket.section);
    try {
    const supervisors = await findSupervisorForSection(ticket.section);
    if (supervisors && supervisors.length > 0) {
        console.log("✅ Found supervisors:", supervisors.length);
      const supervisorEmailSubject = `Ticket Closed: ${ticket.subject} (ID: ${ticket.ticket_id})`;
      
      // Send email to each supervisor
      for (const supervisor of supervisors) {
        const supervisorBodyHtml = `<p>Dear ${supervisor.full_name},</p><p>A ticket has been closed in your unit/section.</p>`;
        const supervisorDetailsHtml = `
          <ul>
            <li><strong>Ticket ID:</strong> ${ticket.ticket_id}</li>
            <li><strong>Subject:</strong> ${ticket.subject}</li>
            <li><strong>Category:</strong> ${ticket.category}</li>
            <li><strong>Description:</strong> ${ticket.description}</li>
            <li><strong>Requester:</strong> ${getRequesterDisplayName(ticket)}</li>
            <li><strong>Assigned To:</strong> ${ticket.assigned_to_name || "Unknown"}</li>
            <li><strong>Section/Unit:</strong> ${ticket.section}</li>
            <li><strong>Closed By:</strong> ${attended_by_name || "Unknown"} (${attended_by_role || "Unknown Role"})</li>
            <li><strong>Resolution Type:</strong> ${resolution_type || "Resolved"}</li>
            <li><strong>Resolution Details:</strong> ${resolution_details || "Ticket closed by agent"}</li>
            <li><strong>Closed Date:</strong> ${new Date().toLocaleString()}</li>
          </ul>`;
        const supervisorEmailHtmlBody = renderEmailCard(supervisorEmailSubject, supervisorBodyHtml, supervisorDetailsHtml);
          
          // Get attachments for email
          const attachments = getTicketAttachments(ticket);
        
        // Send email in background to avoid blocking
        sendEmailNonBlocking({
          to: "grace.tarimo@wcf.go.tz", // For testing, replace with supervisor.email in production
          subject: supervisorEmailSubject,
          htmlBody: supervisorEmailHtmlBody,
            attachments: attachments,
        });
        console.log(`✅ Closure email queued for ${supervisor.role} ${supervisor.full_name} for ticket ${ticket.ticket_id}`);
      }
    } else {
      console.log(`⚠️ No supervisors found for section: ${ticket.section || ticket.responsible_unit_name}`);
      }
    } catch (supervisorError) {
      console.error("❌ ERROR in findSupervisorForSection:", supervisorError);
      console.error("❌ Error stack:", supervisorError.stack);
      // Continue execution even if supervisor finding fails
    }

    // Notify the creator/requester by SMS, email, and in-system notification
    if (ticket.creator) {
      // Create in-system notification for creator
      const categoryText = ticket.category ? ` (${ticket.category})` : '';
      const creatorNotificationMsg = `Your ticket ${ticket.ticket_id}${categoryText} has been closed and resolved.`;
      
      try {
        await Notification.create({
          ticket_id: ticketId,
          sender_id: userId,
          recipient_id: ticket.creator.id,
          message: creatorNotificationMsg,
          channel: "In-System",
          status: "unread",
        });
        console.log(`✅ In-system notification sent to creator (${ticket.creator.full_name}) for ticket ${ticket.ticket_id}`);
      } catch (notificationError) {
        console.error("Error creating notification for creator:", notificationError.message);
        // Continue even if notification fails
      }

      // Send SMS notification to ticket requester (if phone number is available)
      // Use the same logic as when creating ticket to extract phone number
      let ticketPhoneNumber = null;
      
      // Extract phone number based on requester type (same logic as create ticket)
      if (ticket.requester === "Employer") {
        // For Employer: get phone from employer.phone or ticket.phone_number
        if (ticket.employer && ticket.employer.phone) {
          ticketPhoneNumber = ticket.employer.phone;
        } else {
          ticketPhoneNumber = ticket.phone_number || null;
        }
      } else if (ticket.requester === "Representative") {
        // For Representative: get phone from RequesterDetail or ticket.phone_number
        if (ticket.RequesterDetail && ticket.RequesterDetail.phone_number) {
          ticketPhoneNumber = ticket.RequesterDetail.phone_number;
        } else {
          ticketPhoneNumber = ticket.phone_number || null;
        }
      } else {
        // For Employee, Pensioners, Stakeholders: use ticket.phone_number
        ticketPhoneNumber = ticket.phone_number || null;
      }
      
      // Fallback: try other fields if still null
      if (!ticketPhoneNumber) {
        ticketPhoneNumber = ticket.phoneNumber || ticket.phone || null;
        if (!ticketPhoneNumber && ticket.RequesterDetail) {
          ticketPhoneNumber = ticket.RequesterDetail.phone_number || ticket.RequesterDetail.phoneNumber || null;
        }
      }
      
      console.log(`🔍 Phone number extraction for ticket ${ticket.ticket_id}:`, {
        requester_type: ticket.requester,
        ticket_phone_number: ticket.phone_number,
        employer_phone: ticket.employer?.phone,
        requester_detail_phone: ticket.RequesterDetail?.phone_number,
        final_phone: ticketPhoneNumber
      });
      
      // Format phone number for SMS: use same format as create ticket
      // Ensure it starts with 255 and is followed by 9 digits
      if (ticketPhoneNumber && 
          ticketPhoneNumber !== "N/A" && 
          ticketPhoneNumber !== "n/a" && 
          ticketPhoneNumber !== "" && 
          ticketPhoneNumber !== null && 
          ticketPhoneNumber !== undefined) {
        
        let smsRecipient = String(ticketPhoneNumber || "")
          .replace(/^\+/, "")
          .replace(/^0/, "255");
        const isValidTzPhone = (num) => /^255\d{9}$/.test(num);
        
        // Get requester name for SMS
        const requesterFullName = getRequesterDisplayName(ticket);
        
        // Debug log for name extraction
        console.log(`🔍 Name extraction for closing ticket ${ticket.ticket_id}:`, {
          requester_type: ticket.requester,
          first_name: ticket.first_name,
          last_name: ticket.last_name,
          representative_name: ticket.representative_name,
          institution: ticket.institution,
          extracted_name: requesterFullName
        });
        
        // Only send SMS if phone is valid (same condition as create ticket)
        if (isValidTzPhone(smsRecipient)) {
          // Truncate resolution details if too long for SMS (SMS limit is usually 160 characters)
          const resolutionText = resolution_details ? 
            (resolution_details.length > 80 ? resolution_details.substring(0, 80) + '...' : resolution_details) : 
            '';
          const categoryText = ticket.category ? ` (${ticket.category})` : '';
          // Ensure requesterFullName is never empty
          const finalName = requesterFullName && requesterFullName.trim() ? requesterFullName.trim() : "Customer";
          const smsMessage = `Dear ${finalName}, your ticket (ID: ${ticket.ticket_id})${categoryText} has been closed and resolved.`;
          
          // Send SMS asynchronously to avoid blocking the response
          sendQuickSms({ message: smsMessage, recipient: smsRecipient })
            .then(() => {
              console.log(`✅ SMS sent successfully to ${smsRecipient} for ticket ${ticket.ticket_id} closure`);
            })
            .catch((smsError) => {
              console.error("Error sending closure SMS:", smsError.message);
            });
        } else {
          console.log(`⚠️ Not sending closure SMS, invalid phone format: ${smsRecipient} (original: ${ticketPhoneNumber})`);
        }
      } else {
        console.log(`⚠️ No valid phone number found for ticket ${ticket.ticket_id} (value: ${ticketPhoneNumber}), skipping SMS notification`);
      }

      // Send email notification if email is available
      if (ticket.creator.email) {
        const emailSubject = `Ticket Closed: ${ticket.subject}`;
        const emailBody = `
          <p>Dear ${ticket.creator.full_name},</p>
          <p>Your ticket has been closed successfully. Here are the details:</p>
        `;
        
        const detailsHtml = `
          <ul>
            <li><strong>Ticket ID:</strong> ${ticket.ticket_id}</li>
            <li><strong>Subject:</strong> ${ticket.subject}</li>
            <li><strong>Category:</strong> ${ticket.category}</li>
            <li><strong>Description:</strong> ${ticket.description}</li>
            <li><strong>Requester:</strong> ${getRequesterDisplayName(ticket)}</li>
            <li><strong>Closed By:</strong> ${attended_by_name || "Unknown"} (${attended_by_role || "Unknown Role"})</li>
            <li><strong>Resolution Type:</strong> ${resolution_type || "Resolved"}</li>
            <li><strong>Resolution Details:</strong> ${resolution_details || "Ticket closed by agent"}</li>
            <li><strong>Closed Date:</strong> ${new Date().toLocaleString()}</li>
          </ul>
        `;
        
        const { renderEmailCard } = require('../../services/emailService');
        const htmlBody = renderEmailCard(emailSubject, emailBody, detailsHtml);
        
        // Get attachments for email
        const attachments = getTicketAttachments(ticket);
        
        sendEmail({
          // to: ticket.creator.email,
          to: "grace.tarimo@wcf.go.tz",
          subject: emailSubject,
          htmlBody: htmlBody,
          attachments: attachments,
        }).catch((emailError) => {
          console.error(
            "Error sending closure email to creator:",
            emailError.message
          );
        });
      }
    }

    // Record the closing action in TicketAssignment
    await TicketAssignment.create({
      ticket_id: ticketId,
      assigned_by_id: userId,
      assigned_to_id: userId,
      assigned_to_role: attended_by_role,
      action: "Closed",
      reason: resolution_details || "Ticket closed by agent",
      attachment_path: attachmentPath, // Save attachment path to assignment record
      created_at: new Date(),
    });

    // Deactivate all updates for this user on this ticket
    await deactivateUserUpdates(ticketId, userId);

    // Update AssignedOfficer status (with error handling)
    try {
      await AssignedOfficer.update(
        { status: "Completed", completed_at: new Date() },
        { where: { ticket_id: ticketId, status: "Active" } }
      );
    } catch (assignedOfficerError) {
      console.warn(
        "Warning: Could not update AssignedOfficer status:",
        assignedOfficerError.message
      );
      // Continue with ticket closure even if AssignedOfficer update fails
    }

    console.log("🔵 Preparing success response...");
    const responseData = {
      success: true,
      message: `Ticket ${ticket.ticket_id} closed successfully by ${
        attended_by_name || "Unknown"
      } (${attended_by_role || "Unknown Role"})`,
      details: {
        ticket_id: ticket.ticket_id,
        subject: ticket.subject,
        category: ticket.category,
        resolution_type: resolution_type || "Resolved",
        resolution_details: resolution_details || "Ticket closed by agent",
        closed_by: attended_by_name || "Unknown",
        closed_by_role: attended_by_role || "Unknown Role",
        closed_date: new Date().toLocaleString(),
        attachment_path: attachmentPath,
      },
      ticket: {
        ...ticket.toJSON(),
        attended_by_name,
        attachment_path: attachmentPath,
      },
    };
    console.log("✅ Response data prepared");
    console.log("🔵 ========== CLOSE TICKET SUCCESS ==========");
    return res.status(200).json(responseData);
  } catch (error) {
    console.error("🔴 ========== CLOSE TICKET ERROR ==========");
    console.error("❌ ERROR closing ticket:", error);
    console.error("❌ Error name:", error.name);
    console.error("❌ Error message:", error.message);
    console.error("❌ Error code:", error.code);
    console.error("❌ Error stack:", error.stack);
    console.error("❌ Full error object:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
    console.error("🔴 ========================================");
    return res.status(500).json({
      success: false,
      message: "Failed to close ticket",
      error: error.message,
      details: {
        error_type: error.name || "Unknown Error",
        error_code: error.code || "UNKNOWN",
        timestamp: new Date().toLocaleString(),
        suggestion:
          "Please check your input and try again. If the problem persists, contact support.",
      },
    });
  }
};

const closeReviewerTicket = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const {
      resolution_details,
      userId,
      resolution_type, // e.g., 'Resolved', 'Not Applicable', 'Duplicate'
    } = req.body;

    // Validate inputs
    if (!ticketId || !userId || !resolution_details) {
      return res.status(400).json({
        success: false,
        message: "Ticket ID, user ID, and resolution details are required",
        details: {
          missing_fields: {
            ticketId: !ticketId ? "Missing" : "Provided",
            userId: !userId ? "Missing" : "Provided",
            resolution_details: !resolution_details ? "Missing" : "Provided",
          },
          suggestion:
            "Please provide all required fields: ticketId, userId, and resolution_details",
        },
      });
    }

    // Find the ticket and include relevant associations
    const ticket = await Ticket.findOne({
      where: {
        id: ticketId,
        category: {
          [Op.in]: ["Complaint", "Suggestion", "Compliment"], // Allow all reviewer-managed categories
        },
      },
      include: [
        {
          model: User,
          as: "creator",
          attributes: ["id", "full_name"],
        },
        {
          model: User,
          as: "assignee",
          attributes: ["id", "full_name", "role"],
        },
      ],
    });

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: "Ticket not found or not a reviewer-managed ticket type",
        details: {
          ticket_id: ticketId,
          allowed_categories: ["Complaint", "Suggestion", "Compliment"],
          suggestion:
            "Please check the ticket ID and ensure it's a reviewer-managed ticket type",
        },
      });
    }

          // Check if the user is authorized (must be a reviewer)
      const reviewer = await User.findOne({
      where: {
        id: userId,
        role: "reviewer",
      },
    });

    if (!reviewer) {
      return res.status(403).json({
        success: false,
        message: "Only reviewers can close these types of tickets",
        details: {
          user_id: userId,
          required_role: "reviewer",
          suggestion:
            "Please ensure you have reviewer privileges to close this ticket",
        },
      });
    }

    // Update the ticket
    await ticket.update({
      status: "Closed",
      resolution_details,
      resolution_type: resolution_type || "Resolved",
      date_of_resolution: new Date(),
      attended_by_id: userId,
    });

    // Update resolution details if reviewer edited them
    // if (resolution_details) {
    //   await ticket.update({
    //     resolution_details: resolution_details
    //   });
    // }

    // Notify the creator (agent) by email if available
    if (ticket.creator && ticket.creator.email) {
      const emailSubject = `Ticket Closed by Reviewer: ${ticket.subject}`;
      const emailBody = `
        <p>Dear ${ticket.creator.full_name},</p>
        <p>Your ticket has been closed by a reviewer. Here are the details:</p>
      `;
      
      const detailsHtml = `
        <ul>
          <li><strong>Ticket ID:</strong> ${ticket.ticket_id}</li>
          <li><strong>Subject:</strong> ${ticket.subject}</li>
          <li><strong>Category:</strong> ${ticket.category}</li>
          <li><strong>Description:</strong> ${ticket.description}</li>
          <li><strong>Requester:</strong> ${getRequesterDisplayName(ticket)}</li>
          <li><strong>Closed By:</strong> ${reviewer.full_name} (Reviewer)</li>
          <li><strong>Resolution Type:</strong> ${resolution_type || "Resolved"}</li>
          <li><strong>Resolution Details:</strong> ${resolution_details || "Ticket closed by reviewer"}</li>
          <li><strong>Closed Date:</strong> ${new Date().toLocaleString()}</li>
        </ul>
      `;
      
      const { renderEmailCard } = require('../../services/emailService');
      const htmlBody = renderEmailCard(emailSubject, emailBody, detailsHtml);
      
      // Get attachments for email
      const attachments = getTicketAttachments(ticket);
      
      sendEmail({
        // to: [ticket.creator.email, "grace.tarimo@wcf.go.tz"],
        to:`grace.tarimo@wcf.go.tz`,
        subject: emailSubject,
        htmlBody: htmlBody,
        attachments: attachments,
      }).catch((emailError) => {
        console.error(
          "Error sending closure email to creator:",
          emailError.message
        );
      });
    }

    // Notify all reviewers and supervisors
    const notifySubject2 = `Ticket Closed by Reviewer: ${ticket.subject}`;
    const notifyBody2 = `
      <p>A ticket has been closed by a reviewer. Here are the details:</p>
    `;
    const notifyDetails2 = `
      <ul>
        <li><strong>Ticket ID:</strong> ${ticket.ticket_id}</li>
        <li><strong>Subject:</strong> ${ticket.subject}</li>
        <li><strong>Category:</strong> ${ticket.category}</li>
        <li><strong>Requester:</strong> ${getRequesterDisplayName(ticket)}</li>
        <li><strong>Closed By:</strong> ${reviewer.full_name} (Reviewer)</li>
        <li><strong>Resolution Type:</strong> ${resolution_type || "Resolved"}</li>
        <li><strong>Resolution Details:</strong> ${resolution_details}</li>
        <li><strong>Closed Date:</strong> ${new Date().toLocaleString()}</li>
      </ul>
    `;
    
    const notifyHtml2 = renderEmailCard(notifySubject2, notifyBody2, notifyDetails2);
    const notifyMsg2 = `Ticket ${ticket.ticket_id} has been closed by ${reviewer.full_name} (Reviewer).`;
    
    // Send notifications to supervisors always
    await notifyUsersByRole(
      ["supervisor"],
      notifySubject2,
      notifyHtml2,
      ticketId,
      userId,
      notifyMsg2
    );
    
    // Send notifications to reviewers ONLY if it's a Minor or Major (including Inquiry rated Minor/Major)
    const isMinorOrMajor = (ticket.complaint_type === "Minor" || ticket.complaint_type === "Major");
    if (isMinorOrMajor) {
      console.log(`🔵 Ticket is ${ticket.complaint_type} (category: ${ticket.category}) - sending email to reviewers`);
      await notifyUsersByRole(
        ["reviewer"],
        notifySubject2,
        notifyHtml2,
        ticketId,
        userId,
        notifyMsg2
      );
      console.log("✅ Notifications sent to reviewers for Minor/Major complaint");
    } else {
      console.log(`🔵 Ticket is not Minor/Major complaint (category: ${ticket.category}, type: ${ticket.complaint_type}) - skipping reviewer email`);
    }

    // If there was a focal person or other assignee involved, notify them too
    if (ticket.assigned_to && ticket.assigned_to !== userId) {
      await Notification.create({
        ticket_id: ticketId,
        sender_id: userId,
        recipient_id: ticket.assigned_to,
        message: `${ticket.category} ticket ${ticket.ticket_id} has been resolved and closed by ${reviewer.full_name} (Reviewer)`,
        status: "unread",
      });
    }

    await AssignedOfficer.update(
      { status: "Completed", completed_at: new Date() },
      { where: { ticket_id: ticketId, status: "Active" } }
    );

    res.status(200).json({
      success: true,
              message: `${ticket.category} ticket ${ticket.ticket_id} closed successfully by ${reviewer.full_name} (Reviewer)`,
      details: {
        ticket_id: ticket.ticket_id,
        subject: ticket.subject,
        category: ticket.category,
        resolution_type: resolution_type || "Resolved",
        resolution_details: resolution_details,
        closed_by: reviewer.full_name,
        closed_by_role: "reviewer",
        closed_date: new Date().toLocaleString(),
      },
      ticket: {
        ...ticket.toJSON(),
        resolution_date: new Date(),
        resolved_by: reviewer.full_name,
      },
    });
    return;
  } catch (error) {
    console.error("Error closing ticket:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to close ticket",
      error: error.message,
    });
  }
};

// Assign ticket to attendee by username (for focal person)
const assignTicket = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { assignedToUsername, reason } = req.body;
    const assigned_by_id = req.user?.userId;
    
    // Validate required fields
    if (!assignedToUsername) {
      return res.status(400).json({
        success: false,
        message: "assignedToUsername is required"
      });
    }

    // Get the current ticket to verify it exists
    const ticket = await Ticket.findByPk(ticketId);
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: "Ticket not found"
      });
    }

    // Find the user by username
    const assignedTo = await User.findOne({
      where: { username: assignedToUsername },
    });
    
    if (!assignedTo) {
      return res.status(404).json({
        success: false,
        message: "Assigned user not found"
      });
    }

    // Create a new assignment record
    await TicketAssignment.create({
      ticket_id: ticketId,
      assigned_by_id,
      assigned_to_id: assignedTo.id,
      assigned_to_role: assignedTo.role,
      action: "Assigned",
      reason: reason || `Assigned to ${assignedTo.full_name || assignedTo.username}`,
      created_at: new Date()
    });

    // Update the ticket's current assignee
    await Ticket.update(
      {
        assigned_to_id: assignedTo.id,
        assigned_to_role: assignedTo.role,
        status: "Assigned" // Ensure status is set to Assigned
      },
      { where: { id: ticketId } }
    );

    // Create notification for the assigned user
    await Notification.create({
      ticket_id: ticketId,
      sender_id: assigned_by_id,
      recipient_id: assignedTo.id,
      message: `New ticket assigned to you: ${ticket.subject || ticket.ticket_id}`,
      channel: "In-System",
      status: "unread",
      category: ticket.category || "Assignment"
    });

    // Send notification to the new assignee (optional)
    try {
      if (assignedTo.email) {
        const subject = `Ticket Assigned: ${ticket.ticket_id || ticket.id}`;
        const bodyHtml = `
          <p>Hello ${assignedTo.full_name || ""},</p>
          <p>The following ticket has been <b>assigned</b> to you:</p>
        `;
        const detailsHtml = `
          <ul>
            <li><b>Ticket ID:</b> ${ticket.ticket_id || ticket.id}</li>
            <li><b>Subject:</b> ${ticket.subject}</li>
            <li><b>Category:</b> ${ticket.category}</li>
            <li><b>Requester:</b> ${getRequesterDisplayName(ticket)}</li>
            <li><b>Status:</b> Assigned</li>
            <li><b>Assignment Reason:</b> ${reason || "Ticket assigned"}</li>
          </ul>
          <p>Please log into the system to review and take action.</p>
        `;
        const htmlBody = renderEmailCard(subject, bodyHtml, detailsHtml);
        const attachments = getTicketAttachments(ticket);
        // Send email in background to avoid blocking assignment
        sendEmailNonBlocking({ to: 'grace.tarimo@wcf.go.tz', subject, htmlBody, attachments: attachments });
      }
    } catch (notificationError) {
      console.error("Error sending notification:", notificationError);
      // Do not fail the assignment if notification fails
    }

    res.status(200).json({
      success: true,
      message: `Ticket assigned successfully to ${assignedTo.full_name || assignedTo.username || assignedTo.id} (${assignedTo.role || "user"})`
    });

  } catch (error) {
    console.error("Error in assignTicket:", error);
    res.status(500).json({
      success: false,
      message: "Failed to assign ticket",
      error: error.message
    });
  }
};

const getAllAttendee = async (req, res) => {
  try {
    const currentUserId = req.user.userId;
    
    // Get the current user's unit/section
    // Explicitly specify attributes to avoid issues with report_to_id column
    const currentUser = await User.findByPk(currentUserId, {
      attributes: ['id', 'full_name', 'username', 'email', 'role', 'report_to', 'designation', 'unit_section', 'isActive', 'status', 'extension']
    });
    if (!currentUser) {
      return res.status(404).json({ message: "Current user not found" });
    }
    
    // Get current user's full name for filtering attendees who report to them
    const currentUserFullName = currentUser?.full_name || '';
    console.log(`DEBUG: Current user - Role: ${currentUser.role}, Full Name: ${currentUserFullName}, Unit: ${currentUser.unit_section}, Report To: ${currentUser.report_to}, ID: ${currentUser.id}`);
    
    // Build the where clause to filter users
    let whereClause = { 
      // Removed isActive filter to return all users regardless of active status
    };
    
    // Determine which role to show based on current user's role and unit section
    let targetRole = "attendee"; // Default role
    
    // If current user is Head of Unit or Director and their unit section contains "directorate", show managers
    if ((currentUser.role === "head-of-unit" || currentUser.role === "director") && 
        currentUser.unit_section && 
        currentUser.unit_section.toLowerCase().includes("directorate")) {
      targetRole = "manager";
      console.log(`DEBUG: Head of Unit with directorate unit, showing managers instead of attendees`);
    } else if (currentUser.role === "head-of-unit" && 
               currentUser.unit_section && 
               currentUser.unit_section.toLowerCase().includes("unit") ) {
      // If head-of-unit's unit_section contains "unit" (not "directorate"), show attendees
      targetRole = "attendee";
      console.log(`DEBUG: Head of Unit with unit (not directorate), showing attendees`);
    }
    
    // Special handling for focal persons - they should see attendees from their unit
    if (currentUser.role === "focal-person") {
      targetRole = "attendee";
      console.log(`DEBUG: Focal person requesting attendees from their unit`);
    }
    
    // Include "attendee", "agent", and "focal-person" roles when targetRole is "attendee"
    // Also include "focal-person" when targetRole is "manager" (for managers/directors viewing attendees)
    if (targetRole === "attendee") {
      whereClause.role = { [Op.in]: ["attendee", "agent", "focal-person"] };
    } else if (targetRole === "manager") {
      // For managers/directors, show both managers and focal-persons in attendees list
      whereClause.role = { [Op.in]: ["manager", "reviewer"] };
    } else {
      whereClause.role = targetRole;
    }
    
    // Filter users based on current user's role and available data
    if (currentUser.role === "focal-person") {
      // Check if ticketId is provided in query parameters
      const ticketId = req.query.ticketId;
      
      console.log(`DEBUG: Focal person - full_name: "${currentUserFullName}", unit_section: "${currentUser.unit_section}"`);
      
      if (ticketId) {
        // Fetch the ticket to get its sub_section (for reference only)
        const ticket = await Ticket.findByPk(ticketId, {
          attributes: ['id', 'sub_section', 'section']
        });
        
        // For focal persons: filter attendees by unit_section AND report_to
        // Attendees must be in the same unit_section AND report to the same manager as the focal person
        // Query: WHERE unit_section = focal_person.unit_section AND report_to = focal_person.report_to AND role IN ('attendee', 'agent', 'focal-person')
        if (currentUser.unit_section && currentUser.unit_section.trim() !== '' && 
            currentUser.report_to && currentUser.report_to.trim() !== '') {
          // Use case-insensitive matching for both unit_section and report_to
          whereClause[Op.and] = [
            {
              [Op.or]: [
                { unit_section: currentUser.unit_section },
                Sequelize.where(
                  Sequelize.fn('LOWER', Sequelize.fn('TRIM', Sequelize.col('unit_section'))),
                  currentUser.unit_section.trim().toLowerCase()
                )
              ]
            },
            {
              [Op.or]: [
                { report_to: currentUser.report_to },
                Sequelize.where(
                  Sequelize.fn('LOWER', Sequelize.fn('TRIM', Sequelize.col('report_to'))),
                  currentUser.report_to.trim().toLowerCase()
                )
              ]
            },
            // Include attendee, agent, and focal-person roles
            targetRole === "attendee" ? { role: { [Op.in]: ["attendee", "agent", "focal-person"] } } : { role: targetRole }
          ];
          console.log(`DEBUG: Focal person filtering ${targetRole}s by unit_section: "${currentUser.unit_section}" AND report_to: "${currentUser.report_to}" (case-insensitive)`);
          if (ticket && ticket.sub_section) {
            console.log(`DEBUG: Ticket sub_section: "${ticket.sub_section}" (for reference only, not used for filtering)`);
          }
      } else {
          console.log(`DEBUG: Missing unit_section or report_to for focal person, showing all ${targetRole}s`);
          console.log(`DEBUG: unit_section: "${currentUser.unit_section}", report_to: "${currentUser.report_to}"`);
          if (ticket && ticket.sub_section) {
            console.log(`DEBUG: Ticket sub_section: "${ticket.sub_section}" (not used - focal person missing required fields)`);
          }
        }
      } else {
        // For focal persons without ticketId: filter attendees by unit_section AND report_to
        // Attendees must be in the same unit_section AND report to the same manager as the focal person
        // Query: WHERE unit_section = focal_person.unit_section AND report_to = focal_person.report_to AND role IN ('attendee', 'agent')
        if (currentUser.unit_section && currentUser.unit_section.trim() !== '' && 
            currentUser.report_to && currentUser.report_to.trim() !== '') {
          // Use case-insensitive matching for both unit_section and report_to
          whereClause[Op.and] = [
            {
              [Op.or]: [
                { unit_section: currentUser.unit_section },
                Sequelize.where(
                  Sequelize.fn('LOWER', Sequelize.fn('TRIM', Sequelize.col('unit_section'))),
                  currentUser.unit_section.trim().toLowerCase()
                )
              ]
            },
            {
              [Op.or]: [
                { report_to: currentUser.report_to },
                Sequelize.where(
                  Sequelize.fn('LOWER', Sequelize.fn('TRIM', Sequelize.col('report_to'))),
                  currentUser.report_to.trim().toLowerCase()
                )
              ]
            },
            // Include attendee, agent, and focal-person roles
            targetRole === "attendee" ? { role: { [Op.in]: ["attendee", "agent", "focal-person"] } } : { role: targetRole }
          ];
          console.log(`DEBUG: Filtering ${targetRole}s by focal person's unit_section: "${currentUser.unit_section}" AND report_to: "${currentUser.report_to}" (case-insensitive)`);
        } else {
          console.log(`DEBUG: Missing unit_section or report_to for focal person, showing all ${targetRole}s`);
          console.log(`DEBUG: Current user full_name value: "${currentUserFullName}"`);
          console.log(`DEBUG: Current user unit_section value: "${currentUser.unit_section}"`);
          console.log(`DEBUG: Current user report_to value: "${currentUser.report_to}"`);
          console.log(`WARNING: Focal person ${currentUser.id} (${currentUser.full_name}) does not have unit_section or report_to set!`);
        }
      }
    } else if (currentUser.role === "head-of-unit") {
      // For head-of-unit:
      // - Managers/attendees are filtered by unit_section/report_to as before
      // - Reviewers should NOT depend on unit_section/report_to, so include them via OR
      if (currentUser.unit_section && currentUser.unit_section.trim() !== '') {
        const unitSection = currentUser.unit_section;
        const roleFilter =
          targetRole === "manager"
            ? { [Op.in]: ["manager"] }
            : { [Op.in]: ["attendee", "agent", "focal-person"] };

        // IMPORTANT: remove top-level role/unit_section filters (they would AND with Op.or and hide reviewers)
        const baseWhere = { ...whereClause };
        delete baseWhere.role;
        delete baseWhere.unit_section;
        delete baseWhere.report_to;
        delete baseWhere[Op.and];

        whereClause = {
          ...baseWhere,
          [Op.or]: [
            { role: "reviewer" },
            { unit_section: unitSection, role: roleFilter },
          ],
        };

        console.log(`DEBUG: Head of Unit filtering ${targetRole}s by unit_section: ${unitSection} (and including all reviewers)`);
        console.log(`DEBUG: Where clause for head-of-unit:`, JSON.stringify(whereClause, null, 2));
      } else {
        // Fallback to designation-based report_to mapping if no unit_section
      const designationMapping = {
        'HICT': 'Head of ICT Unit',
        'HIAU': 'Head of Internal Audit Unit', 
        'HASSRMU': 'Actuarial Services Statistics and Risk Management Unit',
        'HHRMAU': 'Head of Human Resource Management and Administration',
        'HLSU': 'Head of Legal Services Unit',
        'HPMU': 'Head of Public Relation Unit'
      };
      
      if (currentUser.designation && designationMapping[currentUser.designation]) {
        const targetReportTo = designationMapping[currentUser.designation];
        const roleFilter =
          targetRole === "manager"
            ? { [Op.in]: ["manager"] }
            : { [Op.in]: ["attendee", "agent", "focal-person"] };

        // IMPORTANT: remove top-level role/report_to filters (they would AND with Op.or and hide reviewers)
        const baseWhere = { ...whereClause };
        delete baseWhere.role;
        delete baseWhere.unit_section;
        delete baseWhere.report_to;
        delete baseWhere[Op.and];

        whereClause = {
          ...baseWhere,
          [Op.or]: [
            { role: "reviewer" },
            { report_to: targetReportTo, role: roleFilter },
          ],
        };
        console.log(`DEBUG: Head of Unit with designation ${currentUser.designation}, filtering ${targetRole}s by report_to: ${targetReportTo} (and including all reviewers)`);
      } else {
          console.log(`DEBUG: No unit_section or valid designation mapping found for head-of-unit, showing all ${targetRole}s`);
          console.log(`DEBUG: Current user designation: "${currentUser.designation}", unit_section: "${currentUser.unit_section}"`);
        }
      }
    } else if (currentUser.role === "director") {
      // For director:
      // - If directorate => targetRole is manager
      // - Always include reviewers regardless of unit_section/report_to
      if (currentUser.unit_section && currentUser.unit_section.trim() !== '') {
        const unitSection = currentUser.unit_section;
        const roleFilter =
          targetRole === "manager"
            ? { [Op.in]: ["manager"] }
            : { [Op.in]: ["attendee", "agent", "focal-person"] };

        // IMPORTANT: remove top-level role/unit_section filters (they would AND with Op.or and hide reviewers)
        const baseWhere = { ...whereClause };
        delete baseWhere.role;
        delete baseWhere.unit_section;
        delete baseWhere.report_to;
        delete baseWhere[Op.and];

        whereClause = {
          ...baseWhere,
          [Op.or]: [
            { role: "reviewer" },
            { unit_section: unitSection, role: roleFilter },
          ],
        };

        console.log(`DEBUG: Director filtering ${targetRole}s by unit_section: ${unitSection} (and including all reviewers)`);
      } else {
        // If director has no unit_section, still include reviewers (and fall back to role filter if any)
        whereClause = {
          ...whereClause,
          role: { [Op.in]: ["reviewer"] }
        };
        console.log(`DEBUG: Director has no unit_section; returning reviewers`);
      }
    } else if (currentUser.role === "manager") {
      // For manager, filter by designation-based report_to mapping
      const managerDesignationMapping = {
        'WRAM': 'Work Place Risk Asessment Manager', // Note: matches database spelling
        'CASM': 'Claim Assessment Manager',
        'CADM': 'CLAIMS ADMINISTRATION MANAGER',
        'CM': 'Compliance Manager',
        'RMM': 'Records Management Manager',
        'IM': 'Investment Manager',
        'FM': 'Finance Manager',
        'PRM': 'Planning and Research Manager'
      };
      
      if (currentUser.designation && managerDesignationMapping[currentUser.designation]) {
        const targetReportTo = managerDesignationMapping[currentUser.designation];
        whereClause.report_to = targetReportTo;
        console.log(`DEBUG: Manager with designation ${currentUser.designation}, filtering ${targetRole}s by report_to: ${targetReportTo}`);
      } else {
        console.log(`DEBUG: No valid designation mapping found for manager, showing all ${targetRole}s`);
        console.log(`DEBUG: Current user designation: "${currentUser.designation}"`);
      }
    } else {
      // For other roles, filter by unit_section
      if (currentUser.unit_section && currentUser.unit_section.trim() !== '') {
        whereClause.unit_section = currentUser.unit_section;
        console.log(`DEBUG: Filtering ${targetRole}s by unit_section: ${currentUser.unit_section}`);
      } else {
        console.log(`DEBUG: No unit_section found for current user, showing all ${targetRole}s`);
        console.log(`DEBUG: Current user unit_section value: "${currentUser.unit_section}" (type: ${typeof currentUser.unit_section})`);
      }
    }
    
    const users = await User.findAll({
      where: whereClause,
      attributes: ['id', 'full_name', 'username', 'email', 'role', 'report_to', 'designation']
    });
    
    console.log(`DEBUG: Found ${users.length} ${targetRole}s matching criteria`);
    console.log(`DEBUG: Users:`, users.map(u => ({ name: u.full_name, username: u.username, role: u.role, report_to: u.report_to, designation: u.designation })));
    
    // Additional debugging: Show all attendees with their unit_section values for comparison
    if (users.length === 0 && currentUser.role === "focal-person") {
      console.log(`DEBUG: No users found with current filter. Let's check what values exist:`);
      console.log(`DEBUG: Where clause used:`, JSON.stringify(whereClause, null, 2));
      console.log(`DEBUG: Focal person full_name: "${currentUserFullName}"`);
      
      // Check all attendees with their unit_section (including agents and focal-persons)
      const allAttendees = await User.findAll({
        where: targetRole === "attendee" ? { role: { [Op.in]: ["attendee", "agent", "focal-person"] } } : { role: targetRole },
        attributes: ['id', 'full_name', 'unit_section', 'report_to', 'designation']
      });
      console.log(`DEBUG: All ${targetRole}s in database:`, allAttendees.map(u => ({ 
        name: u.full_name, 
        unit_section: u.unit_section,
        report_to: u.report_to, 
        designation: u.designation 
      })));
      
      // Check attendees whose report_to matches focal person's name (case-insensitive)
      const matchingAttendees = allAttendees.filter(a => 
        a.report_to && 
        a.report_to.trim().toLowerCase() === currentUserFullName.trim().toLowerCase()
      );
      console.log(`DEBUG: Attendees with report_to matching focal person name (case-insensitive):`, matchingAttendees.map(u => ({ 
        name: u.full_name, 
        report_to: u.report_to
      })));
      
      // Also check if there are any users with the same unit_section
      if (currentUser.unit_section) {
        const sameUnitUsers = await User.findAll({
          where: { unit_section: currentUser.unit_section },
          attributes: ['id', 'full_name', 'role', 'unit_section']
        });
        console.log(`DEBUG: All users with unit_section "${currentUser.unit_section}":`, sameUnitUsers.map(u => ({ 
          name: u.full_name, 
          role: u.role,
          unit_section: u.unit_section
      })));
      }
    }
    
    res.status(200).json({ 
      attendees: users, // Keep the same response structure for compatibility
      currentUserUnit: currentUser.unit_section || 'No unit assigned',
      currentUserReportTo: currentUser.report_to || 'No report_to assigned',
      currentUserDesignation: currentUser.designation || 'No designation assigned',
      currentUserRole: currentUser.role,
      targetRole: targetRole, // Add this to show what role was actually fetched
      debug: {
        filteredByUnit: !!currentUser.unit_section,
        filteredByReportTo: !!currentUser.report_to,
        filteredByDesignation: !!currentUser.designation,
        userCount: users.length,
        isDirectorateUnit: currentUser.unit_section && currentUser.unit_section.toLowerCase().includes("directorate")
      }
    });
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ message: "server error", error: error.message });
  }
};

// Get all assignment/reassignment actions for a ticket
const getTicketAssignments = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { agingType = "calendar" } = req.query; // Allow query param for aging type

    // Get the ticket to access category and complaint_type for SLA calculations
    const ticket = await Ticket.findByPk(ticketId, {
      attributes: ["id", "category", "complaint_type", "status"],
    });
    
    // First get the assignments without associations
    const assignments = await TicketAssignment.findAll({
      where: { ticket_id: ticketId },
      order: [["created_at", "ASC"]]
    });
    
    // Then manually fetch the user data for each assignment
    const assignmentsWithUsers = await Promise.all(
      assignments.map(async (assignment) => {
        const assignedToUser = await User.findByPk(assignment.assigned_to_id, {
          attributes: ["id", "full_name", "role"]
        });
        
        const assignedByUser = await User.findByPk(assignment.assigned_by_id, {
          attributes: ["id", "full_name"]
        });
        
        return {
          ...assignment.toJSON(),
          assignedTo: assignedToUser,
          assignedBy: assignedByUser
        };
      })
    );
    
    let mappedAssignments = assignmentsWithUsers.map((a) => ({
      assigned_to_id: a.assigned_to_id,
      assigned_to_name: a.assignedTo ? a.assignedTo.full_name : "Unknown User",
      assigned_to_role: a.assignedTo ? a.assignedTo.role : null,
      reason: a.reason,
      action: a.action,
      created_at: a.created_at,
      attachment_path: a.attachment_path,
      evidence_url: a.evidence_url,
      action_details: a.action_details,
      workflow_step: a.workflow_step,
      workflow_path: a.workflow_path,
      // Include assignedTo object for frontend fallback
      assignedTo: a.assignedTo ? {
        id: a.assignedTo.id,
        full_name: a.assignedTo.full_name,
        role: a.assignedTo.role
      } : null
    }));

    // Add creator_name to the first assignment if available
    if (mappedAssignments.length > 0) {
      const firstAssignment = assignmentsWithUsers[0];
      if (firstAssignment.assignedBy) {
        mappedAssignments[0].creator_name = firstAssignment.assignedBy.full_name || 'N/A';
      }
    }

    // Calculate aging for each assignment
    const assignmentsWithAging = calculateAssignmentsAging(
      mappedAssignments,
      new Date(),
      agingType
    );

    // Add aging status and formatted aging for each assignment
    const finalAssignments = assignmentsWithAging.map((assignment) => {
      const agingStatus = getAgingStatus(
        assignment.aging.days,
        ticket?.category,
        ticket?.complaint_type
      );

      return {
        ...assignment,
        aging_days: assignment.aging.days,
        aging_hours: assignment.aging.hours,
        aging_minutes: assignment.aging.minutes,
        aging_formatted: formatAging(assignment.aging),
        aging_status: agingStatus,
        aging_type: assignment.aging.type,
      };
    });
    
    res.json(finalAssignments);
  } catch (error) {
    console.error("Error in getTicketAssignments:", error);
    res.status(500).json({
      message: "Failed to fetch ticket assignments",
      error: error.message,
    });
  }
};

// Get ticket clarifications
const getTicketClarifications = async (req, res) => {
  try {
    const { ticketId } = req.params;
    
    const clarifications = await TicketClarification.findAll({
      where: { ticket_id: ticketId },
      order: [['created_at', 'ASC']]
    });
    
    res.json(clarifications);
  } catch (error) {
    console.error("Error in getTicketClarifications:", error);
    res.status(500).json({
      message: "Failed to fetch ticket clarifications",
      error: error.message,
    });
  }
};

// Get all users involved in a ticket (for @ mentions)
const getTicketMentionUsers = async (req, res) => {
  try {
    const { ticketId } = req.params;
    
    // Get ticket to find creator
    const ticket = await Ticket.findByPk(ticketId, {
      attributes: ["id", "created_by", "assigned_to_id"]
    });
    
    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }
    
    // Get all unique user IDs from assignments
    const assignments = await TicketAssignment.findAll({
      where: { ticket_id: ticketId },
      attributes: ["assigned_to_id", "assigned_by_id"],
      raw: true
    });
    
    // Get all unique user IDs from updates
    const updates = await TicketUpdate.findAll({
      where: { ticket_id: ticketId },
      attributes: ["user_id"],
      raw: true
    });
    
    // Collect all unique user IDs
    const userIds = new Set();
    
    // Add creator
    if (ticket.created_by) {
      userIds.add(ticket.created_by);
    }
    
    // Add current assignee
    if (ticket.assigned_to_id) {
      userIds.add(ticket.assigned_to_id);
    }
    
    // Add users from assignments
    assignments.forEach(assignment => {
      if (assignment.assigned_to_id) userIds.add(assignment.assigned_to_id);
      if (assignment.assigned_by_id) userIds.add(assignment.assigned_by_id);
    });
    
    // Add users from updates
    updates.forEach(update => {
      if (update.user_id) userIds.add(update.user_id);
    });
    
    // Fetch user details
    const users = await User.findAll({
      where: {
        id: Array.from(userIds)
      },
      attributes: ["id", "full_name", "username", "role", "unit_section"],
      order: [["full_name", "ASC"]]
    });
    
    // Format response
    const mentionUsers = users.map(user => ({
      id: user.id,
      name: user.full_name || user.username || "Unknown",
      username: user.username || "",
      role: user.role || "",
      unit_section: user.unit_section || ""
    }));
    
    res.json({
      success: true,
      data: mentionUsers
    });
  } catch (error) {
    console.error("Error in getTicketMentionUsers:", error);
    res.status(500).json({
      message: "Failed to fetch mention users",
      error: error.message
    });
  }
};

// Get all assigned officers for a ticket
const getAssignedOfficers = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const officers = await AssignedOfficer.findAll({
      where: { ticket_id: ticketId },
      order: [["assigned_at", "ASC"]],
    });
    res.json(officers);
  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch assigned officers",
      error: error.message,
    });
  }
};

// Get tickets assigned to user and notified
const getAssignedNotifiedTickets = async (req, res) => {
  try {
    const { userId } = req.params;
    const { notificationStatus } = req.query; // e.g., "unread", "read", or undefined

    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    // Build notification where clause
    const notificationWhere = { recipient_id: userId };
    if (notificationStatus) {
      notificationWhere.status = notificationStatus;
    }

    // Find notifications for tickets assigned to user, with ticket and assignee info
    const notifications = await Notification.findAll({
      where: notificationWhere,
      include: [
        {
          model: Ticket,
          as: "ticket",
          // Do NOT specify attributes here, so all fields are included
          include: [
            {
              model: User,
              as: "assignee",
              attributes: ["id", "full_name", "email"],
            },
          ],
        },
        {
          model: User,
          as: "sender",
          attributes: ["id", "full_name"],
        },
      ],
      order: [["created_at", "DESC"]],
    });

    res.status(200).json({
      message: "Assigned and notified tickets fetched successfully",
      notificationCount: notifications.length,
      notifications,
    });
  } catch (error) {
    console.error("Error fetching assigned and notified tickets:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Unified dashboard counts for any user
const getDashboardCounts = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }
    const user = await User.findOne({
      where: { id: userId },
      attributes: ["id", "full_name", "role"],
    });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    // ALL ROLES (except reviewer) LOGIC: use assigned_to_id for all counts
    if (user.role !== "reviewer") {
      // For super admin and supervisor, show all tickets
      // For other roles, show only assigned tickets
      const ticketWhere = (user.role === "super-admin" || user.role === "supervisor") ? {} : { assigned_to_id: userId };
      const statuses = [
        "Open",
        "Assigned",
        "Closed",
        "Carried Forward",
        "In Progress",
      ];
      const counts = {};
      for (const status of statuses) {
        const key = status.toLowerCase().replace(/ /g, "");
        const condition = { ...ticketWhere, status };
        counts[key] = await Ticket.count({ where: condition });
      }
      const total = await Ticket.count({ where: ticketWhere });
      const tenDaysAgo = new Date();
      tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
      const overdueCount = await Ticket.count({
        where: {
          ...ticketWhere,
          status: "Open",
          created_at: { [Op.lt]: tenDaysAgo },
        },
      });
      
      // Debug logging for overdue count
      console.log("DEBUG - Overdue count:", overdueCount);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      // Tickets opened today by this agent (created by userId today)
      const openedTodayCount = await Ticket.count({
        where: {
          userId: userId,
          created_at: { [Op.gte]: today },
        },
      });
      // Total tickets created by this agent
      const totalCreatedByMe = await Ticket.count({
        where: { created_by: userId },
      });
      const newTicketsCount = await Ticket.count({
        where: {
          ...ticketWhere,
          created_at: { [Op.gte]: today },
        },
      });
      const lastHour = new Date(new Date().setHours(new Date().getHours() - 1));
      const inHourCount = await Ticket.count({
        where: {
          ...ticketWhere,
          created_at: { [Op.gte]: lastHour },
        },
      });
      const resolvedHourCount = await Ticket.count({
        where: {
          ...ticketWhere,
          status: "Closed",
          updated_at: { [Op.gte]: lastHour },
        },
      });
      const pendingCount = counts.open + counts.inprogress;
      // Assigned tickets: all roles show only tickets assigned to them
      let assignedCount;
      if (user.role === "super-admin" || user.role === "supervisor") {
        assignedCount = await Ticket.count({
        where: {
          assigned_to_id: userId,
            status: { [Op.in]: ["Assigned", "Open", "Forwarded", "Attended and Recommended",
              "Reversed", "Returned", "Escalated"] },
        },
      });
      } else {
        assignedCount = await Ticket.count({
          where: {
            assigned_to_id: userId,
            status: { [Op.in]: ["Assigned", "Open", "Returned", "Forwarded", "Escalated", 
              "Reversed", "In Progress", "Attended and Recommended"] },
          },
        });
      }
      
      // Escalated tickets: use the same logic as getEscalatedTicketsForUser
      // Count tickets that were escalated TO this user
      const escalatedAssignments = await TicketAssignment.findAll({
        where: {
          assigned_to_id: userId,
          action: "Escalated",
        },
        include: [
          {
            model: Ticket,
            as: "ticket",
            where: {
              status: { [Op.ne]: "Closed" },
            },
            attributes: ["id"],
          },
        ],
        attributes: ["ticket_id"],
        group: ["ticket_id"],
      });
      
      const escalatedCount = escalatedAssignments.length;
      
      // Debug logging for escalated count
      console.log("DEBUG - Escalated assignments found:", escalatedAssignments.length);
      console.log("DEBUG - Escalated ticket IDs:", escalatedAssignments.map(a => a.ticket_id));
      console.log("DEBUG - Final escalated count:", escalatedCount);
      // Wait Time metrics (copy from getTicketCounts)
      const tickets = await Ticket.findAll({ where: ticketWhere });
      let longestWait = "00:00";
      let avgWait = "00:00";
      let maxWait = "00:00";
      let slaBreaches = 0;
      if (tickets.length > 0) {
        const waitTimes = tickets
          .filter((t) => t.status === "Open" || t.status === "In Progress")
          .map((t) => {
            const created = new Date(t.created_at);
            const now = new Date();
            return Math.floor((now - created) / 1000 / 60); // Minutes
          });
        if (waitTimes.length > 0) {
          const maxWaitMinutes = Math.max(...waitTimes);
          const avgWaitMinutes =
            waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length;
          longestWait = `${Math.floor(maxWaitMinutes / 60)}:${String(
            maxWaitMinutes % 60
          ).padStart(2, "0")}`;
          avgWait = `${Math.floor(avgWaitMinutes / 60)}:${String(
            Math.round(avgWaitMinutes % 60)
          ).padStart(2, "0")}`;
          maxWait = longestWait;
          slaBreaches = waitTimes.filter((t) => t > 1440).length; // > 24 hours
        }
      }
      // In Progress: use the same logic as the sidebar (getInProgressAssignments)
      let inProgressCount = 0;
      try {
        // Use the same logic as getInProgressAssignments
        let whereClause = {
          action: { [Op.in]: ["Assigned", "Reassigned", "Open", "Forwarded", "In progress",
            "Attended and Recommended"
          ] }
        };

        // For super admin and supervisor, show all assignments
        // For director-general, show tickets assigned to them (forwarded to them)
        // For other roles, show assignments made by this user OR assigned to this user
        if (user.role === "director-general") {
          whereClause.assigned_to_id = userId;
        } else if (user.role !== "super-admin" && user.role !== "supervisor") {
          whereClause[Op.or] = [
            { assigned_by_id: userId },
            { assigned_to_id: userId }
          ];
        }

        // Get only the most recent assignment per ticket_id
        const assignments = await TicketAssignment.findAll({
          where: whereClause,
          order: [
            ["ticket_id", "ASC"],
            ["created_at", "DESC"],
          ],
          include: [
            {
              model: Ticket,
              as: "ticket",
              where: { status: { [Op.ne]: "Closed" } },
            },
          ],
        });
        
        // Reduce to only the latest assignment per ticket_id
        const latestAssignmentsMap = new Map();
        for (const assignment of assignments) {
          if (!latestAssignmentsMap.has(assignment.ticket_id)) {
            latestAssignmentsMap.set(assignment.ticket_id, assignment);
          }
        }
        
        inProgressCount = latestAssignmentsMap.size;
      } catch (error) {
        console.error("Error calculating in progress count:", error);
        inProgressCount = 0;
      }
      // Add closedByAgent: tickets closed by this agent
      const closedByAgent = await Ticket.count({
        where: {
          attended_by_id: userId,
          status: "Closed",
        },
      });
      // Debug log
      console.log("inProgressCount (dashboard logic):", inProgressCount);
      console.log("DEBUG - Final response escalated count:", escalatedCount);
      
      const response = {
        success: true,
        ticketStats: {
          total,
          assigned: assignedCount,
          escalated: escalatedCount,
          closed: counts.closed || 0,
          carriedForward: counts.carriedforward || 0,
          inProgress: inProgressCount, // Use the new count here
          overdue: overdueCount || 0,
          newTickets: newTicketsCount || 0,
          openedToday: openedTodayCount, // <-- Added here
          totalCreatedByMe, // <-- Added here
          inHour: inHourCount || 0,
          resolvedHour: resolvedHourCount || 0,
          pending: pendingCount || 0,
          longestWait,
          avgWait,
          maxWait,
          lastHour: inHourCount || 0,
          avgDelay: avgWait,
          maxDelay: maxWait,
          slaBreaches: slaBreaches || 0,
          closedByAgent, // <-- Added here
        },
      };
      
      console.log("DEBUG - Full response ticketStats:", response.ticketStats);
      return res.status(200).json(response);
    }
    // FOCAL PERSON/MANAGEMENT LOGIC
    if (
      [
        "focal-person",
        "claim-focal-person",
        "compliance-focal-person",
        "head-of-unit",
        "director",
        // "manager",
        "supervisor",
        "director-general",
        "director",
        "admin",
        "super-admin",
      ].includes(user.role)
    ) {
      const ticketWhere = { assigned_to_id: userId };
      const newInquiries = await Ticket.count({
        where: {
          ...ticketWhere,
          [Op.or]: [{ status: null }, { status: "Open" }],
        },
      });
      const escalatedInquiries = await Ticket.count({
        where: {
          id: {
            [Op.in]: (await TicketAssignment.findAll({
              where: {
                assigned_by_id: userId,
                action: 'Escalated'
              },
              include: [
                {
                  model: Ticket,
                  as: 'ticket',
                  where: {
                    status: { [Op.ne]: 'Closed' }
                  },
                  attributes: ['id']
                }
              ],
              attributes: ['ticket_id'],
              group: ['ticket_id']
            })).map(a => a.ticket_id)
          }
        }
      });
      const totalInquiries = await Ticket.count({ where: ticketWhere });
      const inProgressInquiries = await Ticket.count({
        where: {
          ...ticketWhere,
          status: {
            [Op.in]: [
              "Assigned",
              "Open",
              "Returned",
              "Forwarded",
              "In progress",
              "Escalated",
            ],
          },
        },
      });
      const openInquiries = await Ticket.count({
        where: {
          ...ticketWhere,
          status: "Open",
        },
      });
      const resolvedInquiries = await Ticket.count({
        where: {
          attended_by_id: userId,
          status: "Closed",
        },
      });

      // Count for assigned attendees (you may need to define what this means)
      // For now, let's say it's tickets assigned to someone by the focal person
      // that are not yet closed.
      const assignedToOthersByMe = await TicketAssignment.count({
        where: {
          assigned_by_id: userId,
          // action: { [Op.in]: ["Assigned", "Reassigned"] }
        },
        include: [
          {
            model: Ticket,
            as: "ticket",
            where: {
              status: { [Op.ne]: "Closed" },
            },
          },
        ],
      });

      return res.status(200).json({
        success: true,
        ticketStats: {
          newTickets: {
            "New Tickets": newInquiries,
            "Escalated Tickets": escalatedInquiries,
            Total: newInquiries + escalatedInquiries,
          },
          ticketStatus: {
            Open: openInquiries,
            Closed: resolvedInquiries,
            AssignedAttendees: assignedToOthersByMe,
          },
          // also pass the flat data for the dashboard page
          newInquiries,
          escalatedInquiries,
          totalInquiries,
          resolvedInquiries,
          openInquiries,
          closedInquiries: resolvedInquiries,
          inProgressInquiries,
        },
      });
    }
    // REVIEWER LOGIC (add as needed)
    if (user.role === "reviewer") {
      // Use the same logic as reviewer dashboard
      // Count tickets assigned to reviewer including Reversed status as assigned
      const newTicketsCount = await Ticket.count({
        where: {
          category: { [Op.in]: ["Complaint", "Suggestion", "Compliment"] },
          assigned_to_id: userId,
          status: { 
            [Op.in]: ["Open", "Assigned", "Returned", "Reversed", "In Progress", "Escalated"]
          },
          [Op.and]: [
            { status: { [Op.ne]: "Forwarded" } }, // Exclude forwarded tickets
            { status: { [Op.ne]: "Closed" } } // Exclude closed tickets
          ]
        }
      });

      const escalatedTicketsCount = await Ticket.count({
        where: {
          category: { [Op.in]: ["Complaint", "Suggestion", "Compliment"] },
          [Op.and]: [
            { [Op.or]: [{ status: '' }, { status: "Escalated" }] },
            { status: { [Op.ne]: "Forwarded" } } // Exclude forwarded tickets
          ]
        }
      });

      const complaintsCount = await Ticket.count({
        where: {
          category: "Complaint",
          [Op.and]: [
            { [Op.or]: [{ status: null }, { status: "Open" }, { status: "Returned" }, { status: "Reversed" }] },
            { status: { [Op.ne]: "Forwarded" } } // Exclude forwarded tickets
          ]
        }
      });

      const suggestionsCount = await Ticket.count({
        where: {
          category: "Suggestion",
          [Op.and]: [
            { [Op.or]: [{ status: null }, { status: "Open" }, { status: "Returned" }] },
            { status: { [Op.ne]: "Forwarded" } } // Exclude forwarded tickets
          ]
        }
      });

      const complementsCount = await Ticket.count({
        where: {
          category: "Compliment",
          [Op.and]: [
            { [Op.or]: [{ status: null }, { status: "Open" }, { status: "Returned" }] },
            { status: { [Op.ne]: "Forwarded" } } // Exclude forwarded tickets
          ]
        }
      });

      const directorateCount = await Ticket.count({
        where: {
          responsible_unit_name: { [Op.like]: "%Directorate%" },
          category: { [Op.in]: ["Complaint", "Suggestion", "Compliment"] },
          status: { [Op.ne]: "Closed" }
        }
      });

      const unitsCount = await Ticket.count({
        where: {
          responsible_unit_name: { [Op.like]: "%Unit%" },
          category: { [Op.in]: ["Complaint", "Suggestion", "Compliment"] },
          status: { [Op.ne]: "Closed" }
        }
      });

      const closedCount = await Ticket.count({
        where: {
          category: { [Op.in]: ["Complaint", "Suggestion", "Compliment"] },
          status: "Closed"
        }
      });

      // Return the full nested structure expected by the sidebar
      return res.status(200).json({
        success: true,
        message: "Dashboard counts for reviewer",
        ticketStats: {
          newTickets: {
            "New Tickets": newTicketsCount,
            "Escalated Tickets": escalatedTicketsCount,
            Total: newTicketsCount + escalatedTicketsCount
          },
          convertedTickets: {
            Complaints: complaintsCount,
            Suggestions: suggestionsCount,
            Compliments: complementsCount
          },
          channeledTickets: {
            Directorate: directorateCount,
            Units: unitsCount
          },
          ticketStatus: {
            Closed: closedCount
          }
        }
      });
    }
    return res.status(400).json({
      success: false,
      message: "Role not supported for dashboard counts",
    });
  } catch (error) {
    console.error("Error fetching dashboard counts:", error);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
};

const reassignTicket = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { assigned_to_id, assigned_to_role, reassignment_reason, notes } =
      req.body;
    const assigned_by_id = req.user?.userId;

    // Validate required fields
    if (!assigned_to_id || !assigned_to_role) {
      return res.status(400).json({
        success: false,
        message: "assigned_to_id and assigned_to_role are required"
      });
    }

    // Get the current ticket to verify it exists
    const ticket = await Ticket.findByPk(ticketId);
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: "Ticket not found"
      });
    }

    // Create a new assignment record for the reassignment
    await TicketAssignment.create({
      ticket_id: ticketId,
      assigned_by_id,
      assigned_to_id,
      assigned_to_role,
      action: "Reassigned",
      reason: reassignment_reason || notes || "Ticket reassigned",
      created_at: new Date()
    });

    // Update the ticket's current assignee
    await Ticket.update(
      {
        assigned_to_id,
        assigned_to_role,
        status: "Assigned" // Ensure status is set to Assigned
      },
      { where: { id: ticketId } }
    );

    // Create notification for the reassigned user
    await Notification.create({
      ticket_id: ticketId,
      sender_id: assigned_by_id,
      recipient_id: assigned_to_id,
      message: `Ticket reassigned to you: ${ticket.subject || ticket.ticket_id}`,
      channel: "In-System",
      status: "unread",
    });

    // Resolve new assignee for response message
    const newAssignee = await User.findByPk(assigned_to_id);

    // Send notification to the new assignee (optional)
    try {
      if (newAssignee && newAssignee.email) {
        const subject = `Ticket Reassigned: ${ticket.ticket_id || ticket.id}`;
        const bodyHtml = `
          <p>Hello ${newAssignee.full_name || ""},</p>
          <p>The following ticket has been <b>reassigned</b> to you:</p>
        `;
        const detailsHtml = `
          <ul>
            <li><b>Ticket ID:</b> ${ticket.ticket_id || ticket.id}</li>
            <li><b>Subject:</b> ${ticket.subject}</li>
            <li><b>Category:</b> ${ticket.category}</li>
            <li><b>Requester:</b> ${getRequesterDisplayName(ticket)}</li>
            <li><b>Status:</b> Assigned</li>
            <li><b>Reassignment Reason:</b> ${reassignment_reason || notes || "Ticket reassigned"}</li>
          </ul>
          <p>Please log into the system to review and take action.</p>
        `;
        const htmlBody = renderEmailCard(subject, bodyHtml, detailsHtml);
        const attachments = getTicketAttachments(ticket);
        // Send email in background to avoid blocking reassignment
        // sendEmailNonBlocking({ to: newAssignee.email, subject, htmlBody, attachments: attachments });
        sendEmailNonBlocking({ to: 'grace.tarimo@wcf.go.tz', subject, htmlBody, attachments: attachments });
      }
    } catch (notificationError) {
      console.error("Error sending notification:", notificationError);
      // Do not fail the reassignment if notification fails
    }

    res.status(200).json({
      success: true,
      message: `Ticket reassigned successfully to ${newAssignee?.full_name || newAssignee?.username || assigned_to_id} (${newAssignee?.role || assigned_to_role || "user"})`,
    });
  } catch (error) {
    console.error("Error in reassignTicket:", error);
    res.status(500).json({
      success: false,
      message: "Failed to reassign ticket",
      error: error.message,
    });
  }
};


const getInProgressAssignments = async (req, res) => {
  try {
    // Prefer userId from authenticated user (JWT), fallback to query param
    const userId = req.user?.userId || req.query.userId;
    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    // Fetch User details including role
    const user = await User.findOne({
      where: { id: userId },
      attributes: ["id", "full_name", "role"],
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    let whereClause = {
      action: { [Op.in]: ["Assigned", "Reassigned", "Open", "Forwarded", "In progress",
        "Attended and Recommended"
      ] }
    };

    // For super admin and supervisor, show all assignments
    // For director-general, show tickets assigned to them (forwarded to them)
    // For other roles, show assignments made by this user OR assigned to this user
    if (user.role === "director-general") {
      whereClause.assigned_to_id = userId;
    } else if (user.role !== "super-admin" && user.role !== "supervisor") {
      whereClause[Op.or] = [
        { assigned_by_id: userId },
        { assigned_to_id: userId }
      ];
    }

    // Get only the most recent assignment per ticket_id, including ticket details
    const assignments = await TicketAssignment.findAll({
      where: whereClause,
      order: [
        ["ticket_id", "ASC"],
        ["created_at", "DESC"],
      ],
      include: [
        {
          model: Ticket,
          as: "ticket",
          where: { status: { [Op.ne]: "Closed" } },
        },
      ],
    });
    // Reduce to only the latest assignment per ticket_id
    const latestAssignmentsMap = new Map();
    for (const assignment of assignments) {
      if (!latestAssignmentsMap.has(assignment.ticket_id)) {
        latestAssignmentsMap.set(assignment.ticket_id, assignment);
      }
    }
    const latestAssignments = Array.from(latestAssignmentsMap.values());
    // Only count assignments where ticket is present (i.e., not closed)
    const filteredAssignments = latestAssignments.filter((a) => a.ticket);

    // Sort newest first for UI tables (by ticket created_at, fallback to assignment created_at)
    const sortedAssignments = [...filteredAssignments].sort((a, b) => {
      const aDate = a?.ticket?.created_at ? new Date(a.ticket.created_at).getTime() : 0;
      const bDate = b?.ticket?.created_at ? new Date(b.ticket.created_at).getTime() : 0;
      if (bDate !== aDate) return bDate - aDate;
      const aAssign = a?.created_at ? new Date(a.created_at).getTime() : 0;
      const bAssign = b?.created_at ? new Date(b.created_at).getTime() : 0;
      return bAssign - aAssign;
    });
    res.status(200).json({
      message: "In-progress assignments fetched successfully",
      count: sortedAssignments.length,
      assignments: sortedAssignments,
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch in-progress assignments",
      error: error.message,
    });
  }
};

// Helper function to send emails in background
const sendReversalEmailsInBackground = async (ticket, prevUser, attended_by_name, attended_by_role, reason, userId) => {
  try {
    // Notify all reviewers and supervisors
    const notifySubject = `Ticket Reversed: ${ticket.subject}`;
    const portalUrl = `https://192.168.21.70/`;
    const notifyDetailsHtml = `
      <ul>
        <li><strong>Ticket ID:</strong> ${ticket.ticket_id}</li>
        <li><strong>Subject:</strong> ${ticket.subject}</li>
        <li><strong>Category:</strong> ${ticket.category}</li>
        <li><strong>Requester:</strong> ${getRequesterDisplayName(ticket)}</li>
        <li><strong>Reversed By:</strong> ${attended_by_name} (${attended_by_role})</li>
        <li><strong>Reversed To:</strong> ${prevUser ? prevUser.full_name : 'Unknown'} (${prevUser ? prevUser.role : 'Unknown'})</li>
        <li><strong>Reversal Reason:</strong> ${reason || 'Ticket reversed to previous user'}</li>
        <li><strong>Reversed Date:</strong> ${new Date().toLocaleString()}</li>
      </ul>`;
    const notifyBodyHtml = `<p>The following ticket has been reversed:</p>`;
    const notifyHtml = `<!doctype html>
      <html><head><meta name="viewport" content="width=device-width,initial-scale=1" /><meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
      <style>
        body{margin:0;background:#f5f6f8;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1f2937}
        .card{max-width:640px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden}
        .header{background:#0ea5e9;color:#fff;padding:16px 20px;font-size:18px;font-weight:700}
        .content{padding:20px}.label{font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:#6b7280;margin-bottom:6px}
        .details{background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:14px;font-size:13px;color:#374151}
        .btn-wrap{padding:0 20px 20px}.btn{display:inline-block;background:#0ea5e9;color:#fff!important;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:600;font-size:14px}
      </style></head>
      <body><div class="card">
        <div class="header">${notifySubject}</div>
        <div class="content">
          <div class="label">Message</div>
          <div>${notifyBodyHtml}</div>
          <div class="label" style="margin-top:12px;">Details</div>
          <div class="details">${notifyDetailsHtml}</div>
        </div>
        <div class="btn-wrap">
          <a class="btn" href="${portalUrl}" target="_blank" rel="noopener">Open in Portal</a>
        </div>
      </div></body></html>`;
    
    const notifyMsg = `Ticket ${ticket.ticket_id} has been reversed by ${attended_by_name} (${attended_by_role}) to ${prevUser ? prevUser.full_name : 'Unknown'}.`;
    
    try {
    await notifyUsersByRole(
      ["reviewer", "supervisor"],
      notifySubject,
      notifyHtml,
      ticket.id,
      userId,
      notifyMsg
    );
      console.log(`✅ Notifications created for reviewers/supervisors for reversed ticket ${ticket.ticket_id}`);
    } catch (notifError) {
      console.error(`❌ Error creating notifications for reviewers/supervisors:`, notifError);
      // Don't fail the whole operation if notification creation fails
    }

    // Send email to the previous user
    if (prevUser && prevUser.email) {
      const emailSubject = `Ticket Reversed Back to You: ${ticket.subject}`;
      const bodyHtml = `<p>Dear ${prevUser.full_name || prevUser.username},</p><p>A ticket has been reversed back to you:</p>`;
      const detailsHtml = `
        <ul>
          <li><strong>Ticket ID:</strong> ${ticket.ticket_id}</li>
          <li><strong>Subject:</strong> ${ticket.subject}</li>
          <li><strong>Category:</strong> ${ticket.category}</li>
          <li><strong>Reversed By:</strong> ${attended_by_name} (${attended_by_role})</li>
          <li><strong>Reversal Reason:</strong> ${reason || 'Ticket reversed to previous user'}</li>
        </ul>`;
      const emailHtmlBody = renderEmailCard(emailSubject, bodyHtml, detailsHtml);
      const attachments = getTicketAttachments(ticket);

      // Send email in background to avoid blocking
      sendEmailNonBlocking({
        to:`grace.tarimo@wcf.go.tz`,
        // to: prevUser.email,
        subject: emailSubject,
        htmlBody: emailHtmlBody,
        attachments: attachments
      });
    }
  } catch (error) {
    console.error("Error sending reversal emails in background:", error);
  }
};

const reverseTicket = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { userId, reason, status, description } = req.body;

    // Log received reason for debugging
    console.log(`🔍 Reverse request - reason from frontend: "${reason}", description: "${description}"`);
    console.log(`🔍 Reverse request - req.body keys:`, Object.keys(req.body || {}));

    if (!ticketId) {
      return res.status(400).json({ message: "Ticket ID is required" });
    }

    // Get assignment history, ordered by created_at DESC
    const assignments = await TicketAssignment.findAll({
      where: { ticket_id: ticketId },
      order: [["created_at", "DESC"]],
    });

    // Get the ticket with creator information
    const ticket = await Ticket.findOne({
      where: { id: ticketId },
      include: [
        {
          model: User,
          as: "creator",
          attributes: ["id", "full_name", "email", "role"]
        }
      ]
    });

    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    let prevAssignment = null;
    let targetUserId = null;
    let targetUserRole = null;

    // Check if this is a Minor complaint from head of unit
    const isMinorComplaint = ticket.category === "Complaint" && ticket.complaint_type === "Minor";
    const isFromHeadOfUnit = ticket.responsible_unit_name && 
                             !ticket.responsible_unit_name.toLowerCase().includes("directorate");
    const isAttendeeReversing = req.user && req.user.role === "attendee";
    const isAgentReversing = req.user && req.user.role === "agent";

    // Find current user's assignment to check if they were reassigned
    let currentUserAssignment = null;
    for (const assignment of assignments) {
      if (assignment.assigned_to_id === userId) {
        currentUserAssignment = assignment;
        break;
      }
    }

    // Get current user to check role (will be used later as assignedBy)
    const currentUser = await User.findByPk(userId);
    if (!currentUser) {
      return res.status(404).json({ message: "Reversing user not found" });
    }
    // NOTE: Reverse should behave the same for all roles (like agent reverse):
    // go back to the previous assignment in history (assignments[1]), unless the user was explicitly reassigned.

    // If current user was reassigned, return to the reassigned_by (assigned_by_id of current assignment)
    if (currentUserAssignment && currentUserAssignment.action === "Reassigned") {
      const reassignedBy = await User.findByPk(currentUserAssignment.assigned_by_id);
      if (reassignedBy) {
        // IMPORTANT: Only use currentUserAssignment to find the previous user
        // Do NOT use currentUserAssignment.reason - always use reason from frontend
        prevAssignment = {
          assigned_to_id: reassignedBy.id,
          assigned_to_role: reassignedBy.role
        };
        targetUserId = reassignedBy.id;
        targetUserRole = reassignedBy.role;
        console.log(`DEBUG: User was reassigned - returning to reassigned_by: ${reassignedBy.full_name} (${reassignedBy.role})`);
        console.log(`🔍 DEBUG: currentUserAssignment exists but NOT using its reason - will use reason from frontend`);
      }
    } else if (assignments.length >= 1) {
      // Normal reverse (like attendee): return to the user who assigned this ticket to the current user.
      // IMPORTANT: Skip "self-assignments" where assigned_by_id === assigned_to_id (these would bounce back to self).
      // IMPORTANT: Also skip "Rated" actions where reviewer assigned to themselves (assigned_to_id === assigned_by_id)
      // This ensures we don't use reviewer's rating assignment as the previous assignment
      const senderAssignment = assignments.find(a =>
        a.assigned_to_id === userId &&
        a.assigned_by_id &&
        a.assigned_by_id !== userId &&
        a.action !== "Rated" // Skip rating actions where reviewer assigned to themselves
      );

      if (senderAssignment) {
        const senderUser = await User.findByPk(senderAssignment.assigned_by_id);
        if (senderUser) {
          // IMPORTANT: Only use senderAssignment to find the previous user
          // Do NOT use senderAssignment.reason - always use reason from frontend
          prevAssignment = { assigned_to_id: senderUser.id, assigned_to_role: senderUser.role };
          targetUserId = senderUser.id;
          targetUserRole = senderUser.role;
          console.log(`DEBUG: Reversing ticket (normal) - returning to assigner: ${targetUserId} (${targetUserRole})`);
          console.log(`🔍 DEBUG: senderAssignment exists but NOT using its reason - will use reason from frontend`);
          console.log(`🔍 DEBUG: senderAssignment action: "${senderAssignment.action}", assigned_by_id: ${senderAssignment.assigned_by_id}, assigned_to_id: ${senderAssignment.assigned_to_id}`);
        }
      }

      if (!targetUserId) {
        console.log(`No previous assignments found - cannot reverse ticket`);
        return res.status(400).json({ 
          message: "Cannot reverse ticket: No previous assignments found. Ticket must have assignment history to be reversed." 
        });
      }
    } else {
      // If no previous assignments, cannot reverse - return error
      console.log(`No previous assignments found - cannot reverse ticket`);
      return res.status(400).json({ 
        message: "Cannot reverse ticket: No previous assignments found. Ticket must have assignment history to be reversed." 
      });
    }

    // Handle file upload if present
    let attachmentPath = null;
    if (req.file) {
      attachmentPath = `ticket_attachments/${req.file.filename}`; // Save relative path
      console.log("Attachment uploaded:", attachmentPath);
    }

    // Use currentUser as assignedBy (already fetched above)
    const assignedBy = currentUser;

    // Check if ticket has workflow path set
    if (ticket.workflow_path) {
      // Ensure prevAssignment exists before using it
      if (!prevAssignment || !prevAssignment.assigned_to_id) {
        console.error(`❌ ERROR: prevAssignment is null or missing assigned_to_id! Cannot process workflow reversal.`);
        console.error(`❌ DEBUG: prevAssignment:`, prevAssignment);
        console.error(`❌ DEBUG: targetUserId:`, targetUserId);
        console.error(`❌ DEBUG: assignments length:`, assignments.length);
        return res.status(500).json({ 
          message: "Cannot reverse ticket: Previous assignment not found. Please contact administrator." 
        });
      }

      // Use the reason from frontend (director/head-of-unit's own reason)
      // IMPORTANT: Do NOT use reason from prevAssignment or reviewer - always use reason from frontend
      // If reason is not provided, use default message
      const reversalReason = reason && String(reason).trim() 
        ? String(reason).trim() 
        : "Ticket reversed to previous user";
      
      console.log(`🔍 Processing workflow reversal with reason from frontend: "${reversalReason}"`);
      console.log(`🔍 Original reason from req.body: "${reason}"`);
      console.log(`🔍 prevAssignment exists: ${!!prevAssignment}, but NOT using its reason`);

      // Use workflow service to process the reversal
      // Pass reversalReason from frontend - this will be saved in TicketAssignment.reason
      const result = await workflowService.processWorkflowStepTransition(
        ticketId,
        "Reversed",
        assignedBy,
        { id: prevAssignment.assigned_to_id, role: prevAssignment.assigned_to_role },
        reversalReason, // This is the reason from frontend (director/head-of-unit), NOT from reviewer
        attachmentPath, // Pass attachment path - will be saved with assigned_by_id (user aliyetuma)
        null // No transaction needed here
      );

      if (!result.success) {
        return res.status(500).json({ 
          message: "Error processing workflow reversal", 
          error: result.error 
        });
      }

      // Ensure targetUserId is set from prevAssignment if not already set
      if (!targetUserId && prevAssignment && prevAssignment.assigned_to_id) {
        targetUserId = prevAssignment.assigned_to_id;
        targetUserRole = prevAssignment.assigned_to_role;
        console.log(`🔍 DEBUG: Set targetUserId from prevAssignment: ${targetUserId}`);
      }

      // Create notification for the target user (the one receiving the reversed ticket)
      console.log(`🔍 DEBUG: Creating notification for recipient (with workflow) - targetUserId: ${targetUserId}, prevAssignment.assigned_to_id: ${prevAssignment?.assigned_to_id}, ticketId: ${ticketId}, ticket.ticket_id: ${ticket.ticket_id}`);
      if (!targetUserId) {
        console.error(`❌ ERROR: targetUserId is null/undefined! Cannot create notification for recipient.`);
        console.error(`❌ DEBUG: prevAssignment:`, prevAssignment);
        console.error(`❌ DEBUG: result:`, result);
      } else {
        try {
      await Notification.create({
        ticket_id: ticketId,
        sender_id: userId,
        recipient_id: targetUserId,
        message: `Ticket reversed back to you: ${ticket.subject} (ID: ${ticket.ticket_id})`,
        channel: "In-System",
        status: "unread",
          });
          console.log(`✅ Notification created for recipient ${targetUserId} for reversed ticket ${ticket.ticket_id}`);
        } catch (notifError) {
          console.error(`❌ Error creating notification for recipient ${targetUserId}:`, notifError);
          // Don't fail the whole operation if notification creation fails
        }
      }

      // Update attachment path if file was uploaded
      if (attachmentPath) {
        await ticket.update({ attachment_path: attachmentPath });
      }

      // Fetch attended_by user name and role
      let attended_by_name = assignedBy.full_name;
      let attended_by_role = assignedBy.role;

      // Fetch previous user details
      let prevUser = await User.findByPk(targetUserId);
      
      // If previous user not found, return an error (no fallback)
      if (!prevUser) {
        console.warn(`No user found for target user ID: ${targetUserId}`);
        return res.status(404).json({ 
          message: "Cannot reverse ticket: Previous user not found. Please contact administrator." 
        });
      }

      // Clear forwarded_at and forwarded_by_id to allow forwarding again after reverse
      await ticket.update({
        forwarded_at: null,
        forwarded_by_id: null
      });

      // Send emails in background (non-blocking)
      setImmediate(() => {
        sendReversalEmailsInBackground(ticket, prevUser, attended_by_name, attended_by_role, reason, userId);
      });

      // Format role name for display (capitalize and add spaces)
      const formattedRole = targetUserRole 
        ? targetUserRole.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
        : 'user';

      return res.json({
        message: `Ticket reversed successfully to ${prevUser.full_name || prevUser.username || prevUser.id} (${formattedRole})`,
        workflow: result.workflow,
        assignment: result.assignment
      });

    } else {
      // Fallback to original reversal logic for tickets without workflow
      await ticket.update({
        assigned_to_id: targetUserId,
        assigned_to_role: targetUserRole,
        status: "Reversed",
        attachment_path: attachmentPath,
        attended_by_id: userId,
        forwarded_at: null, // Clear forwarded_at to allow forwarding again
        forwarded_by_id: null // Clear forwarded_by_id to allow forwarding again
      });

      // Use the reason from frontend (director/head-of-unit's own reason)
      // IMPORTANT: Do NOT use reason from prevAssignment, senderAssignment, or reviewer - always use reason from frontend
      // This applies to ALL tickets including major/minor complaints
      // If reason is not provided, use default message
      const reversalReason = reason && String(reason).trim() 
        ? String(reason).trim() 
        : "Ticket reversed to previous user";
      
      console.log(`🔍 Creating reversal assignment with reason from frontend: "${reversalReason}"`);
      console.log(`🔍 Original reason from req.body: "${reason}"`);
      console.log(`🔍 NOT using reason from senderAssignment or prevAssignment - using reason from frontend only`);

      // Add a new assignment record for the reversal
      // IMPORTANT: Always use reason from frontend, NOT from previous assignment or reviewer
      // Ensure reason is properly trimmed and saved exactly as received from frontend
      const finalReason = reversalReason && String(reversalReason).trim() 
        ? String(reversalReason).trim() 
        : "Ticket reversed to previous user";
      
      console.log(`🔍 Final reason being saved to TicketAssignment (non-workflow): "${finalReason}"`);
      console.log(`🔍 Director/Head-of-unit reversing - reason from frontend: "${reason}"`);
      console.log(`🔍 reversalReason after processing: "${reversalReason}"`);
      console.log(`🔍 finalReason to be saved: "${finalReason}"`);
      
      const assignmentRecord = await TicketAssignment.create({
        ticket_id: ticketId,
        assigned_by_id: userId,
        assigned_to_id: targetUserId,
        assigned_to_role: targetUserRole,
        action: "Reversed",
        reason: finalReason, // Use reason from frontend (director/head-of-unit), NOT from reviewer
        attachment_path: attachmentPath,
        created_at: new Date()
      });
      
      console.log(`✅ TicketAssignment created with ID: ${assignmentRecord.id}`);
      console.log(`✅ TicketAssignment.reason saved as: "${assignmentRecord.reason}"`);
      console.log(`✅ Verifying: reason from frontend was "${reason}", saved as "${assignmentRecord.reason}"`);

      // Create notification for the target user (the one receiving the reversed ticket)
      console.log(`🔍 DEBUG: Creating notification for recipient (no workflow) - targetUserId: ${targetUserId}, ticketId: ${ticketId}, ticket.ticket_id: ${ticket.ticket_id}`);
      if (!targetUserId) {
        console.error(`❌ ERROR: targetUserId is null/undefined! Cannot create notification for recipient.`);
      } else {
        try {
      await Notification.create({
        ticket_id: ticketId,
        sender_id: userId,
        recipient_id: targetUserId,
        message: `Ticket reversed back to you: ${ticket.subject} (ID: ${ticket.ticket_id})`,
        channel: "In-System",
        status: "unread",
          });
          console.log(`✅ Notification created for recipient ${targetUserId} for reversed ticket ${ticket.ticket_id}`);
        } catch (notifError) {
          console.error(`❌ Error creating notification for recipient ${targetUserId}:`, notifError);
          // Don't fail the whole operation if notification creation fails
        }
      }

      // Fetch attended_by user name and role
      let attended_by_name = null;
      let attended_by_role = null;
      if (userId) {
        const attendedByUser = await User.findOne({ where: { id: userId } });
        attended_by_name = attendedByUser ? attendedByUser.full_name : null;
        attended_by_role = attendedByUser ? attendedByUser.role : null;
      }

      // Fetch previous user details
      let prevUser = await User.findByPk(targetUserId);
      
      // If previous user not found, return an error (no fallback)
      if (!prevUser) {
        console.warn(`No user found for target user ID: ${targetUserId}`);
        return res.status(404).json({ 
          message: "Cannot reverse ticket: Previous user not found. Please contact administrator." 
        });
      }

      // Send emails in background (non-blocking)
      // reversalReason is already declared above, so we use it directly
      setImmediate(() => {
        sendReversalEmailsInBackground(ticket, prevUser, attended_by_name, attended_by_role, reversalReason, userId);
      });

      // Format role name for display (capitalize and add spaces)
      const formattedRole = targetUserRole 
        ? targetUserRole.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
        : 'user';

      return res.json({ message: `Ticket reversed successfully to ${prevUser.full_name || prevUser.username || prevUser.id} (${formattedRole})` });
    }

  } catch (error) {
    console.error("Error reversing ticket:", error);
    return res.status(500).json({ 
      message: "Internal server error", 
      error: error.message 
    });
  }
};

// --- Ticket Count Endpoints for Sidebar ---
const getOpenTicketsCount = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId)
      return res.status(400).json({ message: "User ID is required" });
    const user = await User.findOne({
      where: { id: userId },
      attributes: ["id", "role"],
    });
    if (!user) return res.status(404).json({ message: "User not found" });
    let count;
    if (user.role === "super-admin" || user.role === "supervisor") {
      count = await Ticket.count({ where: { status: ["Open", "Assigned"] } });
    } else {
      count = await Ticket.count({
        where: { userId, status: ["Open", "Assigned"] },
      });
    }
    res.status(200).json({ count });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getAssignedTicketsCount = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId)
      return res.status(400).json({ message: "User ID is required" });
    const user = await User.findOne({
      where: { id: userId },
      attributes: ["id", "role"],
    });
    if (!user) return res.status(404).json({ message: "User not found" });
    let count;
    if (user.role === "super-admin" || user.role === "supervisor") {
      count = await Ticket.count({ 
        where: { 
          status: { [Op.in]: ["Assigned", "Open", "Returned", "Forwarded",
             "Escalated", "In Progress", "Attended and Recommended"] } 
        } 
      });
    } else {
      // Count currently assigned tickets (excluding escalated)
      count = await Ticket.count({
        where: {
          assigned_to_id: userId,
          status: { [Op.in]: ["Assigned", "Open", "Returned", "Forwarded", "Reversed", "Escalated", 
            "In Progress", "Attended and Recommended"] }
        }
      });
    }
    res.status(200).json({ count });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getInprogressTicketsCount = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId)
      return res.status(400).json({ message: "User ID is required" });
    const user = await User.findOne({
      where: { id: userId },
      attributes: ["id", "role"],
    });
    if (!user) return res.status(404).json({ message: "User not found" });
    let count;
    if (user.role === "super-admin" || user.role === "supervisor") {
      count = await Ticket.count({
        status: { [Op.in]: ["Assigned", "Open", "Returned", "Forwarded"] },
      });
    } else {
      // Find all ticket IDs ever assigned to this user
      const assignedTicketAssignments = await TicketAssignment.findAll({
        where: { assigned_to_id: userId },
        attributes: ["ticket_id"],
        group: ["ticket_id"],
      });
      const assignedTicketIds = assignedTicketAssignments.map(
        (a) => a.ticket_id
      );
      // Find all ticket IDs created by this user
      const createdTickets = await Ticket.findAll({
        where: { userId },
        attributes: ["id"],
      });
      const createdTicketIds = createdTickets.map((t) => t.id);
      // Combine IDs (remove duplicates)
      const allRelevantTicketIds = Array.from(
        new Set([...assignedTicketIds, ...createdTicketIds])
      );
      // Count tickets where id in allRelevantTicketIds and status != 'Closed'
      count = await Ticket.count({
        where: {
          id: { [Op.in]: allRelevantTicketIds },
          status: { [Op.ne]: "Closed" },
        },
      });
    }
    res.status(200).json({ count });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getCarriedForwardTicketsCount = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId)
      return res.status(400).json({ message: "User ID is required" });
    const user = await User.findOne({
      where: { id: userId },
      attributes: ["id", "role"],
    });
    if (!user) return res.status(404).json({ message: "User not found" });
    let count;
    if (user.role === "super-admin" || user.role === "supervisor") {
      count = await Ticket.count({ where: { status: "Carried Forward" } });
    } else {
      count = await Ticket.count({
        where: { userId, status: "Carried Forward" },
      });
    }
    res.status(200).json({ count });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getClosedTicketsCount = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId)
      return res.status(400).json({ message: "User ID is required" });
    const user = await User.findOne({
      where: { id: userId },
      attributes: ["id", "role"],
    });
    if (!user) return res.status(404).json({ message: "User not found" });
    let count;
    if (user.role === "super-admin" || user.role === "supervisor") {
      count = await Ticket.count({ where: { status: "Closed" } });
    } else {
      // Find all ticket IDs ever assigned to this user
      const assignedTicketAssignments = await TicketAssignment.findAll({
        where: { assigned_to_id: userId },
        attributes: ["ticket_id"],
        group: ["ticket_id"],
      });
      const assignedTicketIds = assignedTicketAssignments.map(
        (a) => a.ticket_id
      );
      // Find all ticket IDs created by this user
      const createdTickets = await Ticket.findAll({
        where: { userId },
        attributes: ["id"],
      });
      const createdTicketIds = createdTickets.map((t) => t.id);
      // Combine IDs (remove duplicates)
      const allRelevantTicketIds = Array.from(
        new Set([...assignedTicketIds, ...createdTicketIds])
      );
      // Count tickets where id in allRelevantTicketIds and status == 'Closed'
      count = await Ticket.count({
        where: {
          id: { [Op.in]: allRelevantTicketIds },
          status: "Closed",
        },
      });
    }
    res.status(200).json({ count });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getOverdueTicketsCount = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId)
      return res.status(400).json({ message: "User ID is required" });
    const user = await User.findOne({
      where: { id: userId },
      attributes: ["id", "role"],
    });
    if (!user) return res.status(404).json({ message: "User not found" });
    let count;
    if (user.role === "super-admin" || user.role === "supervisor") {
      // Keep current logic for super-admin and supervisor
      const tenDaysAgo = new Date();
      tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
      count = await Ticket.count({
        where: {
          status: "Open",
          created_at: { [Op.lt]: tenDaysAgo },
        },
      });
    } else {
      // Use SLA logic for overdue
      const assignedTickets = await Ticket.findAll({
        where: {
          assigned_to_id: userId,
          status: { [Op.ne]: "Closed" },
        },
      });
      let overdueCount = 0;
      for (const ticket of assignedTickets) {
        const { breached } = checkTicketSlaBreach(ticket);
        if (breached) overdueCount++;
      }
      count = overdueCount;
    }
    res.status(200).json({ count });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getOverdueTicketsList = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId)
      return res.status(400).json({ message: "User ID is required" });
    const user = await User.findOne({
      where: { id: userId },
      attributes: ["id", "role"],
    });
    if (!user) return res.status(404).json({ message: "User not found" });
    let tickets = [];
    if (user.role === "super-admin") {
      const tenDaysAgo = new Date();
      tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
      tickets = await Ticket.findAll({
        where: {
          status: "Open",
          created_at: { [Op.lt]: tenDaysAgo },
        },
      });
    } else {
      const assignedTickets = await Ticket.findAll({
        where: {
          assigned_to_id: userId,
          status: { [Op.ne]: "Closed" },
        },
      });
      tickets = assignedTickets.filter((ticket) => {
        const { breached } = checkTicketSlaBreach(ticket);
        return breached;
      });
    }
    res.status(200).json({ tickets });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getEscalatedTicketsForUser = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId)
      return res.status(400).json({ message: "User ID is required" });

    // Find tickets that were escalated FROM this user using TicketAssignment
    const escalatedAssignments = await TicketAssignment.findAll({
      where: {
        assigned_to_id: userId,
        action: "Escalated",
      },
      include: [
        {
          model: Ticket,
          as: "ticket",
          where: {
            status: { [Op.ne]: "Closed" },
          },
          attributes: ["id"],
        },
      ],
      attributes: ["ticket_id"],
      group: ["ticket_id"],
    });
    const escalatedTicketIds = escalatedAssignments.map((a) => a.ticket_id);

    // Get the escalated tickets
    const tickets = await Ticket.findAll({
      where: {
        id: { [Op.in]: escalatedTicketIds },
        is_escalated: true,
      },
      include: [
        {
          model: User,
          as: "assignee",
          attributes: ["id", "full_name", "email"],
        },
        {
          model: TicketAssignment,
          as: "assignments",
          include: [
            {
              model: User,
              as: "assignedTo",
              attributes: ["id", "full_name", "email"]
            }
          ]
        },
        {
          model: RequesterDetails,
          as: "RequesterDetail",
        },
      ],
      order: [["created_at", "DESC"]],
    });

    res.status(200).json({
      message: "Escalated tickets fetched successfully",
      totalTickets: tickets.length,
      tickets,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getEverAssignedTickets = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId)
      return res.status(400).json({ message: "User ID is required" });
    // Find all ticket IDs ever assigned to this user
    const assignedTicketAssignments = await TicketAssignment.findAll({
      where: { assigned_to_id: userId },
      attributes: ["ticket_id"],
      group: ["ticket_id"],
    });
    const assignedTicketIds = assignedTicketAssignments.map((a) => a.ticket_id);
    if (assignedTicketIds.length === 0) {
      return res.status(404).json({ message: "No tickets found." });
    }
    const tickets = await Ticket.findAll({
      where: { id: { [Op.in]: assignedTicketIds } },
      include: [
        {
          model: User,
          as: "assignee",
          attributes: ["id", "full_name", "email"],
        },
        {
          model: TicketAssignment,
          as: "assignments",
          include: [
            {
              model: User,
              as: "assignedTo",
              attributes: ["id", "full_name", "email"]
            }
          ]
        },
        {
          model: RequesterDetails,
          as: "RequesterDetail",
        },
      ],
      order: [["created_at", "DESC"]],
    });
    res.status(200).json({
      message: "Ever assigned tickets fetched successfully",
      totalTickets: tickets.length,
      tickets,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getEverAssignedTicketsCount = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId)
      return res.status(400).json({ message: "User ID is required" });
    const assignedTicketAssignments = await TicketAssignment.findAll({
      where: { assigned_to_id: userId },
      attributes: ["ticket_id"],
      group: ["ticket_id"],
    });
    const assignedTicketIds = assignedTicketAssignments.map((a) => a.ticket_id);
    res.status(200).json({ count: assignedTicketIds.length });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getAllTicketsCount = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId)
      return res.status(400).json({ message: "User ID is required" });
    const user = await User.findOne({
      where: { id: userId },
      attributes: ["id", "role"],
    });
    if (!user) return res.status(404).json({ message: "User not found" });
    let count;
    if (user.role === "super-admin" || user.role === "supervisor") {
      count = await Ticket.count();
    } else {
      // For all other roles, count only tickets created by this user (Total Opened by Me)
      count = await Ticket.count({ 
        where: { 
          [Op.or]: [
            { userId: userId },
            { created_by: userId }
          ]
        } 
      });
    }
    res.status(200).json({ count });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// List tickets that were escalated from a specific user
const getEscalatedFromTickets = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }
    const escalatedAssignments = await TicketAssignment.findAll({
      where: {
        assigned_by_id: userId,
        action: "Escalated",
      },
      include: [
        {
          model: Ticket,
          as: "ticket",
          where: {
            is_escalated: true,
            status: { [Op.ne]: "Closed" },
          },
          include: [
            {
              model: User,
              as: "assignee",
              attributes: ["id", "full_name", "role"],
            },
          ],
        },
        {
          model: User,
          as: "assignee",
          attributes: ["id", "full_name", "role"],
        },
      ],
      order: [["created_at", "DESC"]],
    });
    res.status(200).json({ escalatedFrom: escalatedAssignments });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Helper to get requester display name
function getRequesterDisplayName(ticket) {
  // Safety check
  if (!ticket) {
    console.error("⚠️ getRequesterDisplayName: ticket is null/undefined");
    return "Customer";
  }
  
  try {
    // For Employee, use first_name + last_name
    if (ticket.requester === "Employee") {
      const name = [ticket.first_name, ticket.last_name, ticket.middle_name]
        .filter(Boolean)
        .join(" ")
        .trim();
      if (name) return name;
      // If employee name is not available, fall back to representative_name
      if (ticket.representative_name && typeof ticket.representative_name === "string") {
        const repName = ticket.representative_name.trim();
        if (repName) return repName;
      }
      if (ticket.institution && typeof ticket.institution === "string") {
        const instName = ticket.institution.trim();
        if (instName) return instName;
      }
      return "Customer";
    }
    
    // For all non-Employee requesters (Employer, Representative, Pensioners, Stakeholders, Spouse, Parent, Child, Sibling, etc.)
    // Use representative_name directly (it's always submitted)
    if (ticket.representative_name && typeof ticket.representative_name === "string") {
      const repName = ticket.representative_name.trim();
      if (repName) {
        return repName;
      }
    }
    
    // If representative_name is not available (shouldn't happen), use fallback
    console.warn(`⚠️ getRequesterDisplayName: representative_name not found for ticket ${ticket.id || ticket.ticket_id || "unknown"}, requester: ${ticket.requester}`);
    return "Customer";
  } catch (error) {
    console.error("❌ Error in getRequesterDisplayName:", error);
    return "Customer";
  }
}

// Reviewer forwards major complaint to Director General
const forwardToDirectorGeneral = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { userId, resolution_details, own_description, last_attendee_agent_description, assignmentId } = req.body; // Added own_description and last_attendee_agent_description

    if (!ticketId || !userId) {
      return res
        .status(400)
        .json({ message: "Ticket ID and user ID are required" });
    }

    // Handle attachment if uploaded
    let attachmentPath = null;
    if (req.file) {
      attachmentPath = `ticket_attachments/${req.file.filename}`; // Save relative path
      console.log("✅ Attachment uploaded for forward-to-dg:", attachmentPath);
    }

    const ticket = await Ticket.findOne({
      where: { id: ticketId },
      include: [
        {
          model: User,
          as: "creator",
          attributes: ["id", "full_name"],
        },
        {
          model: User,
          as: "ratedBy",
          attributes: ["id", "full_name", "email"],
        },
      ],
    });

    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    // Get current user to check role
    const currentUser = await User.findByPk(userId);
    if (!currentUser) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check if this is a major complaint assigned to director/head-of-unit OR a reversed/recommended ticket assigned to director/head-of-unit
    // Also allow Suggestion and Complement categories
    const allowedCategories = ["Complaint", "Suggestion", "Complement"];
    if (!allowedCategories.includes(ticket.category)) {
      return res.status(400).json({ 
        message: `This action is only for Complaint, Suggestion, or Complement tickets. Current category: ${ticket.category}` 
      });
    }
    
    const isMajorComplaint = ticket.category === "Complaint" && 
                            ticket.complaint_type === "Major" && 
                            ticket.assigned_to_id === userId;
    
    const isReversedTicket = ticket.status === "Reversed" && 
                            ticket.assigned_to_id === userId;
    
    // For Suggestion and Complement, allow if assigned to user
    const isSuggestionOrComplement = (ticket.category === "Suggestion" || ticket.category === "Complement") &&
                                     ticket.assigned_to_id === userId;
    
    // Check if Director is forwarding from Manager in Major Complaint Directorate
    const isDirectorateWorkflow = ticket.category === "Complaint" && 
                                  ticket.complaint_type === "Major" &&
                                  ticket.responsible_unit_name?.toLowerCase().includes("directorate") &&
                                  currentUser.role === "director" &&
                                  ticket.assigned_to_id === userId &&
                                  (ticket.status === "Attended and Recommended" || ticket.status === "Reversed");
    
    if (!isMajorComplaint && !isReversedTicket && !isDirectorateWorkflow && !isSuggestionOrComplement) {
      return res.status(400).json({ 
        message: "This ticket is not a major complaint, suggestion, complement, or reversed/recommended ticket assigned to you" 
      });
    }

    // Find Director General
    const directorGeneral = await User.findOne({
      where: { role: "director-general" },
    });

    if (!directorGeneral) {
      return res.status(404).json({
        message: "Director General not found",
      });
    }

    // Save clarification to TicketClarification table instead of appending to description
    // This prevents duplicates when ticket is reversed and reversed again
    if (resolution_details !== null && resolution_details !== undefined && String(resolution_details).trim()) {
      const clarificationText = String(resolution_details).trim();
      
      // Check if clarification already exists for this ticket/user/role combination
      const existingClarification = await TicketClarification.findOne({
        where: {
          ticket_id: ticketId,
          edited_by_id: userId,
          edited_by_role: currentUser.role
        }
      });
      
      if (existingClarification) {
        // Update existing clarification
        await existingClarification.update({
          clarification_text: clarificationText,
          edited_by_name: currentUser.full_name || currentUser.username || 'Unknown',
          edited_by_email: currentUser.email || null
        });
      } else {
        // Create new clarification
        await TicketClarification.create({
          ticket_id: ticketId,
          edited_by_id: userId,
          edited_by_name: currentUser.full_name || currentUser.username || 'Unknown',
          edited_by_role: currentUser.role,
          edited_by_email: currentUser.email || null,
          clarification_text: clarificationText
        });
      }
      
      // Don't update ticket description - clarifications will be shown separately in modal
      // Description remains as original, clarifications are stored in TicketClarification table
    }

    // Assign to Director General using normal assignment process (simple, like normal assignment)
    await Ticket.update(
      {
        assigned_to_id: directorGeneral.id,
        assigned_to_role: directorGeneral.role,
        status: "Forwarded"
      },
      { where: { id: ticketId } }
    );

    // Create assignment record for Director General (simple, like normal assignment)
    // Use description from frontend (own_description), or default message if not provided
    let assignmentReason = "";
    if (own_description !== null && own_description !== undefined && String(own_description).trim()) {
      // Use description from frontend
      assignmentReason = String(own_description).trim();
    } else {
      // Fallback to default message based on role if no description provided
      if (currentUser.role === "director") {
        assignmentReason = "Director forwarded to Director General for final approval";
      } else if (currentUser.role === "head-of-unit") {
        assignmentReason = "Head of Unit forwarded to Director General for final approval";
      }
    }
    
    // Create Director General's assignment record (simple, like normal assignment)
    await TicketAssignment.create({
      ticket_id: ticketId,
      assigned_by_id: userId,
      assigned_to_id: directorGeneral.id,
      assigned_to_role: directorGeneral.role,
      action: "Forwarded",
      reason: assignmentReason,
      attachment_path: attachmentPath, // Save attachment path to assignment record
      created_at: new Date()
    });


    // Create notification for Director General
    await Notification.create({
      ticket_id: ticketId,
      sender_id: userId,
      recipient_id: directorGeneral.id,
      message: `Ticket forwarded to you: ${ticket.subject || ticket.ticket_id}`,
      channel: "In-System",
      status: "unread",
      category: ticket.category || "General",
    });

    // Send email to assigned Director General (if email exists)
    if (directorGeneral.email) {
      const emailSubject = `Ticket Assigned: ${ticket.subject || ""} (ID: ${ticket.ticket_id || ticketId})`;
      const bodyHtml = `
        <p>Dear ${directorGeneral.full_name || directorGeneral.username},</p>
        <p>A ticket has been assigned to you for review. Details:</p>
      `;
      const detailsHtml = `
        <ul>
          <li><strong>Ticket ID:</strong> ${ticket.ticket_id || ticketId}</li>
          <li><strong>Subject:</strong> ${ticket.subject || ""}</li>
          <li><strong>Description:</strong> ${ticket.description || ""}</li>
          <li><strong>Requester:</strong> ${getRequesterDisplayName(ticket)}</li>
          <li><strong>Resolution Details:</strong> ${ticket.resolution_details || "No resolution provided"}</li>
          <li><strong>Attachments:</strong> ${ticket.attachment_path ? "Available" : "None"}</li>
        </ul>
        <p>Please log in to the system to review and handle this ticket.</p>
      `;
      const emailHtmlBody = renderEmailCard(emailSubject, bodyHtml, detailsHtml);
      try {
        // Prepare attachments if ticket has attachment
        const attachments = ticket.attachment_path ? [ticket.attachment_path] : [];
        
        // Send assignment email in background
        setImmediate(() => {
          sendEmail({
            to: ['grace.tarimo@wcf.go.tz'],
            subject: emailSubject,
            htmlBody: emailHtmlBody,
            attachments: attachments
          }).catch(emailError => {
            console.error("Error sending assignment email:", emailError.message);
          });
        });
      } catch (emailError) {
        console.error("Error sending assignment email:", emailError.message);
      }
    }

    res.status(200).json({
      message: `${isMajorComplaint ? "Major complaint" : "Reversed ticket"} forwarded to ${directorGeneral.full_name || directorGeneral.username || directorGeneral.id} (${directorGeneral.role || "director-general"}) for review`,
      ticket: {
        ...ticket.toJSON(),
        assigned_to_name: directorGeneral.full_name,
      },
    });
  } catch (error) {
    console.error("Error forwarding to Director General:", error);
    return res.status(500).json({
      message: "Failed to forward to Director General",
      error: error.message,
    });
  }
};

// Get aging statistics for a specific user
const getUserAgingStats = async (req, res) => {
  try {
    const { userId } = req.params;
    const { period = "30" } = req.query; // Default to 30 days

    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(period));

    // Get all assignments for this user in the specified period
    const assignments = await TicketAssignment.findAll({
      where: {
        assigned_to_id: userId,
        created_at: {
          [Op.between]: [startDate, endDate],
        },
      },
      include: [
        {
          model: Ticket,
          as: "ticket",
          attributes: ["id", "category", "complaint_type", "status"],
        },
      ],
      order: [["created_at", "DESC"]],
    });

    // Calculate aging for each assignment
    const assignmentsWithAging = calculateAssignmentsAging(assignments, endDate, 'calendar');
    
    // Group by aging dg
    const stats = {
      total: assignmentsWithAging.length,
      onTime: 0,
      warning: 0,
      overdue: 0,
      critical: 0,
      averageDays: 0,
      totalDays: 0,
    };

    assignmentsWithAging.forEach((assignment) => {
      const status = getAgingStatus(
        assignment.aging.days,
        assignment.ticket?.category,
        assignment.ticket?.complaint_type
      );

      stats.totalDays += assignment.aging.days;

      switch (status) {
        case "On Time":
          stats.onTime++;
          break;
        case "Warning":
          stats.warning++;
          break;
        case "Overdue":
          stats.overdue++;
          break;
        case "Critical":
          stats.critical++;
          break;
      }
    });

    // Calculate averages
    if (stats.total > 0) {
      stats.averageDays =
        Math.round((stats.totalDays / stats.total) * 100) / 100;
    }

    // Calculate percentages
    stats.onTimePercent =
      stats.total > 0 ? Math.round((stats.onTime / stats.total) * 100) : 0;
    stats.warningPercent =
      stats.total > 0 ? Math.round((stats.warning / stats.total) * 100) : 0;
    stats.overduePercent =
      stats.total > 0 ? Math.round((stats.overdue / stats.total) * 100) : 0;
    stats.criticalPercent =
      stats.total > 0 ? Math.round((stats.critical / stats.total) * 100) : 0;

    // Get recent assignments with aging details
    const recentAssignments = assignmentsWithAging
      .slice(0, 10)
      .map((assignment) => ({
        ticket_id: assignment.ticket_id,
        category: assignment.ticket?.category,
        complaint_type: assignment.ticket?.complaint_type,
        status: assignment.ticket?.status,
        assigned_at: assignment.created_at,
        aging_days: assignment.aging.days,
        aging_formatted: formatAging(assignment.aging),
        aging_status: getAgingStatus(
          assignment.aging.days,
          assignment.ticket?.category,
          assignment.ticket?.complaint_type
        ),
      }));

    res.json({
      message: "User aging statistics fetched successfully",
      period: `${period} days`,
      stats,
      recentAssignments,
    });
  } catch (error) {
    console.error("Error in getUserAgingStats:", error);
    res.status(500).json({
      message: "Failed to fetch user aging statistics",
      error: error.message,
    });
  }
};

// External API endpoint for ticket status lookup
const getTicketStatusExternal = async (req, res) => {
  try {
    const { ticketId } = req.params;

    if (!ticketId) {
      return res.status(400).json({
        success: false,
        message: "Ticket ID is required",
        error: "MISSING_TICKET_ID",
      });
    }

    // Find ticket with minimal data for external systems
    const ticket = await Ticket.findOne({
      where: { id: ticketId },
      attributes: [
        "id",
        "ticket_id",
        "status",
        "category",
        "complaint_type",
        "subject",
        "created_at",
        "updated_at",
        "phone_number",
        "region",
        "responsible_unit_name",
      ],
      include: [
        {
          model: User,
          as: "assignee",
          attributes: ["id", "full_name", "role"],
        },
        {
          model: TicketAssignment,
          as: "assignments",
          attributes: ["id", "created_at", "status"],
          include: [
            {
              model: User,
              as: "assignedTo",
              attributes: ["id", "full_name", "email"]
            }
          ],
          order: [["created_at", "DESC"]],
          limit: 1,
        },
      ],
    });

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: "Ticket not found",
        error: "TICKET_NOT_FOUND",
        ticket_id: ticketId,
      });
    }

    // Calculate ticket age
    const createdAt = new Date(ticket.created_at);
    const now = new Date();
    const ageInDays = Math.floor((now - createdAt) / (1000 * 60 * 60 * 24));

    // Prepare response for external systems
    const response = {
      success: true,
      ticket: {
        id: ticket.id,
        ticket_number: ticket.ticket_id,
        status: ticket.status,
        category: ticket.category,
        complaint_type: ticket.complaint_type,
        subject: ticket.subject,
        phone_number: ticket.phone_number,
        region: ticket.region,
        responsible_unit: ticket.responsible_unit_name,
        created_at: ticket.created_at,
        updated_at: ticket.updated_at,
        age_in_days: ageInDays,
        current_assignee: ticket.assignee
          ? {
              id: ticket.assignee.id,
              full_name: ticket.assignee.full_name,
              role: ticket.assignee.role,
            }
          : null,
        last_assignment:
          ticket.assignments && ticket.assignments.length > 0
            ? {
                assigned_at: ticket.assignments[0].created_at,
                assigned_to: ticket.assignments[0].assignee
                  ? {
                      id: ticket.assignments[0].assignee.id,
                      full_name: ticket.assignments[0].assignee.full_name,
                      role: ticket.assignments[0].assignee.role,
                    }
                  : null,
              }
            : null,
      },
      timestamp: new Date().toISOString(),
    };

    return res.status(200).json(response);
  } catch (error) {
    console.error("Error in getTicketStatusExternal:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: "INTERNAL_ERROR",
    });
  }
};

const reverseComplaint = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { userId, recommendation, description } = req.body;

    if (!ticketId) {
      return res.status(400).json({ message: "Ticket ID is required" });
    }

    if (!userId || !recommendation) {
      return res.status(400).json({ 
        message: "User ID and recommendation are required" 
      });
    }

    // Get the current user to determine their role
    const currentUser = await User.findByPk(userId);
    if (!currentUser) {
      return res.status(404).json({ message: "User not found" });
    }

    const ticket = await Ticket.findOne({
      where: { id: ticketId },
      include: [
        {
          model: User,
          as: "creator",
          attributes: ["id", "full_name", "email", "role"]
        }
      ]
    });

    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    // Handle file upload if present
    let attachmentPath = null;
    if (req.file) {
      attachmentPath = `ticket_attachments/${req.file.filename}`; // Save relative path
      console.log("Attachment uploaded:", attachmentPath);
    }

    let targetUserId = null;
    let targetUserRole = null;
    let targetUserName = null;

    // Always use the previous assignment logic for all roles
    const assignments = await TicketAssignment.findAll({
      where: { ticket_id: ticketId },
      order: [["created_at", "DESC"]]
    });

    // Special handling for Manager receiving from Attendee in Major Complaint Directorate
    // Manager should forward to the Director who originally assigned the ticket to the Manager
    const isMajorComplaintDirectorate = ticket.category === "Complaint" && 
                                        ticket.complaint_type === "Major" &&
                                        ticket.responsible_unit_name && 
                                        ticket.responsible_unit_name.toLowerCase().includes("directorate");
    
    if (isMajorComplaintDirectorate && currentUser.role === "manager" && assignments.length > 0) {
      // Find the Director who assigned this ticket to the Manager
      // Skip the most recent assignment (index 0) which is likely Attendee -> Manager
      // Look for the original Director -> Manager assignment
      console.log(`Manager forwarding: Looking for Director. Total assignments: ${assignments.length}`);
      
      // First, try to find Director from assignment history (skip most recent)
      for (let i = 1; i < assignments.length; i++) {
        const assignment = assignments[i];
        if (assignment.assigned_to_role === "manager" && assignment.assigned_by_id) {
          // Check if the person who assigned (assigned_by_id) is a director
          const assigner = await User.findByPk(assignment.assigned_by_id);
          if (assigner && assigner.role === "director") {
            // Found the Director who assigned to Manager - use that Director
            targetUserId = assigner.id;
            targetUserRole = assigner.role;
            console.log(`✓ Manager forwarding to Director who assigned: ${assigner.full_name} (ID: ${assigner.id})`);
            break; // Found the director, exit loop
          }
        }
      }
      
      // If still not found, check all assignments (including index 0) but skip "Reversed" actions
      if (!targetUserId) {
        console.log(`Director not found in later assignments. Checking all assignments...`);
        for (const assignment of assignments) {
          if (assignment.assigned_to_role === "manager" && 
              assignment.assigned_by_id && 
              assignment.action !== "Reversed") {
            const assigner = await User.findByPk(assignment.assigned_by_id);
            if (assigner && assigner.role === "director") {
              targetUserId = assigner.id;
              targetUserRole = assigner.role;
              console.log(`✓ Found Director from all assignments: ${assigner.full_name} (ID: ${assigner.id})`);
              break;
            }
          }
        }
      }
      
      // If still not found, try to find Director by unit_section
      if (!targetUserId) {
        console.log(`Director not found in assignments. Searching by unit_section: ${ticket.responsible_unit_name}`);
        const director = await User.findOne({
          where: {
            role: "director",
            unit_section: ticket.responsible_unit_name
          }
        });
        
        if (director) {
          targetUserId = director.id;
          targetUserRole = director.role;
          console.log(`✓ Found Director by unit_section: ${director.full_name} (ID: ${director.id})`);
        }
      }
      
      // If still no director found, try to find any director (last resort)
      if (!targetUserId) {
        console.warn(`⚠ Director not found in assignments or unit. Searching for any director...`);
        const anyDirector = await User.findOne({
          where: {
            role: "director"
          }
        });
        
        if (anyDirector) {
          targetUserId = anyDirector.id;
          targetUserRole = anyDirector.role;
          console.log(`⚠ Using any available Director: ${anyDirector.full_name} (ID: ${anyDirector.id})`);
        } else {
          // If no director found at all, return error - DO NOT fall back to Attendee
          return res.status(404).json({ 
            message: "Cannot forward to Director: No Director found for this ticket. Please contact administrator." 
          });
        }
      }
    } else {
      // Standard logic: If there are at least 2 assignments, use the second most recent
    if (assignments.length >= 2) {
      const prevAssignment = assignments[1];
      targetUserId = prevAssignment.assigned_to_id;
      targetUserRole = prevAssignment.assigned_to_role;
    } else {
      // If no previous assignments, reverse to the ticket creator
      console.log(`No previous assignments found, reversing to ticket creator: ${ticket.creator.id}`);
      targetUserId = ticket.creator.id;
      targetUserRole = ticket.creator.role;
      }
    }
    
    // Fetch previous user details - try assignment first, then fall back to creator
    let prevUser = null;
    
    if (assignments.length >= 2) {
      prevUser = await User.findByPk(targetUserId);
      
      // If previous user not found, try to use the ticket creator as fallback
      if (!prevUser && ticket.creator) {
        console.log(`Previous user not found for ID: ${targetUserId}, falling back to ticket creator: ${ticket.creator.id}`);
        prevUser = ticket.creator;
      }
    } else {
      // Use the ticket creator directly
      prevUser = ticket.creator;
    }
    
    // If still no user found, return an error
    if (!prevUser) {
      console.warn(`No user found for target user ID: ${targetUserId} or ticket creator ID: ${ticket.userId}`);
      return res.status(404).json({ 
        message: "Cannot reverse complaint: Previous user not found. Please contact administrator." 
      });
    }
    
    targetUserName = prevUser.full_name;

    // For Major Complaint – Directorate, ensure ticket is never closed during workflow transitions
    // When returning from Attendee to Manager or Manager to Director, keep ticket open
    // Note: isMajorComplaintDirectorate is already declared above (line 5606)
    
    // Determine appropriate status based on workflow
    let newStatus = "Reversed";
    
    // For Major Complaint Directorate workflow transitions, use appropriate status
    if (isMajorComplaintDirectorate) {
      // When Manager recommends to Director, use "Attended and Recommended"
      if (currentUser.role === "manager" && targetUserRole === "director") {
        newStatus = "Attended and Recommended";
        console.log(`✓ Status set to "Attended and Recommended" for Manager -> Director`);
      } else {
        // For reverse actions or other cases, use "Reversed"
        newStatus = "Reversed";
        console.log(`Status set to "Reversed" for ${currentUser.role} -> ${targetUserRole}`);
      }
    }

    // Update the ticket to assign to the target user
    // IMPORTANT: Never close Major Complaint Directorate tickets during workflow transitions
    await ticket.update({
      assigned_to_id: targetUserId,
      assigned_to_role: targetUserRole,
      status: newStatus,
      attachment_path: attachmentPath, // Save attachment path to ticket
      attended_by_id: userId
    });

    // Add a new assignment record for the reversal
    await TicketAssignment.create({
      ticket_id: ticketId,
      assigned_by_id: userId,
      assigned_to_id: targetUserId,
      assigned_to_role: targetUserRole,
      action: "Reversed",
      reason: description || recommendation || "Complaint reversed with recommendation",
      attachment_path: attachmentPath, // Use attachment_path for consistency
      created_at: new Date()
    });

    // Create notification for the target user (the one receiving the reversed ticket)
    await Notification.create({
      ticket_id: ticketId,
      sender_id: userId,
      recipient_id: targetUserId,
      message: `Complaint reversed back to you: ${ticket.subject} (ID: ${ticket.ticket_id})`,
      channel: "In-System",
      status: "unread",
      category: ticket.category,
    });

    // Fetch attended_by user name and role
    let attended_by_name = currentUser.full_name;
    let attended_by_role = currentUser.role;

    // Notify all reviewers and supervisors
    const notifySubject = `Complaint Reversed: ${ticket.subject}`;
    const notifyHtml = `
      <p><strong>Complaint Reversed</strong></p>
      <p>The following complaint has been reversed:</p>
      <ul>
        <li><strong>Ticket ID:</strong> ${ticket.ticket_id}</li>
        <li><strong>Subject:</strong> ${ticket.subject}</li>
        <li><strong>Category:</strong> ${ticket.category}</li>
        <li><strong>Requester:</strong> ${getRequesterDisplayName(ticket)}</li>
        <li><strong>Reversed By:</strong> ${attended_by_name || 'Unknown'} (${attended_by_role || 'Unknown Role'})</li>
        <li><strong>Reversed To:</strong> ${targetUserName} (${targetUserRole || 'Unknown Role'})</li>
        <li><strong>Agent Recommendation:</strong> ${description || recommendation || 'No recommendation provided'}</li>
        <li><strong>Reversed Date:</strong> ${new Date().toLocaleString()}</li>
      </ul>
    `;
    const notifyMsg = `Complaint ${ticket.ticket_id} has been reversed by ${attended_by_name || 'Unknown'} (${attended_by_role || 'Unknown Role'}) to ${targetUserName}.`;
    await notifyUsersByRole(
      ["reviewer", "supervisor"],
      notifySubject,
      notifyHtml,
      ticketId,
      userId,
      notifyMsg
    );

    // Send email to the target user - use the same user we found earlier
    const targetUser = prevUser; // Use the user we already found (with fallback logic)
    if (targetUser && targetUser.email) {
      const subject = `Complaint Reversed: ${ticket.ticket_id || ticket.id}`;
      const bodyHtml = `
        <p>Hello ${targetUser.full_name || ""},</p>
        <p>The following complaint has been <b>reversed</b> to you:</p>
      `;
      const detailsHtml = `
        <ul>
          <li><b>Ticket ID:</b> ${ticket.ticket_id || ticket.id}</li>
          <li><b>Subject:</b> ${ticket.subject}</li>
          <li><b>Category:</b> ${ticket.category}</li>
          <li><b>Requester:</b> ${getRequesterDisplayName(ticket)}</li>
          <li><b>Status:</b> Reversed</li>
          <li><b>Reversed By:</strong> ${attended_by_name || 'Unknown'} (${attended_by_role || 'Unknown Role'})</li>
          <li><b>Agent Recommendation:</b> ${description || recommendation || 'No recommendation provided'}</li>
          ${attachmentPath ? `<li><b>Attachment:</b> Included</li>` : ''}
        </ul>
        <p>Please log into the system to review and take action.</p>
      `;
      const htmlBody = renderEmailCard(subject, bodyHtml, detailsHtml);
      
      // Get attachments for email
      const attachments = getTicketAttachments(ticket);
      
      // Send email in background to avoid blocking
      // sendEmailNonBlocking({ to: targetUser.email, subject, htmlBody, attachments: attachments });
      sendEmailNonBlocking({ to: 'grace.tarimo@wcf.go.tz', subject, htmlBody, attachments: attachments });
    }

    // Determine action message based on workflow
    let actionMessage = "Complaint reversed with recommendation successfully.";
    if (isMajorComplaintDirectorate && currentUser.role === "manager" && targetUserRole === "director") {
      actionMessage = "Complaint recommended to Director successfully.";
    } else if (isMajorComplaintDirectorate && currentUser.role === "attendee" && targetUserRole === "manager") {
      actionMessage = "Complaint recommended to Manager successfully.";
    }

    res
      .status(200)
      .json({ 
        message: actionMessage,
        data: {
          ticket_id: ticket.ticket_id,
          assigned_to: {
            id: targetUserId,
            name: targetUserName,
            role: targetUserRole
          },
          status: newStatus,
          action: isMajorComplaintDirectorate && (currentUser.role === "manager" || currentUser.role === "attendee") 
            ? "recommended" 
            : "reversed"
        }
      });
  } catch (error) {
    console.error("Error in reverseComplaint:", error);
    res.status(500).json({
      success: false,
      message: "Failed to reverse complaint",
      error: error.message
    });
  }
};

// DG approves and forwards to reviewer
const approveAndForwardToReviewer = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { userId, dg_notes } = req.body;

    if (!ticketId || !userId) {
      return res.status(400).json({ message: "Ticket ID and user ID are required" });
    }

    const ticket = await Ticket.findOne({
      where: { id: ticketId },
      include: [
        {
          model: User,
          as: "creator",
          attributes: ["id", "full_name"]
        },
        {
          model: User,
          as: "ratedBy",
          attributes: ["id", "full_name", "email"]
        }
      ]
    });

    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    

    // Find Reviewer
    const reviewer = await User.findOne({
      where: { role: "reviewer" }
    });

    if (!reviewer) {
      return res.status(404).json({ 
        message: "Reviewer not found" 
      });
    }

    // Forward to Reviewer
    await Ticket.update(
      {
        assigned_to_id: reviewer.id,
        assigned_to_role: reviewer.role,
        status: "Assigned"
      },
      { where: { id: ticketId } }
    );

    // Record the assignment to Reviewer
    await TicketAssignment.create({
      ticket_id: ticketId,
      assigned_by_id: userId,
      assigned_to_id: reviewer.id,
      assigned_to_role: reviewer.role,
      action: "Forwarded",
      reason: dg_notes || "Director General approved and forwarded to reviewer",
      created_at: new Date()
    });

    // Create notification for Reviewer
    await Notification.create({
      ticket_id: ticketId,
      sender_id: userId,
      recipient_id: reviewer.id,
      message: `Ticket forwarded to you by Director General: ${ticket.subject || ticket.ticket_id}`,
      channel: "In-System",
      status: "unread",
    });

    // Send email to assigned Reviewer (if email exists)
    if (reviewer.email) {
      const emailSubject = `Ticket Forwarded: ${ticket.subject || ""} (ID: ${ticket.ticket_id || ticketId})`;
      const bodyHtml = `
        <p>Dear ${reviewer.full_name || reviewer.username},</p>
        <p>A ticket has been forwarded to you by the Director General. Details:</p>
      `;
      const detailsHtml = `
        <ul>
          <li><strong>Ticket ID:</strong> ${ticket.ticket_id || ticketId}</li>
          <li><strong>Subject:</strong> ${ticket.subject || ""}</li>
          <li><strong>Description:</strong> ${ticket.description || ""}</li>
          <li><strong>Requester:</strong> ${getRequesterDisplayName(ticket)}</li>
          <li><strong>DG Notes:</strong> ${dg_notes || "No notes provided"}</li>
          <li><strong>Attachments:</strong> ${ticket.attachment_path ? "Available" : "None"}</li>
        </ul>
        <p>Please log in to the system to review and handle this ticket.</p>
      `;
      const emailHtmlBody = renderEmailCard(emailSubject, bodyHtml, detailsHtml);
      try {
        setImmediate(() => {
          sendEmail({
            to: ['grace.tarimo@wcf.go.tz'],
            subject: emailSubject,
            htmlBody: emailHtmlBody
          }).catch(emailError => {
            console.error("Error sending assignment email:", emailError.message);
          });
        });
      } catch (emailError) {
        console.error("Error sending assignment email:", emailError.message);
      }
    }

    res.status(200).json({
      message: `Ticket approved and forwarded to ${reviewer.full_name || reviewer.username || reviewer.id} (${reviewer.role || "reviewer"}) successfully`,
      ticket: {
        ...ticket.toJSON(),
        assigned_to_name: reviewer.full_name
      }
    });
  } catch (error) {
    console.error("Error approving and forwarding to reviewer:", error);
    return res.status(500).json({
      message: "Failed to approve and forward to reviewer",
      error: error.message
    });
  }
};

// DG reverses and assigns to reviewer
const reverseAndAssignToReviewer = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { userId, dg_notes, description } = req.body;

    if (!ticketId || !userId) {
      return res.status(400).json({ message: "Ticket ID and user ID are required" });
    }

    const ticket = await Ticket.findOne({
      where: { id: ticketId },
      include: [
        {
          model: User,
          as: "creator",
          attributes: ["id", "full_name"]
        },
        {
          model: User,
          as: "ratedBy",
          attributes: ["id", "full_name", "email"]
        }
      ]
    });

    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

   

    // Find Reviewer
    const reviewer = await User.findOne({
      where: { role: "reviewer" }
    });

    if (!reviewer) {
      return res.status(404).json({ 
        message: "Reviewer not found" 
      });
    }

    // Assign to Reviewer
    await Ticket.update(
      {
        assigned_to_id: reviewer.id,
        assigned_to_role: reviewer.role,
        status: "Assigned"
      },
      { where: { id: ticketId } }
    );

    // Record the assignment to Reviewer
    await TicketAssignment.create({
      ticket_id: ticketId,
      assigned_by_id: userId,
      assigned_to_id: reviewer.id,
      assigned_to_role: reviewer.role,
      action: "Assigned",
      reason: description || dg_notes || "Director General reversed and assigned to reviewer for more clarification",
      created_at: new Date()
    });

    // Create notification for Reviewer
    await Notification.create({
      ticket_id: ticketId,
      sender_id: userId,
      recipient_id: reviewer.id,
      message: `Ticket assigned to you by Director General for clarification: ${ticket.subject || ticket.ticket_id}`,
      channel: "In-System",
      status: "unread",
    });

    // Send email to assigned Reviewer (if email exists)
    if (reviewer.email) {
      const emailSubject = `Ticket Assigned: ${ticket.subject || ""} (ID: ${ticket.ticket_id || ticketId})`;
      const bodyHtml = `
        <p>Dear ${reviewer.full_name || reviewer.username},</p>
        <p>A ticket has been assigned to you by the Director General for more clarification. Details:</p>
      `;
      const detailsHtml = `
        <ul>
          <li><strong>Ticket ID:</strong> ${ticket.ticket_id || ticketId}</li>
          <li><strong>Subject:</strong> ${ticket.subject || ""}</li>
          <li><strong>Description:</strong> ${ticket.description || ""}</li>
          <li><strong>Requester:</strong> ${getRequesterDisplayName(ticket)}</li>
          <li><strong>DG Notes:</strong> ${description || dg_notes || "No notes provided"}</li>
          <li><strong>Attachments:</strong> ${ticket.attachment_path ? "Available" : "None"}</li>
        </ul>
        <p>Please log in to the system to review and handle this ticket.</p>
      `;
      const emailHtmlBody = renderEmailCard(emailSubject, bodyHtml, detailsHtml);
      try {
        setImmediate(() => {
          sendEmail({
            to: ['grace.tarimo@wcf.go.tz'],
            subject: emailSubject,
            htmlBody: emailHtmlBody
          }).catch(emailError => {
            console.error("Error sending assignment email:", emailError.message);
          });
        });
      } catch (emailError) {
        console.error("Error sending assignment email:", emailError.message);
      }
    }

    res.status(200).json({
      message: `Ticket reversed and assigned to ${reviewer.full_name || reviewer.username || reviewer.id} (${reviewer.role || "reviewer"}) successfully`,
      ticket: {
        ...ticket.toJSON(),
        assigned_to_name: reviewer.full_name
      }
    });
  } catch (error) {
    console.error("Error reversing and assigning to reviewer:", error);
    return res.status(500).json({
      message: "Failed to reverse and assign to reviewer",
      error: error.message
    });
  }
};

/**
 * Get workflow information for a ticket
 */
const getTicketWorkflowInfo = async (req, res) => {
  try {
    const { ticketId } = req.params;
    
    if (!ticketId) {
      return res.status(400).json({ message: "Ticket ID is required" });
    }

    const ticket = await Ticket.findByPk(ticketId);
    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    // Check if ticket has workflow path set
    if (!ticket.workflow_path) {
      return res.status(400).json({ 
        message: "This ticket does not have a workflow path set",
        ticket: {
          id: ticket.id,
          ticket_id: ticket.ticket_id,
          subject: ticket.subject,
          category: ticket.category,
          status: ticket.status
        }
      });
    }

    // Get workflow information using the service
    const workflowInfo = workflowService.getWorkflowInfo(ticket);
    if (!workflowInfo) {
      return res.status(400).json({ 
        message: "Invalid workflow path for this ticket",
        workflow_path: ticket.workflow_path
      });
    }

    // Get SLA compliance status
    const slaCompliance = workflowService.checkSLACompliance(ticket);
    
    // Calculate estimated completion
    const estimatedCompletion = workflowService.calculateEstimatedCompletion(ticket);

    // Get current assignment details
    let currentAssignee = null;
    if (ticket.assigned_to_id) {
      currentAssignee = await User.findByPk(ticket.assigned_to_id, {
        attributes: ['id', 'full_name', 'username', 'role', 'email']
      });
    }

    return res.json({
      success: true,
      data: {
        ticket: {
          id: ticket.id,
          ticket_id: ticket.ticket_id,
          subject: ticket.subject,
          category: ticket.category,
          complaint_type: ticket.complaint_type,
          status: ticket.status,
          unit_section: ticket.unit_section,
          workflow_path: ticket.workflow_path,
          current_workflow_step: ticket.current_workflow_step,
          workflow_total_steps: ticket.workflow_total_steps,
          workflow_current_role: ticket.workflow_current_role,
          workflow_started_at: ticket.workflow_started_at,
          workflow_completed: ticket.workflow_completed,
          created_at: ticket.created_at,
          updated_at: ticket.updated_at
        },
        workflow: {
          path: workflowInfo.path,
          current_step: workflowInfo.currentStep,
          total_steps: workflowInfo.totalSteps,
          current_role: workflowInfo.currentRole,
          next_role: workflowInfo.nextRole,
          steps: workflowInfo.steps,
          sla: workflowInfo.sla
        },
        sla: {
          compliance: slaCompliance,
          estimated_completion: estimatedCompletion,
          current_step_deadline: workflowService.getNextStepDeadline ? 
            workflowService.getNextStepDeadline(ticket, workflowInfo.sla) : null
        },
        current_assignment: currentAssignee ? {
          id: currentAssignee.id,
          name: currentAssignee.full_name,
          username: currentAssignee.username,
          role: currentAssignee.role,
          email: currentAssignee.email
        } : null,
        progress: {
          percentage: Math.round((workflowInfo.currentStep / workflowInfo.totalSteps) * 100),
          current_step: workflowInfo.currentStep,
          total_steps: workflowInfo.totalSteps,
          remaining_steps: workflowInfo.totalSteps - workflowInfo.currentStep
        }
      }
    });

  } catch (error) {
    console.error("Error getting ticket workflow info:", error);
    return res.status(500).json({ 
      message: "Internal server error", 
      error: error.message 
    });
  }
};

/**
 * Get workflow audit trail for a ticket
 */
const getTicketWorkflowAuditTrail = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { userId } = req.body;

    // Find the ticket
    const ticket = await Ticket.findByPk(ticketId);
    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    // Get all assignments for this ticket
    const assignments = await TicketAssignment.findAll({
      where: { ticket_id: ticketId },
      order: [["created_at", "DESC"]],
      include: [
        {
          model: User,
          as: "assignedBy",
          attributes: ["id", "full_name", "username", "role", "unit_section"]
        },
        {
          model: User,
          as: "assignedTo",
          attributes: ["id", "full_name", "username", "role", "unit_section"]
        }
      ]
    });

    // Calculate aging for each assignment
    const assignmentsWithAging = await Promise.all(
      assignments.map(async (assignment) => {
        const aging = await calculateAssignmentsAging(assignment);
        return {
          ...assignment.toJSON(),
          aging_formatted: aging.formatted,
          aging_status: aging.status
        };
      })
    );

    res.status(200).json({
      message: "Workflow audit trail retrieved successfully",
      auditTrail: assignmentsWithAging
    });
  } catch (error) {
    console.error("Error getting workflow audit trail:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Manager attending major complaints - send to Head of Unit
const managerAttendMajor = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { userId, recommendation, reason, evidence_url, responsible_unit_name } = req.body;

    // Find the ticket
    const ticket = await Ticket.findByPk(ticketId);
    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    // Verify the user is a manager and the ticket is assigned to them
    const manager = await User.findByPk(userId);
    if (!manager || manager.role !== "manager") {
      return res.status(403).json({ message: "Only managers can perform this action" });
    }

    if (ticket.assigned_to_id !== userId) {
      return res.status(403).json({ message: "Ticket is not assigned to you" });
    }

    // Allow: Minor Complaints, Unrated (N/A) Complaints, Suggestion, or Compliment
    // Managers close Minor complaints or unrated complaints, NOT Major complaints
    const isAllowed = (ticket.category === "Complaint" && (ticket.complaint_type === "Minor" || ticket.complaint_type === "N/A" || !ticket.complaint_type)) || 
                      ticket.category === "Suggestion" || 
                      ticket.category === "Compliment";
    if (!isAllowed) {
      return res.status(400).json({ message: "This action is only for Minor or unrated complaints, suggestion or compliment." });
    }

    // Determine the target unit section
    const targetUnitSection = responsible_unit_name || manager.unit_section;
    if (!targetUnitSection) {
      return res.status(400).json({ message: "No target unit section found" });
    }

    // Find Head of Unit or Director in the target unit section
    const headOfUnit = await User.findOne({
      where: {
        unit_section: targetUnitSection,
        role: {
          [Op.in]: ["head-of-unit", "director"]
        }
      }
    });

    if (!headOfUnit) {
      return res.status(404).json({ 
        message: `No Head of Unit found for unit section: ${targetUnitSection}` 
      });
    }

    // Create ticket assignment record for manager's attendance
    await TicketAssignment.create({
      ticket_id: ticketId,
      assigned_by_id: userId,
      assigned_to_id: userId,
      assigned_to_role: "manager",
      action: "Reversed",
      reason: recommendation || "Manager attended Major complaint",
      attachment_path: evidence_url,
      created_at: new Date()
    });

    // Update ticket to assign to Head of Unit or Director
    // For Major Complaint – Directorate, ensure ticket is never closed during workflow transitions
    const isMajorComplaintDirectorate = ticket.complaint_type === "Major" &&
                                        ticket.responsible_unit_name && 
                                        ticket.responsible_unit_name.toLowerCase().includes("directorate");
    
    // Determine appropriate status - never close Major Complaint Directorate tickets here
    let newStatus = "Assigned";
    if (isMajorComplaintDirectorate && headOfUnit.role === "director") {
      // When Manager recommends to Director in Major Complaint Directorate workflow
      newStatus = "Attended and Recommended";
    }
    
    ticket.assigned_to_id = headOfUnit.id;
    ticket.assigned_to_role = headOfUnit.role;
    ticket.status = newStatus;
    ticket.responsible_unit_name = targetUnitSection;
    await ticket.save();

    // Create ticket assignment record for assignment to Head of Unit
    await TicketAssignment.create({
      ticket_id: ticketId,
      assigned_by_id: userId,
      assigned_to_id: headOfUnit.id,
      assigned_to_role: headOfUnit.role,
      action: "Assigned",
      reason: reason || `Ticket attended by manager and assigned to ${targetUnitSection}`,
      created_at: new Date()
    });

    // Create notification for Head of Unit
    await Notification.create({
      ticket_id: ticketId,
      sender_id: userId,
      recipient_id: headOfUnit.id,
      message: `Major complaint attended by manager and assigned to you: ${ticket.subject || ticket.ticket_id}`,
      channel: "In-System",
      status: "unread",
      category: "Assigned"
    });

    // Send email to Head of Unit
    if (headOfUnit.email) {
      const emailSubject = `Major Complaint Attended and Assigned: ${ticket.subject || ticket.ticket_id}`;
      const emailBody = `
        <p>Dear ${headOfUnit.full_name || 'Head of Unit'},</p>
        <p>A major complaint has been attended by a manager and assigned to you for review.</p>
        <ul>
          <li><strong>Ticket ID:</strong> ${ticket.ticket_id}</li>
          <li><strong>Subject:</strong> ${ticket.subject || 'N/A'}</li>
          <li><strong>Category:</strong> ${ticket.category}</li>
          <li><strong>Complaint Type:</strong> ${ticket.complaint_type}</li>
          <li><strong>Manager's Recommendation:</strong> ${recommendation || 'No recommendation provided'}</li>
          <li><strong>Unit Section:</strong> ${targetUnitSection}</li>
        </ul>
        <p>Please log into the system to review and take appropriate action.</p>
        <p>Thank you.</p>
      `;
      
      const attachments = getTicketAttachments(ticket);
      sendEmail({
        // to: headOfUnit.email,
        to: ['grace.tarimo@wcf.go.tz'],
        subject: emailSubject,
        htmlBody: emailBody,
        attachments: attachments
      }).catch(emailError => {
        console.error("Error sending email to Head of Unit:", emailError.message);
      });
    }

    res.status(200).json({
      message: `Major complaint attended and assigned to ${headOfUnit.full_name || headOfUnit.username || headOfUnit.id} (${headOfUnit.role || "head-of-unit"}) successfully`,
      data: {
        ticket,
        assignedTo: {
          id: headOfUnit.id,
          name: headOfUnit.full_name,
          role: headOfUnit.role,
          unit_section: headOfUnit.unit_section
        }
      }
    });
  } catch (error) {
    console.error("Error in manager attend major:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Update reversed ticket details (subject and section)
const updateReversedTicketDetails = async (req, res) => {
  // VERY PROMINENT LOGS AT THE START - SHOULD ALWAYS SHOW
  console.error('\n\n\n');
  console.error('═══════════════════════════════════════════════════════════');
  console.error('🔍🔍🔍 updateReversedTicketDetails FUNCTION CALLED 🔍🔍🔍');
  console.error('═══════════════════════════════════════════════════════════');
  console.error('Timestamp:', new Date().toISOString());
  console.error('Request method:', req.method);
  console.error('Request URL:', req.originalUrl || req.url);
  console.error('Request params:', JSON.stringify(req.params));
  console.error('Request body keys:', Object.keys(req.body || {}));
  console.error('═══════════════════════════════════════════════════════════\n\n');
  
  try {
    const { ticketId } = req.params;
    const { userId, subject, section, sub_section, responsible_unit_id, responsible_unit_name } = req.body;
    
    console.error('🔍 Extracted values:');
    console.error('  - ticketId:', ticketId);
    console.error('  - userId:', userId);
    console.error('  - subject:', subject);
    console.error('  - section:', section);
    console.error('  - sub_section:', sub_section);
    console.error('  - responsible_unit_id:', responsible_unit_id);
    console.error('  - responsible_unit_name:', responsible_unit_name);
    console.error('');

    if (!ticketId || !userId) {
      console.error('❌ ERROR: Missing ticketId or userId');
      console.error('  - ticketId:', ticketId);
      console.error('  - userId:', userId);
      return res.status(400).json({ message: "Ticket ID and user ID are required" });
    }

    if (!subject) {
      console.error('❌ ERROR: Missing subject');
      return res.status(400).json({ message: "Subject is required" });
    }
    
    console.error('✅ Validation passed, proceeding with update...');

    // Get the ticket
    const ticket = await Ticket.findOne({
      where: { id: ticketId },
      include: [
        {
          model: User,
          as: "creator",
          attributes: ["id", "full_name"]
        },
        {
          model: User,
          as: "assignee",
          attributes: ["id", "full_name", "role", "unit_section"],
          required: false
        }
      ]
    });

    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    // Check if ticket is reversed and assigned to the current user
    if (ticket.status !== "Reversed") {
      return res.status(400).json({ message: "Only reversed tickets can be updated" });
    }

    if (!ticket.assigned_to_id || String(ticket.assigned_to_id) !== String(userId)) {
      return res.status(403).json({ message: "You can only update tickets assigned to you" });
    }

    // Get function_id from function_data_id using database relationship
    console.log('🔍 Received responsible_unit_id:', responsible_unit_id);
    const mappedResponsibleUnitId = await getFunctionIdFromFunctionDataId(responsible_unit_id);
    console.log('🔍 Mapped to function ID:', mappedResponsibleUnitId);

    // Update the ticket details
    const updateData = {
      subject: subject,
      responsible_unit_id: mappedResponsibleUnitId || null,
      responsible_unit_name: responsible_unit_name || null
    };

    // Add section and sub_section if provided
    if (section) {
      updateData.section = section;
    }
    if (sub_section) {
      updateData.sub_section = sub_section;
    }

    // Find focal-person for the specific unit/directorate (no fallback - must be the specific focal person)
    let assignedUser = null;
    let assignedRole = null;
    
    if (responsible_unit_name && responsible_unit_name.trim() !== "") {
      const trimmedUnitName = responsible_unit_name.trim();
      const trimmedSubSection = sub_section && sub_section.trim() !== "" ? sub_section.trim() : null;
      
      console.log("🔍 ===== STARTING FOCAL PERSON SEARCH =====");
      console.log("🔍 Looking for focal-person for unit/directorate:", trimmedUnitName);
      console.log("🔍 Also checking sub_section:", trimmedSubSection);
      
      // Only find focal-person for this specific unit/directorate - NO FALLBACK TO DIRECTOR OR HEAD-OF-UNIT
      // Priority 1: Try matching by sub_section first (more specific)
      // Priority 2: Then try matching by unit_section (directorate/unit name)
      let searchConditions = [];
      
      // First priority: search by sub_section if provided (more specific match)
      if (trimmedSubSection) {
        searchConditions.push(
          { unit_section: trimmedSubSection },
          Sequelize.where(
            Sequelize.fn('LOWER', Sequelize.col('unit_section')),
            Sequelize.fn('LOWER', trimmedSubSection)
          )
        );
        console.log("🔍 Priority 1: Searching by sub_section:", trimmedSubSection);
      }
      
      // Second priority: search by unit_section (directorate/unit name)
      searchConditions.push(
        { unit_section: trimmedUnitName },
        Sequelize.where(
          Sequelize.fn('LOWER', Sequelize.col('unit_section')),
          Sequelize.fn('LOWER', trimmedUnitName)
        )
      );
      console.log("🔍 Priority 2: Searching by unit_section:", trimmedUnitName);
      
        assignedUser = await User.findOne({
          where: {
            role: "focal-person",
          [Op.or]: searchConditions
          },
          attributes: ["id", "full_name", "email", "role", "unit_section"],
        order: [
          // Prefer exact matches first, then case-insensitive
          [Sequelize.literal(`CASE WHEN unit_section = '${trimmedSubSection || trimmedUnitName}' THEN 1 ELSE 2 END`), 'ASC']
        ]
        });
        assignedRole = "focal-person";
      
      if (assignedUser) {
        console.log("✅ SUCCESS: Found focal person:", assignedUser.full_name, "ID:", assignedUser.id);
        console.log("✅ Focal person unit_section:", assignedUser.unit_section);
        console.log("✅ Matched with:", trimmedUnitName);
      } else {
        console.log("❌ ERROR: No focal person found for unit/directorate:", trimmedUnitName);
        if (sub_section) {
          console.log("❌ Also checked sub_section:", sub_section);
        }
        console.log("❌ Ticket will NOT be reassigned - focal person MUST exist");
        console.log("❌ NO FALLBACK to director or head-of-unit - assignment will remain unchanged");
        
        // Log all focal persons in database for debugging
        const allFocalPersons = await User.findAll({
          where: { role: "focal-person" },
          attributes: ["id", "full_name", "unit_section"],
        });
        console.log("📋 All focal persons in database:", JSON.stringify(allFocalPersons.map(fp => ({
          name: fp.full_name,
          unit_section: fp.unit_section
        })), null, 2));
        console.log("🔍 ===== END FOCAL PERSON SEARCH =====");
      }
    } else {
      console.log("⚠️ No responsible_unit_name provided - cannot find focal person");
      console.log("⚠️ Ticket assignment will NOT be changed");
    }

    // Update ticket with focal person assignment ONLY if found (no fallback)
    // CRITICAL: Only assign if we found a focal-person - NEVER assign to director or head-of-unit
    if (assignedUser && assignedUser.role === "focal-person") {
      updateData.assigned_to_id = assignedUser.id;
      updateData.assigned_to_role = "focal-person";
      console.log(`✅✅✅ REASSIGNING to focal-person: ${assignedUser.full_name} (ID: ${assignedUser.id}) for unit/directorate: ${responsible_unit_name}`);
      console.log(`✅✅✅ assigned_to_role will be set to: focal-person`);
    } else {
      if (assignedUser && assignedUser.role !== "focal-person") {
        console.log(`❌❌❌ SECURITY CHECK: assignedUser role is "${assignedUser.role}" not "focal-person" - NOT ASSIGNING`);
        assignedUser = null; // Clear it to prevent assignment
      }
      console.log(`❌ ERROR: Cannot reassign ticket - no focal person found for unit/directorate: ${responsible_unit_name}`);
      console.log(`❌ Ticket assignment will NOT be changed - stays with current assignee`);
      // Explicitly remove assignment fields from updateData to ensure no assignment happens
      delete updateData.assigned_to_id;
      delete updateData.assigned_to_role;
    }

    console.log('🔍 About to update ticket with updateData:', JSON.stringify(updateData, null, 2));
    console.log('🔍 assignedUser before update:', assignedUser ? `${assignedUser.full_name} (${assignedUser.role})` : 'null');

    await ticket.update(updateData);
    
    // Reload ticket to get fresh data after update
    await ticket.reload({
      include: [
        {
          model: User,
          as: "assignee",
          attributes: ["id", "full_name", "role", "unit_section"]
        }
      ]
    });
    
    console.log('🔍 Ticket after update - assigned_to_id:', ticket.assigned_to_id);
    console.log('🔍 Ticket after update - assigned_to_role:', ticket.assigned_to_role);
    console.log('🔍 Ticket after update - assignee:', ticket.assignee ? `${ticket.assignee.full_name} (${ticket.assignee.role})` : 'null');

    // Create assignment record if ticket was reassigned
    if (assignedUser && assignedUser.id !== userId && assignedUser.role === "focal-person") {
      const actionMessage = "Reassigned to focal person after details update";
      
      console.log('🔍 Creating TicketAssignment record for focal person:', assignedUser.full_name);
      
      await TicketAssignment.create({
        ticket_id: ticketId,
        assigned_by_id: userId,
        assigned_to_id: assignedUser.id,
        assigned_to_role: "focal-person",
        action: actionMessage,
        reason: `Ticket details updated - Subject: ${subject}, Section: ${section || 'N/A'}, Sub-section: ${sub_section || 'N/A'}}`,
        created_at: new Date(),
      });
    } else {
      console.log('🔍 NOT creating TicketAssignment - assignedUser:', assignedUser ? `${assignedUser.full_name} (${assignedUser.role})` : 'null');
    }

    // Create a notification for the update
    const notificationMessage = assignedUser 
      ? `Ticket details updated and reassigned to focal person: ${ticket.subject} (ID: ${ticket.ticket_id})`
      : `Ticket details updated: ${ticket.subject} (ID: ${ticket.ticket_id})`;

    await Notification.create({
      ticket_id: ticketId,
      sender_id: userId,
      recipient_id: ticket.assigned_to_id,
      message: notificationMessage,
      channel: "Agent",
      status: "unread",
      category: ticket.category,
    });

    // If ticket was reassigned, create notification for the new assignee
    if (assignedUser && assignedUser.id !== userId) {
      await Notification.create({
        ticket_id: ticketId,
        sender_id: userId,
        recipient_id: assignedUser.id,
        message: `Ticket reassigned to you: ${ticket.subject} (ID: ${ticket.ticket_id})`,
        channel: "In-System",
        status: "unread",
        category: ticket.category,
      });
    }

    // Log the update
    console.log(`Ticket ${ticketId} details updated by user ${userId}:`, updateData);

    // Determine response message based on ACTUAL ticket state after update
    const actualAssignedRole = ticket.assigned_to_role;
    const actualAssignedUser = ticket.assignee;
    
    console.log('🔍 ===== RESPONSE PREPARATION =====');
    console.log('🔍 actualAssignedRole from ticket:', actualAssignedRole);
    console.log('🔍 actualAssignedUser from ticket:', actualAssignedUser ? `${actualAssignedUser.full_name} (${actualAssignedUser.role})` : 'null');
    console.log('🔍 assignedUser variable:', assignedUser ? `${assignedUser.full_name} (${assignedUser.role})` : 'null');
    
    // Only say "reassigned" if we actually found and assigned a focal-person
    let responseMessage;
    if (assignedUser && assignedUser.role === "focal-person" && actualAssignedRole === "focal-person") {
      responseMessage = `Ticket details updated successfully and reassigned to focal person`;
      console.log('✅ Response: Reassigned to focal person');
    } else {
      responseMessage = "Ticket details updated successfully";
      console.log('ℹ️ Response: Updated only (no reassignment)');
    }

    const responseData = {
      message: responseMessage,
      ticket: {
        id: ticket.id,
        ticket_id: ticket.ticket_id,
        subject: ticket.subject,
        section: ticket.section,
        sub_section: ticket.sub_section,
        responsible_unit_id: ticket.responsible_unit_id,
        responsible_unit_name: ticket.responsible_unit_name,
        assigned_to_id: ticket.assigned_to_id,
        assigned_to_role: ticket.assigned_to_role
      }
    };

    // Only include assigned_user if we actually assigned to focal-person
    if (assignedUser && assignedUser.role === "focal-person" && actualAssignedRole === "focal-person") {
      responseData.assigned_user = {
        id: assignedUser.id,
        full_name: assignedUser.full_name,
        role: "focal-person",
        unit_section: assignedUser.unit_section
      };
        responseData.focal_person = {
          id: assignedUser.id,
          full_name: assignedUser.full_name,
        role: "focal-person",
          unit_section: assignedUser.unit_section
        };
      console.log('✅ Including assigned_user in response:', assignedUser.full_name);
    } else {
      console.log('❌ NOT including assigned_user - no focal person assigned');
    }
    
    console.log('🔍 Final responseData:', JSON.stringify(responseData, null, 2));
    console.log('🔍 ===== END RESPONSE PREPARATION =====');

    return res.json(responseData);

  } catch (error) {
    console.error("Error updating reversed ticket details:", error);
    return res.status(500).json({ 
      message: "Internal server error", 
      error: error.message 
    });
  }
};

// Manager send to Director when receiving from Attendee (Complaint Directorate - Major or Minor)
const managerSendToDirector = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { userId, recommendation, resolution_details } = req.body;

    if (!ticketId || !userId || !recommendation) {
      return res.status(400).json({ 
        message: "Ticket ID, User ID, and recommendation are required" 
      });
    }

    // Get the current user
    const manager = await User.findByPk(userId);
    if (!manager || manager.role !== "manager") {
      return res.status(403).json({ message: "Only managers can perform this action" });
    }

    // Find the ticket
    const ticket = await Ticket.findOne({
      where: { id: ticketId },
      include: [
        {
          model: User,
          as: "creator",
          attributes: ["id", "full_name", "email", "role"]
        }
      ]
    });

    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    // Verify ticket is assigned to this manager
    if (ticket.assigned_to_id !== userId) {
      return res.status(403).json({ message: "Ticket is not assigned to you" });
    }

    // Check if this is a Complaint (Major or Minor)
    // Normalize complaint_type for case-insensitive comparison
    const complaintType = ticket.complaint_type ? ticket.complaint_type.trim().toLowerCase() : "";
    const isComplaint = ["Complaint", "Suggestion", "Complement"].includes(ticket.category);
    const isMajorOrMinor = complaintType === "major" || complaintType === "minor";
    
    console.log("DEBUG managerSendToDirector:", {
      category: ticket.category,
      complaint_type: ticket.complaint_type,
      complaintType_normalized: complaintType,
      responsible_unit_name: ticket.responsible_unit_name,
      isComplaint,
      isMajorOrMinor
    });

    // Allow Complaint, Suggestion, or Complement
    // For Complaint, must be Major or Minor
    // For Suggestion and Complement, no complaint_type required
    const allowedCategories = ["Complaint", "Suggestion", "Complement"];
    if (!allowedCategories.includes(ticket.category)) {
      return res.status(400).json({ 
        message: `This action is only for Complaint, Suggestion, or Complement tickets. Current category: ${ticket.category}` 
      });
    }
    
    // Only check complaint_type for Complaint category
    if (ticket.category === "Complaint" && !isMajorOrMinor) {
      return res.status(400).json({ 
        message: `This action is only for Major or Minor complaints. Current type: ${ticket.complaint_type || 'N/A'}` 
      });
    }
    
    // Log success for debugging
    console.log("✅ managerSendToDirector check passed - allowing:", {
      category: ticket.category,
      complaint_type: ticket.complaint_type,
      responsible_unit_name: ticket.responsible_unit_name
    });

    // Check if ticket came from Attendee (most recent assignment)
    const assignments = await TicketAssignment.findAll({
      where: { ticket_id: ticketId },
      order: [["created_at", "DESC"]],
      limit: 1
    });

    let cameFromAttendee = false;
    if (assignments.length > 0) {
      const mostRecentAssignment = assignments[0];
      if (mostRecentAssignment.assigned_to_role === "manager" && mostRecentAssignment.assigned_by_id) {
        const previousUser = await User.findByPk(mostRecentAssignment.assigned_by_id);
        if (previousUser && previousUser.role === "attendee") {
          cameFromAttendee = true;
        }
      }
    }

    // Handle file upload if present
    let attachmentPath = null;
    if (req.file) {
      attachmentPath = `ticket_attachments/${req.file.filename}`;
      console.log("Attachment uploaded:", attachmentPath);
    }

    // Find Director - try multiple methods
    let director = null;

    // Method 1: Find Director by unit_section
    if (ticket.responsible_unit_name) {
      director = await User.findOne({
        where: {
          role: "director",
          unit_section: ticket.responsible_unit_name
        }
      });
    }

    // Method 2: Find Director from assignment history (who assigned to Manager)
    if (!director) {
      const allAssignments = await TicketAssignment.findAll({
        where: { ticket_id: ticketId },
        order: [["created_at", "DESC"]]
      });

      for (const assignment of allAssignments) {
        if (assignment.assigned_to_role === "manager" && assignment.assigned_by_id) {
          const assigner = await User.findByPk(assignment.assigned_by_id);
          if (assigner && assigner.role === "director") {
            director = assigner;
            break;
          }
        }
      }
    }

    // Method 3: Find any Director (last resort)
    if (!director) {
      director = await User.findOne({
        where: {
          role: "director"
        }
      });
    }

    if (!director) {
      return res.status(404).json({ 
        message: "Cannot send to Director: No Director found for this ticket. Please contact administrator." 
      });
    }

    // Save clarification to TicketClarification table instead of appending to description
    // This prevents duplicates when ticket is reversed and reversed again
    if (resolution_details !== null && resolution_details !== undefined && String(resolution_details).trim()) {
      const clarificationText = String(resolution_details).trim();
      
      // Check if clarification already exists for this ticket/user/role combination
      const existingClarification = await TicketClarification.findOne({
        where: {
          ticket_id: ticketId,
          edited_by_id: userId,
          edited_by_role: manager.role
        }
      });
      
      if (existingClarification) {
        // Update existing clarification
        await existingClarification.update({
          clarification_text: clarificationText,
          edited_by_name: manager.full_name || manager.username || 'Unknown',
          edited_by_email: manager.email || null
        });
      } else {
        // Create new clarification
        await TicketClarification.create({
          ticket_id: ticketId,
          edited_by_id: userId,
          edited_by_name: manager.full_name || manager.username || 'Unknown',
          edited_by_role: manager.role,
          edited_by_email: manager.email || null,
          clarification_text: clarificationText
        });
      }
      
      // Don't update ticket description - clarifications will be shown separately in modal
      // Description remains as original, clarifications are stored in TicketClarification table
    }

    // Update ticket to assign to Director
    await ticket.update({
      assigned_to_id: director.id,
      assigned_to_role: director.role,
      status: "Attended and Recommended",
      attachment_path: attachmentPath,
      attended_by_id: userId
    });

    // Create assignment record
    await TicketAssignment.create({
      ticket_id: ticketId,
      assigned_by_id: userId,
      assigned_to_id: director.id,
      assigned_to_role: director.role,
      action: "Forwarded",
      reason: recommendation || "Manager recommended to Director",
      attachment_path: attachmentPath,
      created_at: new Date()
    });

    // Create notification for Director
    await Notification.create({
      ticket_id: ticketId,
      sender_id: userId,
      recipient_id: director.id,
      message: `Ticket recommended to you by Manager: ${ticket.subject} (ID: ${ticket.ticket_id})`,
      channel: "In-System",
      status: "unread",
      category: ticket.category,
    });

    // Send email to Director
    if (director.email) {
      const subject = `Ticket Recommended: ${ticket.ticket_id || ticketId}`;
      const bodyHtml = `
        <p>Hello ${director.full_name || ""},</p>
        <p>A ticket has been recommended to you by a Manager. Details:</p>
      `;
      const detailsHtml = `
        <ul>
          <li><b>Ticket ID:</b> ${ticket.ticket_id || ticket.id}</li>
          <li><b>Subject:</b> ${ticket.subject}</li>
          <li><b>Category:</b> ${ticket.category}</li>
          <li><b>Requester:</b> ${getRequesterDisplayName(ticket)}</li>
          <li><b>Status:</b> Attended and Recommended</li>
          <li><b>Manager's Recommendation:</b> ${recommendation}</li>
          ${attachmentPath ? `<li><b>Attachment:</b> Included</li>` : ''}
        </ul>
        <p>Please log into the system to review and take action.</p>
      `;
      const htmlBody = renderEmailCard(subject, bodyHtml, detailsHtml);
      
      // Get attachments for email
      const attachments = getTicketAttachments(ticket);
      
      sendEmailNonBlocking({ to: 'grace.tarimo@wcf.go.tz', subject, htmlBody, attachments: attachments });
    }

    res.status(200).json({
      message: "Ticket recommended to Director successfully.",
      data: {
        ticket_id: ticket.ticket_id,
        assigned_to: {
          id: director.id,
          name: director.full_name,
          role: director.role
        },
        status: "Attended and Recommended",
        action: "recommended"
      }
    });
  } catch (error) {
    console.error("Error in managerSendToDirector:", error);
    res.status(500).json({
      success: false,
      message: "Failed to send ticket to Director",
      error: error.message
    });
  }
};

// Get all workflow tickets (tickets with workflow_path set)
const getWorkflowTickets = async (req, res) => {
  try {
    const userId = req.user?.userId;
    
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const user = await User.findByPk(userId, {
      attributes: ["id", "full_name", "role", "unit_section"]
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Get tickets that have workflow_path set
    // Filter by user's role and assigned tickets
    let whereClause = {
      workflow_path: {
        [Op.ne]: null
      }
    };

    // If not super-admin or supervisor, show only tickets assigned to user or created by user
    if (user.role !== "super-admin" && user.role !== "supervisor") {
      whereClause[Op.or] = [
        { assigned_to_id: userId },
        { userId: userId },
        { created_by: userId }
      ];
    }

    const tickets = await Ticket.findAll({
      where: whereClause,
      attributes: { exclude: ["userId"] },
      include: [
        {
          model: User,
          as: "creator",
          attributes: ["id", "full_name", "email", "role"],
        },
        {
          model: User,
          as: "assignee",
          attributes: ["id", "full_name", "email", "role"],
        },
        {
          model: Section,
          as: "responsibleSection",
          attributes: ["id", "name"],
        },
        {
          model: TicketAssignment,
          as: "assignments",
          limit: 5,
          order: [["created_at", "DESC"]],
          include: [
            {
              model: User,
              as: "assignedTo",
              attributes: ["id", "full_name", "email", "role"]
            }
          ]
        }
      ],
      order: [["created_at", "DESC"]],
    });

    return res.json({
      success: true,
      data: tickets,
      message: "Workflow tickets fetched successfully"
    });
  } catch (error) {
    console.error("Error fetching workflow tickets:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message
    });
  }
};

module.exports = {
  getTicketCounts,
  generateTicketId,
  getFunctionIdFromFunctionDataId,
  createTicket,
  getTickets,
  getOpenTickets,
  getAssignedTickets,
  getInprogressTickets,
  getCarriedForwardTickets,
  getClosedTickets,
  getOverdueTickets,
  getAllCustomersTickets,
  getAllTickets,
  mockComplaintWorkflow,
  searchByPhoneNumber,
  searchByTicketId,
  getTicketById,
  notifyUsersByRole,
  closeTicket,
  closeReviewerTicket,
  assignTicket,
  getAllAttendee,
  getTicketAssignments,
  getAssignedOfficers,
  getTicketMentionUsers,
  getAssignedNotifiedTickets,
  getDashboardCounts,
  reassignTicket,
  getInProgressAssignments,
  reverseTicket,
  getOpenTicketsCount,
  getAssignedTicketsCount,
  getInprogressTicketsCount,
  getCarriedForwardTicketsCount,
  getClosedTicketsCount,
  getOverdueTicketsCount,
  getOverdueTicketsList,
  getEscalatedTicketsForUser,
  getEverAssignedTickets,
  getEverAssignedTicketsCount,
  getAllTicketsCount,
  getEscalatedFromTickets,
  getRequesterDisplayName,
  forwardToDirectorGeneral,
  getUserAgingStats,
  getTicketStatusExternal,
  reverseComplaint,
  approveAndForwardToReviewer,
  reverseAndAssignToReviewer,
  getTicketWorkflowInfo,
  getTicketWorkflowAuditTrail,
  managerAttendMajor,
  managerSendToDirector,
  escalateAndUpdateTicketOnSlaBreach,
  updateReversedTicketDetails,
  findSupervisorForSection,
  getWorkflowTickets,
  getTicketClarifications
};
