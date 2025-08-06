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
const { Op } = require("sequelize");
const { sendQuickSms } = require("../../services/smsService");
const { sendEmail } = require("../../services/emailService");
const RequesterDetails = require("../../models/RequesterDetails");
const Employer = require("../../models/Employer");
const TicketAssignment = require("../../models/TicketAssignment");
const AssignedOfficer = require("../../models/AssignedOfficer");
const { calculateAssignmentsAging, getAgingStatus, formatAging } = require('../../utils/agingCalculator');
const Dependent = require("../../models/Dependent");

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

// SLA rules mapping
const SLA_RULES = {
  inquiry: 3, // days
  complaint_minor: 7, // total days for minor complaint (adjust as needed)
  complaint_major: 15 // total days for major complaint (adjust as needed)
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
    coordinator: 2,
    attendee: { minor: 3, major: 10 },
    'head-of-unit': 1,
    manager: 1,
    director: 1,
    'director-general': 1
  };
  function getSlaDaysForRole(role, complaintType) {
    if (role === 'attendee') {
      return SLA_ROLE_DAYS.attendee[complaintType] || 3;
    }
    return SLA_ROLE_DAYS[role] || 1;
  }

  // Get latest assignment for this ticket
  const lastAssignment = await TicketAssignment.findOne({
    where: { ticket_id: ticket.id },
    order: [['created_at', 'DESC']]
  });
  if (!lastAssignment) return false;
  const assignedAt = lastAssignment.created_at;
  const currentRole = (lastAssignment.assigned_to_role || '').toLowerCase();
  const complaintType = (ticket.complaint_type || '').toLowerCase();

  // Determine SLA days for this role
  let slaDays = 0;
  if (ticket.category === 'Inquiry') {
    slaDays = 3; // Inquiries: 3 days
  } else if (ticket.category === 'Complaint') {
    slaDays = getSlaDaysForRole(currentRole, complaintType);
  } else {
    return false; // Not applicable
  }

  // Calculate working days since assigned to this role
  const workingDays = getWorkingDays(assignedAt, new Date(), holidays);

  // Debug log for escalation decision
  console.log('Escalation debug:', {
    ticketId: ticket.id,
    category: ticket.category,
    complaint_type: ticket.complaint_type,
    currentRole,
    assignedAt,
    slaDays,
    workingDays,
    breached: workingDays > slaDays
  });

  // Check if breached
  const breached = workingDays > slaDays;
  if (!breached) return false;

  // Escalation path logic (per your SLA)
  const ESCALATION_PATH = {
    inquiry: [ 'attendee', 'focal-person', 'head-of-unit', 'manager', 'director'],
    complaint_minor: ['coordinator', 'head-of-unit', 'manager', 'director'],
    complaint_major: ['coordinator', 'head-of-unit', 'manager', 'director', 'director-general']
  };
  let path;
  if (ticket.category === 'Inquiry') path = ESCALATION_PATH.inquiry;
  else if (ticket.category === 'Complaint' && complaintType === 'major')
    path = ESCALATION_PATH.complaint_major;
  else if (ticket.category === 'Complaint')
    path = ESCALATION_PATH.complaint_minor;
  else return false;

  const idx = path.indexOf(currentRole);
  if (idx === -1 || idx === path.length - 1) return false; // Already at top
  const nextRole = path[idx + 1];

  // Find next user in same unit_section
  let sectionValue;
  if (ticket.section && ticket.section.toLowerCase() === 'unit') {
    sectionValue = ticket.sub_section;
  } else {
    sectionValue = ticket.unit_section;
  }
  const userWhere = { role: nextRole };
  if (sectionValue) userWhere.unit_section = sectionValue;
  let nextUser = await User.findOne({ where: userWhere });
  if (!nextUser) {
    // Fallback: find any user with the nextRole
    nextUser = await User.findOne({ where: { role: nextRole } });
    if (!nextUser) {
      console.warn(
        `Escalation failed: No user found for role '${nextRole}' (section: '${sectionValue}') or any section.`
      );
      return false;
    }
  }

  // Update ticket assignment
  await Ticket.update(
    {
      assigned_to_id: nextUser.id,
      assigned_to_role: nextRole,
      status: 'Assigned', // Set to 'Assigned' so new assignee sees it as new
      is_escalated: true
    },
    { where: { id: ticket.id } }
  );

  // Find system user for assigned_by_id
  const systemUser = await User.findOne({ where: { username: 'system' } });

  // Record escalation in assignment history
  await TicketAssignment.create({
    ticket_id: ticket.id,
    assigned_by_id: systemUser ? systemUser.id : ticket.assigned_to_id,
    assigned_to_id: nextUser.id,
    assigned_to_role: nextRole,
    action: 'Escalated',
    reason: `SLA breached for role '${currentRole}' after ${workingDays} working days (SLA: ${slaDays} days). Escalated automatically to ${nextRole}.`,
    created_at: new Date()
  });

  // Send email notifications to previous and new assignee
  const previousAssignee = await User.findOne({ where: { id: lastAssignment.assigned_to_id } });
  if (previousAssignee && previousAssignee.email) {
    setImmediate(() => {
      sendEmail({
        to: [previousAssignee.email, 'rehema.said3@ttcl.co.tz'],
        subject: `Ticket Escalated: ${ticket.ticket_id || ticket.id}`,
        htmlBody: `
          <p>Dear ${previousAssignee.name},</p>
          <p>The ticket <b>${ticket.ticket_id || ticket.id}</b> has been escalated from your queue to <b>${nextUser.name}</b> (${nextRole}) due to SLA breach.</p>
          <p><strong>Requester:</strong> ${getRequesterDisplayName(ticket)}</p>
          <p>Please log in to the system for more details.</p>
        `
      }).catch(e => console.error('Error sending escalation email:', e.message));
    });
  }
  if (nextUser && nextUser.email) {
    setImmediate(() => {
      sendEmail({
        to: [nextUser.email, 'rehema.said3@ttcl.co.tz'],
        subject: `New Escalated Ticket Assigned: ${ticket.ticket_id || ticket.id}`,
        htmlBody: `
          <p>Dear ${nextUser.name},</p>
          <p>A ticket <b>${ticket.ticket_id || ticket.id}</b> has been escalated to you for action. Please review and resolve as soon as possible.</p>
          <p>Details:<br>
          Subject: ${ticket.subject}<br>
          Category: ${ticket.category}<br>
          <strong>Requester:</strong> ${getRequesterDisplayName(ticket)}<br>
          </p>
          <p>Please log in to the system for more details.</p>
        `
      }).catch(e => console.error('Error sending escalation email:', e.message));
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
      attributes: ["id", "name", "role"]
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const isSuperAdmin = user.role === "super-admin";
    const whereUserCondition = isSuperAdmin ? {} : { created_by: id };

    // Count tickets by status
    const statuses = [
      "Open",
      "Assigned",
      "Closed",
      "Carried Forward",
      "In Progress"
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
        created_at: { [Op.lt]: tenDaysAgo }
      }
    });

    // New Tickets: Created today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const newTicketsCount = await Ticket.count({
      where: {
        ...whereUserCondition,
        created_at: { [Op.gte]: today }
      }
    });

    // In/Hour: Created in the last hour
    const lastHour = new Date(new Date().setHours(new Date().getHours() - 1));
    const inHourCount = await Ticket.count({
      where: {
        ...whereUserCondition,
        created_at: { [Op.gte]: lastHour }
      }
    });

    // Resolved/Hour: Closed in the last hour
    const resolvedHourCount = await Ticket.count({
      where: {
        ...whereUserCondition,
        status: "Closed",
        updated_at: { [Op.gte]: lastHour }
      }
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
          status: { [Op.in]: ["Assigned", "Open"] }
        }
      });
    } else {
      assignedCount = counts.assigned || 0;
    }


    const ticketStats= {
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
      slaBreaches: slaBreaches || 0
    };

    res.status(200).json({
      message: "Ticket counts fetched successfully",
      ticketStats
    });
  } catch (error) {
    console.error("Error fetching ticket counts:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const generateTicketId = () => {
  const random = Math.floor(100000 + Math.random() * 900000);
  return `WCF-CC-${random}`;
};

// Function to map function_data IDs to function IDs
const mapFunctionDataToFunctionId = (functionDataId) => {
  const mapping = {
    // Claims Administration Section function_data IDs
    "aa6e4251-5fa9-4c80-8cec-f9558bd5aa0a":
      "660e8400-e29b-41d4-a716-446655440001", // Pension Payment
    "c530d96c-f715-4ad8-9c9f-1265d7603570":
      "660e8400-e29b-41d4-a716-446655440001", // Compensation Payment
    "6016c1c0-7832-49ec-a129-4825df540606":
      "660e8400-e29b-41d4-a716-446655440001", // Approval of Medical Aid
    "f1599d1f-9515-4241-949d-44bcf69523c6":
      "660e8400-e29b-41d4-a716-446655440001", // Formal Hearing
    "9998439c-2dbc-4fd6-a032-07e06e7a8ce4":
      "660e8400-e29b-41d4-a716-446655440001", // HCP & HSP Matters

    // Compliance Section function_data IDs
    "f1599d1f-9515-4241-949d-44bcf69523ca":
      "660e8400-e29b-41d4-a716-446655440002", // Contribution
    "9998439c-2dbc-4fd6-a032-07e06e7a8ced":
      "660e8400-e29b-41d4-a716-446655440002", // Registration
    "9998439c-2dbc-4fd6-a032-07e06e7a8ce2":
      "660e8400-e29b-41d4-a716-446655440002", // Annual Return
    "9998439c-2dbc-4fd6-a032-07e06e7a8ce1":
      "660e8400-e29b-41d4-a716-446655440002", // Inspection
    "9998439c-2dbc-4fd6-a032-07e06e7a8cea":
      "660e8400-e29b-41d4-a716-446655440002", // Generation of Control Number
    "9998439c-2dbc-4fd6-a032-07e06e7a8cec":
      "660e8400-e29b-41d4-a716-446655440002", // Add/Remove Employee on Payroll

    // Records Section function_data IDs
    "8f9d02a4-b62a-4aeb-97cf-56a46e3b6603":
      "660e8400-e29b-41d4-a716-446655440003", // Correspondences

    // Claims Assessment Section function_data IDs
    "b5483c58-6915-49e3-92cc-d6a07bc9390f":
      "660e8400-e29b-41d4-a716-446655440004", // Medical Advice Panel (MAP)
    "bc43ec3f-d785-4a93-b7a1-70d80d44c89b":
      "660e8400-e29b-41d4-a716-446655440004", // Impairment Assessment
    "b0091d2a-3f79-4e79-8e5b-8fc301857e3b":
      "660e8400-e29b-41d4-a716-446655440004", // Assessment Matters
    "bc43ec3f-d785-4a93-b7a1-70d80d44c89a":
      "660e8400-e29b-41d4-a716-446655440004", // HCP & HSP Matters

    // Workplace Risk Assessment Section function_data IDs
    "7ef33e1f-9485-4d38-8d78-58d90e10df3f":
      "660e8400-e29b-41d4-a716-446655440005", // Workplace Risk Assessment Matters

    // Planning and Research function_data IDs
    "fb8c9f9a-17ec-4fd6-a214-b1f69183f937":
      "660e8400-e29b-41d4-a716-446655440006", // Planning and Research Matters

    // Finance Section function_data IDs
    "2650de56-7294-4483-85f2-c79f770b7cb5":
      "660e8400-e29b-41d4-a716-446655440007", // Payments

    // Investment function_data IDs
    "6f4f72df-0b0e-4ba2-b233-97c4b29dfbb3":
      "660e8400-e29b-41d4-a716-446655440008", // Investment Matters

    // Legal Unit function_data IDs
    "1af12ab6-14ee-4aa6-9b8b-0f8bb2ad60bc":
      "660e8400-e29b-41d4-a716-446655440009", // Legal Matters
    "e3cdb476-6459-4e8c-8eb0-ff1e364b37b0":
      "660e8400-e29b-41d4-a716-446655440009", // Review Decision

    // ICT Unit function_data IDs
    "1037d524-d7a3-4f15-b470-0380bb50f7c3":
      "660e8400-e29b-41d4-a716-446655440010", // ICT Technical Support

    // Actuarial Statistics and Risk Management function_data IDs
    "4d49728c-367c-4b12-9352-42d53d858f52":
      "660e8400-e29b-41d4-a716-446655440011", // Actuarial Services and Risk Management Matters
    "17226401-7543-49fd-949c-552f9c6d1866":
      "660e8400-e29b-41d4-a716-446655440011", // Statistics Matters

    // Public Relation Unit function_data IDs
    "d1a44228-05a2-4c4a-a8c6-3a0aa33a5ab4":
      "660e8400-e29b-41d4-a716-446655440012", // Awareness
    "e1cd3376-e5e4-40f2-9f6a-9db741245eb5":
      "660e8400-e29b-41d4-a716-446655440012", // Donation/ Sponsorship Matters
    "f065982f-fbab-4e7f-a0a0-d3b4e17907fd":
      "660e8400-e29b-41d4-a716-446655440012", // Exhibition Matters
    "f887ef83-52c4-49f6-b1a3-2743ae34f35b":
      "660e8400-e29b-41d4-a716-446655440012", // Advertisement Matters

    // Procurement Management Unit function_data IDs
    "c41e8752-07c1-4b3b-a58b-d0cbfe3f1cc0":
      "660e8400-e29b-41d4-a716-446655440013", // Procurement Matters

    // HR/Admin Unit function_data IDs
    "2858ff9b-0c44-4c8d-80df-0f40187e1309":
      "660e8400-e29b-41d4-a716-446655440014", // Recruitment Matters
    "56f92083-d168-4aa2-a4a9-3d58e59b55e2":
      "660e8400-e29b-41d4-a716-446655440014", // Human Resource Matters
    "d663c582-d7e7-4b80-b5df-64879fa08d62":
      "660e8400-e29b-41d4-a716-446655440014", // Leave Management & Intern Attachments
    "56f92083-d168-4aa2-a4a9-3d58e59b55e3":
      "660e8400-e29b-41d4-a716-446655440014", // DG's Office Matters

    // Internal Audit Unit function_data IDs
    "f0015b29-bab2-4b9b-9d10-380f88b6b03e":
      "660e8400-e29b-41d4-a716-446655440015" // Audit Matters
  };

  return mapping[functionDataId] || functionDataId; // Return original if not found in mapping
};

const createTicket = async (req, res) => {
  console.log("🎯 CREATE TICKET ENDPOINT CALLED!");
  console.log("Request body received:", req.body);
  
  try {
    console.log("Incoming ticket creation request body:", req.body);
    console.log("Subject field received:", req.body.subject);
    console.log("FunctionId field received:", req.body.functionId);
    console.log("Dependents field received:", req.body.dependents);
    
    const {
      firstName,
      middleName,
      lastName,
      phoneNumber,
      nidaNumber,
      requester,
      institution,
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
      // New fields for representative
      requesterName,
      requesterPhoneNumber,
      requesterEmail,
      requesterAddress,
      relationshipToEmployee,
      // New fields for employer (when requester is Employer)
      employerRegistrationNumber,
      employerName,
      employerTin,
      employerPhone,
      employerEmail,
      employerStatus,
      employerAllocatedStaffId,
      employerAllocatedStaffName,
      employerAllocatedStaffUsername,
      // New fields for representative
      representative_name,
      representative_phone,
      representative_email,
      representative_address,
      representative_relationship,
      // New fields for dependents
      dependents
    } = req.body;

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

    // Map function_data ID to function ID if needed
    const mappedResponsibleUnitId = mapFunctionDataToFunctionId(
      responsible_unit_id || functionId
    );

    // Get the function name to use as subject if subject is not provided
    let finalSubject = subject;
    console.log("Initial finalSubject:", finalSubject);
    
    if (!finalSubject && functionId) {
      console.log("Subject not provided, trying to get from functionId:", functionId);
      try {
        const functionData = await FunctionData.findOne({
          where: { id: functionId },
          include: [{ model: Function, as: "function" }]
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
    
    // Get allocated user from search response (not from institution details)
    let allocatedUserUsername = req.body.allocated_user_username; // This comes from search response

    if (category === "Inquiry") {
      // First try to assign by allocated username from search response if provided
      if (allocatedUserUsername) {
        assignedUser = await User.findOne({
          where: { username: allocatedUserUsername },
          attributes: ["id", "name", "email", "role", "unit_section"]
        });
        // If not found, create the user
        if (!assignedUser) {
          const nameParts = allocatedUserUsername
            .split(".")
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1));
          const newUser = await User.create({
            username: allocatedUserUsername,
            name: nameParts.join(" "),
            email: `${allocatedUserUsername}@ttcl.co.tz`,
            role: "attendee",
            unit_section: finalSection || responsible_unit_name,
            password: await bcrypt.hash("user12345", 10),
            status: "active"
          });
          assignedUser = newUser;
        }
      }
      
      // If no allocated user from search response, assign to focal-person with matching section
      if (!assignedUser) {
        // Get the section from ticket data - use inputSection instead of undefined sub_section
        const ticketSection = responsible_unit_name || finalSection || inputSection || section;
        
        console.log("TicketSection for focal-person assignment:", ticketSection);
        
        // Only query if ticketSection is defined and not empty
        if (ticketSection && ticketSection.trim() !== "") {
          assignedUser = await User.findOne({
            where: {
              role: "focal-person",
              unit_section: ticketSection
            },
            attributes: ["id", "name", "email", "role", "unit_section"]
          });
          console.log("Found focal-person with matching section:", assignedUser?.name);
        }
      }
      
      // Fallback to any focal-person if no matching section found
      if (!assignedUser) {
        assignedUser = await User.findOne({
          where: {
            role: "focal-person"
          },
          attributes: ["id", "name", "email", "role", "unit_section"]
        });
      }
    } else if (["Complaint", "Suggestion", "Compliment"].includes(category)) {
      // Assign to coordinator
      assignedUser = await User.findOne({
        where: { role: "coordinator" },
        attributes: ["id", "name", "email", "role", "unit_section"]
      });
    }
    if (!assignedUser) {
      return res
        .status(400)
        .json({
          message: `No appropriate user found to assign the ${category} ticket to.`
        });
    }

    // --- Ticket Data Preparation ---
    const ticketId = generateTicketId();
    const responsibleUnit = await Function.findOne({
      where: { id: mappedResponsibleUnitId },
      include: [{ model: Section, as: "section" }]
    });
    
    console.log("ResponsibleUnit found:", responsibleUnit);
    console.log("ResponsibleUnit section:", responsibleUnit?.section);
    console.log("Mapped responsible unit ID:", mappedResponsibleUnitId);
    
    const initialStatus = shouldClose ? "Closed" : status || "Open";
    let ticketEmployerId = null;
    let ticketPhoneNumber = phoneNumber;
    let ticketInstitution = institution;
    let requesterFullName = `${firstName} ${lastName || ""}`;
    // Handle Employer details and association
    if (requester === "Employer") {
      let employer = await Employer.findOne({
        where: { registration_number: employerRegistrationNumber }
      });
      if (!employer) {
        employer = await Employer.create({
          registration_number: employerRegistrationNumber,
          name: employerName,
          tin: employerTin,
          phone: employerPhone,
          email: employerEmail,
          employer_status: employerStatus,
          allocated_staff_id: employerAllocatedStaffId,
          allocated_staff_name: employerAllocatedStaffName,
          allocated_staff_username: employerAllocatedStaffUsername
        });
      }
      ticketEmployerId = employer.id;
      ticketPhoneNumber = employerPhone;
      ticketInstitution = employerName;
      requesterFullName = employerName;
    } else if (requester === "Representative") {
      ticketPhoneNumber = requesterPhoneNumber;
      requesterFullName = requesterName;
    }

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
      section: responsibleUnit?.section?.name || responsible_unit_name || "Unit",
      sub_section: responsibleUnit?.name || finalSection || "Unit",
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
      dependents: Array.isArray(dependents) ? dependents.join(', ') : dependents
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
    console.log("- Length:", ticketData.dependents ? ticketData.dependents.length : 0);
    console.log("=====================================");
    
    if (shouldClose) {
      ticketData.resolution_details =
        resolution_details || description || "Ticket resolved during creation";
      ticketData.date_of_resolution = new Date();
      ticketData.attended_by_id = userId;
    }
    // --- Ticket Creation ---
    const newTicket = await Ticket.create(ticketData);
    
    // Log what was actually saved to the database
    console.log("✅ TICKET CREATED SUCCESSFULLY:");
    console.log("=====================================");
    console.log("Ticket ID:", newTicket.id);
    console.log("Saved Dependents:", newTicket.dependents);
    console.log("Dependents Type:", typeof newTicket.dependents);
    console.log("Dependents Length:", newTicket.dependents ? newTicket.dependents.length : 0);
    console.log("=====================================");
    
    // Dependents are now stored as comma-separated string in the Tickets table
    // No need for separate Dependent records

    // --- Create AssignedOfficer record for initial assignment ---
    if (!shouldClose) {
      // await AssignedOfficer.create({
      //   ticket_id: newTicket.id,
      //   assigned_to_id: assignedUser.id,
      //   assigned_to_role: assignedUser.role,
      //   assigned_by_id: userId,
      //   status: 'Active',
      //   assigned_at: new Date(),
      //   notes: 'Initial assignment'
      // });
      // --- Create Notification for Assigned User ---
      await Notification.create({
        ticket_id: newTicket.id,
        sender_id: userId,
        recipient_id: assignedUser.id,
        message: `New ${category} ticket assigned to you: ${finalSubject}`,
        channel: channel,
        status: "unread",
        category: category
      });
      // --- Create Ticket Assignment Record ---
      await TicketAssignment.create({
        ticket_id: newTicket.id,
        assigned_by_id: userId,
        assigned_to_id: assignedUser.id,
        assigned_to_role: assignedUser.role,
        action: "Assigned",
        reason: description,
        created_at: new Date()
      });
    }

    // If ticket is closed at creation, record closure in assignment history
    if (shouldClose) {
      const closingUser = await User.findOne({ where: { id: userId } });
      await TicketAssignment.create({
        ticket_id: newTicket.id,
        assigned_by_id: userId,
        assigned_to_id: userId,
        assigned_to_role: closingUser.role,
        action: "Closed",
        reason: resolution_details || "Ticket closed by agent",
        created_at: new Date()
      });
    }

    // Format phone number for SMS: ensure it starts with +255 and is followed by 9 digits
    let smsRecipient = String(ticketPhoneNumber || "")
      .replace(/^\+/, "")
      .replace(/^0/, "255");
    const isValidTzPhone = (num) => /^255\d{9}$/.test(num);

    // Only send SMS if ticket is NOT closed at creation
    if (
      !shouldClose &&
      (requester === "Employee" || requester === "Representative") &&
      isValidTzPhone(smsRecipient)
    ) {
      const smsMessage = `Dear ${requesterFullName}, your ticket (ID: ${newTicket.ticket_id}) has been created.`;
      try {
        await sendQuickSms({ message: smsMessage, recipient: smsRecipient });
        console.log("SMS sent successfully to", smsRecipient);
      } catch (smsError) {
        console.error("Error sending SMS:", smsError.message);
      }
    } else if (!shouldClose) {
      console.log("Not sending SMS, invalid phone:", smsRecipient);
    }

    // --- Email Notification to Assignee ---
    let emailWarning = "";
    if (assignedUser.email && !shouldClose) {
      const emailSubject = `New ${category} Ticket Assigned: ${finalSubject} (ID: ${newTicket.ticket_id})`;
      const emailHtmlBody = `
        <p>Dear ${assignedUser.name},</p>
        <p>A new ${category} ticket has been assigned to you. Here are the details:</p>
        <ul>
          <li><strong>Ticket ID:</strong> ${newTicket.ticket_id}</li>
          <li><strong>Subject:</strong> ${newTicket.subject}</li>
          <li><strong>Category:</strong> ${newTicket.category}</li>
          <li><strong>Description:</strong> ${newTicket.description}</li>
          <li><strong>Requester:</strong> ${requesterFullName} (${ticketPhoneNumber})</li>
          <li><strong>Channel:</strong> ${newTicket.channel}</li>
        </ul>
        <p>Please log in to the system to review and handle this ticket.</p>
        <p>Thank you,</p>
        <p>WCF Customer Care System</p>
      `;
      try {
        // await sendEmail({ to: assignedUser.email, subject: emailSubject, htmlBody: emailHtmlBody });
        await sendEmail({
          to: "rehema.said3@ttcl.co.tz",
          subject: emailSubject,
          htmlBody: emailHtmlBody
        });
      } catch (emailError) {
        console.error("Error sending email:", emailError.message);
        // console.error("Error sending email:", 'rehema.said3@ttcl.co.tz');
        emailWarning += " (Warning: Failed to send email to assignee.)";
      }
    }
    // --- Notification for Assignee ---
    await Notification.create({
      ticket_id: newTicket.id,
      sender_id: userId,
      recipient_id: assignedUser.id,
      message: `New ${category} ticket ${shouldClose ? "(Closed)" : ""} assigned to you: ${finalSubject}`,
      channel: channel,
      status: "unread"
    });
    // --- Email to Head of Unit if Closed on Creation (background) ---
    if (shouldClose) {
      // Find head-of-unit for the ticket's section/unit
      let headOfUnit = await User.findOne({
        where: {
          role: "head-of-unit",
          unit_section: newTicket.section
        },
        attributes: ["id", "name", "email"]
      });
      
      // Get the agent's name who closed the ticket
      const closingAgent = await User.findOne({
        where: { id: userId },
        attributes: ["id", "name"]
      });
      
      if (headOfUnit && headOfUnit.email) {
        const emailSubject = `Ticket Closed: ${newTicket.subject} (ID: ${newTicket.ticket_id})`;
        const emailBody = `
          <p>Dear ${headOfUnit.name},</p>
          <p>The following ticket has been closed by agent <strong>${closingAgent ? closingAgent.name : 'Unknown Agent'}</strong>:</p>
          <ul>
            <li><strong>Ticket ID:</strong> ${newTicket.ticket_id}</li>
            <li><strong>Subject:</strong> ${newTicket.subject}</li>
            <li><strong>Category:</strong> ${newTicket.category}</li>
            <li><strong>Requester:</strong> ${requesterFullName}</li>
            <li><strong>Closed by:</strong> ${closingAgent ? closingAgent.name : 'Unknown Agent'}</li>
            <li><strong>Resolution:</strong> ${resolution_details || description || 'Ticket resolved during creation'}</li>
          </ul>
          <p>Please review the resolution details above.</p>
        `;
        sendEmail({
          to: [headOfUnit.email, "rehema.said3@ttcl.co.tz"],
          subject: emailSubject,
          htmlBody: emailBody
        }).catch(emailError => {
          console.error("Error sending email to head-of-unit:", emailError.message);
        });
      }
    }
    // --- Respond to client immediately ---
    res.status(201).json({
      message: `Ticket created successfully${shouldClose ? " and closed" : ""}${emailWarning}`,
      ticket: newTicket
    });
    // --- Send email to assignee in background ---
    if (assignedUser.email && !shouldClose) {
      const emailSubject = `New ${category} Ticket Assigned: ${finalSubject} (ID: ${newTicket.ticket_id})`;
      const emailHtmlBody = `
        <p>Dear ${assignedUser.name},</p>
        <p>A new ${category} ticket has been assigned to you. Here are the details:</p>
        <ul>
          <li><strong>Ticket ID:</strong> ${newTicket.ticket_id}</li>
          <li><strong>Subject:</strong> ${newTicket.subject}</li>
          <li><strong>Category:</strong> ${newTicket.category}</li>
          <li><strong>Description:</strong> ${newTicket.description}</li>
          <li><strong>Requester:</strong> ${requesterFullName} (${ticketPhoneNumber})</li>
          <li><strong>Channel:</strong> ${newTicket.channel}</li>
        </ul>
        <p>Please log in to the system to review and handle this ticket.</p>
        <p>Thank you,</p>
        <p>WCF Customer Care System</p>
      `;
      sendEmail({
        to: "rehema.said3@ttcl.co.tz",
        subject: emailSubject,
        htmlBody: emailHtmlBody
      }).catch(emailError => {
        console.error("Error sending email:", emailError.message);
      });
    }
    // --- Email to Supervisor if Closed on Creation (background) ---
    if (shouldClose) {
      // Find head-of-unit for the ticket's section/unit
      let headOfUnit = await User.findOne({
        where: {
          role: "head-of-unit",
          unit_section: newTicket.section
        },
        attributes: ["id", "name", "email"]
      });
      
      // Get the agent's name who closed the ticket
      const closingAgent = await User.findOne({
        where: { id: userId },
        attributes: ["id", "name"]
      });
      
      if (headOfUnit && headOfUnit.email) {
        const emailSubject = `Ticket Closed: ${newTicket.subject} (ID: ${newTicket.ticket_id})`;
        const emailBody = `
          <p>Dear ${closingAgent.name},</p>
          <p>You have closed the ticket. Here are the details:</p>
          <ul>
            <li><strong>Ticket ID:</strong> ${newTicket.ticket_id}</li>
            <li><strong>Subject:</strong> ${newTicket.subject}</li>
            <li><strong>Category:</strong> ${newTicket.category}</li>
            <li><strong>Description:</strong> ${newTicket.description}</li>
            <li><strong>Resolution:</strong> ${resolution_details || "Ticket closed by agent"}</li>
          </ul>
          <p>Thank you for using the WCF Customer Care System.</p>
        `;
        sendEmail({
          to: [closingAgent.email, 'rehema.said3@ttcl.co.tz'],
          subject: emailSubject,
          htmlBody: emailBody
        }).catch(emailError => {
          console.error("Error sending closure email to agent:", emailError.message);
        });
      }
    }
    return;
  } catch (error) {
    console.error("Ticket creation error:", error);
    return res.status(500).json({
      message: "Internal server error",
      error: error.message
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
      attributes: ["id", "name", "role"] // Fetch ID, Name & Role
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    let tickets;

    if (user.role === "super-admin") {
      // Fetch all tickets for super_admin
      tickets = await Ticket.findAll({
        attributes: { exclude: ["userId"] },
        order: [["created_at", "DESC"]]
      });
    } else if (user.role === "focal-person") {
      // Focal person: Fetch tickets for their section/unit
      tickets = await Ticket.findAll({
        where: {
          section: user.unit_section,
          status: { [Op.ne]: "Closed" }
        },
        attributes: { exclude: ["userId"] },
        order: [["created_at", "DESC"]]
      });
    } else {
      // Fetch only tickets created by this agent
      tickets = await Ticket.findAll({
        where: { userId },
        attributes: { exclude: ["userId"] },
        order: [["created_at", "DESC"]]
      });
    }

    if (tickets.length === 0) {
      return res.status(404).json({ message: "No tickets found." });
    }

    // Modify response to include `created_by` (user.name instead of userId)
    const response = tickets.map((ticket) => ({
      ...ticket.toJSON(),
      created_by: user.name // Replace userId with user name
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
      attributes: ["id", "name", "role"] // Fetch ID, Name & Role
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    let tickets;

    if (user.role === "super-admin") {
      // Super admin: Fetch all OPEN tickets
      tickets = await Ticket.findAll({
        where: { status: ["Open", "Assigned"] }, // Filter by status
        attributes: { exclude: ["userId"] },
        include: [
          {
            model: User,
            as: "assignee",
            attributes: ["id", "name", "email"]
          },
          {
            model: TicketAssignment,
            as: "assignments",
            include: [
              {
                model: User,
                as: "assignee",
                attributes: ["id", "name", "email"]
              }
            ]
          },
          {
            model: RequesterDetails,
            as: "RequesterDetail"
          }
        ],
        order: [["created_at", "DESC"]]
      });
    } else {
      // Agent: Fetch only OPEN tickets assigned to this agent
      tickets = await Ticket.findAll({
        where: {
          assigned_to_id: userId,
          status: { [Op.in]: ["Assigned", "Open", "Returned", "Forwarded"] }
        },
        include: [
          {
            model: User,
            as: "assignee",
            attributes: ["id", "name", "email"]
          },
          {
            model: TicketAssignment,
            as: "assignments",
            include: [
              {
                model: User,
                as: "assignee",
                attributes: ["id", "name", "email"]
              }
            ]
          },
          {
            model: RequesterDetails,
            as: "RequesterDetail"
          }
        ],
        order: [["created_at", "DESC"]]
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
          assigned_to_name: a.assignee?.name || null,
          assigned_to_role: a.assignee?.role || null,
          reason: a.reason,
          action: a.action,
          created_at: a.created_at
        }));
      // Debug: Log the RequesterDetail for each ticket
      console.log("OPEN DEBUG - Ticket ID:", t.id, "RequesterDetail:", t.RequesterDetail);
      return {
        ...t,
        created_by: user.name
      };
    });
    console.log("all ticketd open", response);
    res.status(200).json({
      message: "Open tickets fetched successfully",
      totalTickets: tickets.length,
      tickets: response
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
      attributes: ["id", "name", "role"]
    });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    let tickets;
    if (user.role === "super-admin" || user.role === "supervisor") {
      // Super admin: Fetch all tickets with status Assigned or Open
      tickets = await Ticket.findAll({
        where: { status: { [Op.in]: ["Assigned", "Open", "Forwarded", "Attended and Recommended"] } },
        include: [
          {
            model: User,
            as: "assignee",
            attributes: ["id", "name", "email"]
          },
          {
            model: TicketAssignment,
            as: "assignments",
            include: [
              {
                model: User,
                as: "assignee",
                attributes: ["id", "name", "email"]
              }
            ]
          },
          {
            model: RequesterDetails,
            as: "RequesterDetail"
          }
        ],
        order: [["created_at", "DESC"]]
      });
    } else {
      // Fetch tickets assigned to this user (attendee)
      tickets = await Ticket.findAll({
        where: {
          assigned_to_id: userId,
          status: { [Op.in]: ["Assigned", "Open", "Returned", "Forwarded","Escalated", 
            "In Progress", "Attended and Recommended"] }
        },
        include: [
          {
            model: User,
            as: "assignee",
            attributes: ["id", "name", "email"]
          },
          {
            model: TicketAssignment,
            as: "assignments",
            include: [
              {
                model: User,
                as: "assignee",
                attributes: ["id", "name", "email"]
              }
            ]
          },
          {
            model: RequesterDetails,
            as: "RequesterDetail"
          }
        ],
        order: [["created_at", "DESC"]]
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
          assigned_to_name: a.assignee?.name || null,
          assigned_to_role: a.assignee?.role || null,
          reason: a.reason,
          action: a.action,
          created_at: a.created_at
        }));
      // Debug: Log the RequesterDetail for each ticket
      console.log("ASSIGNED DEBUG - Ticket ID:", t.id, "RequesterDetail:", t.RequesterDetail);
      return {
        ...t,
        created_by: user.name
      };
    });

    res.status(200).json({
      message: "Assigned tickets fetched successfully",
      totalTickets: tickets.length,
      tickets: response
    });
  } catch (error) {
    console.error("Error fetching assigned tickets:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

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
      attributes: ["id", "name", "role"] // Fetch ID, Name & Role
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    let tickets;

    if (user.role === "super-admin" || user.role === "supervisor") {
      // Super admin: Fetch all OPEN tickets
      tickets = await Ticket.findAll({
        where: {
          assigned_to_id: userId,
          status: { [Op.in]: ["Assigned", "Open", "Returned", "Forwarded", "In Progress"] }
        },
        include: [
          {
            model: User,
            as: "assignee",
            attributes: ["id", "name", "email"]
          },
          {
            model: TicketAssignment,
            as: "assignments",
            include: [
              {
                model: User,
                as: "assignee",
                attributes: ["id", "name", "email"]
              }
            ]
          },
          {
            model: RequesterDetails,
            as: "RequesterDetail"
          }
        ],
        order: [["created_at", "DESC"]]
      });
    } else {
      // Agent: Fetch only OPEN tickets assigned to this agent
      tickets = await Ticket.findAll({
        where: {
          assigned_to_id: userId,
          status: { [Op.in]: ["Assigned", "Open", "Returned", "Forwarded", "In Progress"] }
        },
        include: [
          {
            model: User,
            as: "assignee",
            attributes: ["id", "name", "email"]
          },
          {
            model: TicketAssignment,
            as: "assignments",
            include: [
              {
                model: User,
                as: "assignee",
                attributes: ["id", "name", "email"]
              }
            ]
          },
          {
            model: RequesterDetails,
            as: "RequesterDetail"
          }
        ],
        order: [["created_at", "DESC"]]
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
          assigned_to_name: a.assignee?.name || null,
          assigned_to_role: a.assignee?.role || null,
          reason: a.reason,
          action: a.action,
          created_at: a.created_at
        }));
      // Debug: Log the RequesterDetail for each ticket
      console.log("INPROGRESS DEBUG - Ticket ID:", t.id, "RequesterDetail:", t.RequesterDetail);
      return {
        ...t,
        created_by: user.name
      };
    });

    res.status(200).json({
      message: "Open tickets fetched successfully",
      totalTickets: tickets.length,
      tickets: response
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
      attributes: ["id", "name", "role"] // Fetch ID, Name & Role
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    let tickets;

    if (user.role === "super-admin") {
      // Super admin: Fetch all OPEN tickets
      tickets = await Ticket.findAll({
        where: { status: "Carried Forward" }, // Filter by status
        attributes: { exclude: ["userId"] },
        include: [
          {
            model: User,
            as: "assignee",
            attributes: ["id", "name", "email"]
          },
          {
            model: TicketAssignment,
            as: "assignments",
            include: [
              {
                model: User,
                as: "assignee",
                attributes: ["id", "name", "email"]
              }
            ]
          },
          {
            model: RequesterDetails,
            as: "RequesterDetail"
          }
        ],
        order: [["created_at", "DESC"]]
      });
    } else {
      // Agent: Fetch only carried forward tickets created by this agent
      tickets = await Ticket.findAll({
        where: { userId, status: "Carried Forward" }, // Filter by userId and status
        include: [
          {
            model: User,
            as: "assignee",
            attributes: ["id", "name", "email"]
          },
          {
            model: TicketAssignment,
            as: "assignments",
            include: [
              {
                model: User,
                as: "assignee",
                attributes: ["id", "name", "email"]
              }
            ]
          },
          {
            model: RequesterDetails,
            as: "RequesterDetail"
          }
        ],
        order: [["created_at", "DESC"]]
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
          assigned_to_name: a.assignee?.name || null,
          assigned_to_role: a.assignee?.role || null,
          reason: a.reason,
          action: a.action,
          created_at: a.created_at
        }));
      // Debug: Log the RequesterDetail for each ticket
      console.log("CARRIED FORWARD DEBUG - Ticket ID:", t.id, "RequesterDetail:", t.RequesterDetail);
      return {
        ...t,
        created_by: user.name
      };
    });

    res.status(200).json({
      message: "Carried forward tickets fetched successfully",
      totalTickets: tickets.length,
      tickets: response
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
      attributes: ["id", "name", "role"] // Fetch ID, Name & Role
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    let tickets;

    if (user.role === "super-admin") {
      // Super admin: Fetch all Closed tickets
      tickets = await Ticket.findAll({
        where: { status: "Closed" }, // Filter by status
        attributes: { exclude: ["userId"] },
        include: [
          {
            model: User,
            as: "assignee",
            attributes: ["id", "name", "email"]
          },
          {
            model: TicketAssignment,
            as: "assignments",
            include: [
              {
                model: User,
                as: "assignee",
                attributes: ["id", "name", "email"]
              }
            ]
          },
          {
            model: RequesterDetails,
            as: "RequesterDetail"
          }
        ],
        order: [["created_at", "DESC"]]
      });
    } else {
      // Only tickets closed by this user
      tickets = await Ticket.findAll({
        where: {
          attended_by_id: userId,
          status: "Closed"
        },
        include: [
          {
            model: User,
            as: "assignee",
            attributes: ["id", "name", "email"]
          },
          {
            model: TicketAssignment,
            as: "assignments",
            include: [
              {
                model: User,
                as: "assignee",
                attributes: ["id", "name", "email"]
              }
            ]
          },
          {
            model: RequesterDetails,
            as: "RequesterDetail"
          }
        ],
        order: [["created_at", "DESC"]]
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
          assigned_to_name: a.assignee?.name || null,
          assigned_to_role: a.assignee?.role || null,
          reason: a.reason,
          action: a.action,
          created_at: a.created_at
        }));
      // Debug: Log the RequesterDetail for each ticket
      console.log("CLOSED DEBUG - Ticket ID:", t.id, "RequesterDetail:", t.RequesterDetail);
      return {
        ...t,
        created_by: user.name
      };
    });

    res.status(200).json({
      message: "Carried closed fetched successfully",
      totalTickets: tickets.length,
      tickets: response
    });
  } catch (error) {
    console.error("Error fetching closed tickets:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getOverdueTickets = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }
    // Find tickets where status is '' or 'Escalated' and the previous assignee was the user
    // 1. Find escalated assignments where the user was the previous assignee
    const escalatedAssignments = await TicketAssignment.findAll({
      where: {
        assigned_by_id: userId,
        action: 'Escalated'
      },
      attributes: ['ticket_id'],
      group: ['ticket_id']
    });
    const escalatedTicketIds = escalatedAssignments.map(a => a.ticket_id);
    // 2. Find tickets with status '' or 'Escalated' and in the escalatedTicketIds
    const overdueTickets = await Ticket.findAll({
      where: {
        id: { [Op.in]: escalatedTicketIds },
        [Op.or]: [
          { status: 'Escalated' },
          { status: '' }
        ]
      },
      include: [
        {
          model: TicketAssignment,
          as: "assignments",
          include: [
            {
              model: User,
              as: "assignee",
              attributes: ["id", "name", "role"]
            }
          ]
        },
        {
          model: User,
          as: "assignee",
          attributes: ["id", "name", "role"]
        }
      ],
      order: [["created_at", "DESC"]]
    });
    res.status(200).json({ tickets: overdueTickets });
  } catch (error) {
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
                  attributes: ["id", "name"]
                }
              ]
            }
          ]
        },
        {
          model: User,
          as: "creator",
          attributes: ["id", "name", "email"]
        },
        {
          model: User,
          as: "assignee",
          attributes: ["id", "name", "email"]
        },
        {
          model: User,
          as: "attendedBy",
          attributes: ["id", "name", "email"]
        },
        {
          model: User,
          as: "ratedBy",
          attributes: ["id", "name", "email"]
        }
        // Commented out for simplicity (can be re-added if needed)
        // {
        //   model: User,
        //   as: 'convertedBy',
        //   attributes: ['id', 'name', 'email']
        // },
        // {
        //   model: User,
        //   as: 'forwardedBy',
        //   attributes: ['id', 'name', 'email']
        // }
      ]
    });

    return res.status(200).json({
      message: "Tickets fetched successfully",
      totalTickets: tickets.length,
      tickets
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
      attributes: ["id", "name", "role"]
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    let tickets;

    if (user.role === "super-admin") {
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
                    attributes: ["id", "name"]
                  }
                ]
              }
            ]
          },
          {
            model: User,
            as: "creator",
            attributes: ["id", "name", "email"]
          },
          {
            model: User,
            as: "assignee",
            attributes: ["id", "name", "email"]
          },
          {
            model: TicketAssignment,
            as: "assignments",
            include: [
              {
                model: User,
                as: "assignee",
                attributes: ["id", "name", "email"]
              }
            ]
          },
          {
            model: RequesterDetails,
            as: "RequesterDetail"
          }
        ],
        order: [["created_at", "DESC"]]
      });
    } else {
      tickets = await Ticket.findAll({
        where: { userId },
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
                    attributes: ["id", "name"]
                  }
                ]
              }
            ]
          },
          {
            model: User,
            as: "creator",
            attributes: ["id", "name", "email"]
          },
          {
            model: User,
            as: "assignee",
            attributes: ["id", "name", "email"]
          },
          {
            model: TicketAssignment,
            as: "assignments",
            include: [
              {
                model: User,
                as: "assignee",
                attributes: ["id", "name", "email"]
              }
            ]
          },
          {
            model: RequesterDetails,
            as: "RequesterDetail"
          }
        ],
        order: [["created_at", "DESC"]]
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
          assigned_to_name: a.assignee?.name || "N/A",
          assigned_to_role: a.assignee?.role || "N/A",
          action: a.action,
          reason: a.reason || t.description,
          created_at: a.created_at
        }));
      return {
        ...t,
        created_by: user.name
      };
    });
    console.log("all ticket", response);
    res.status(200).json({
      message: "All tickets fetched successfully",
      totalTickets: tickets.length,
      tickets: response
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
      approval_notes: null
    };

    // Mock workflow actions
    switch (action) {
      case "rate":
        // Coordinator rates and assigns complaint
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
        // Coordinator converts to inquiry
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
      ticket: mockTicket
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
          { nida_number: phoneNumber }
        ]
      },
      order: [["created_at", "DESC"]],
      include: [
        {
          model: User,
          as: "creator",
          attributes: ["id", "name", "role"]
        }
      ]
    });
    if (tickets.length === 0) {
      return res.status(200).json({
        found: false,
        message: "No tickets found for this phone number"
      });
    }
    return res.status(200).json({
      found: true,
      message: "Tickets found successfully",
      tickets: tickets
    });
  } catch (error) {
    console.error("Error searching tickets by phone number:", error);
    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
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
          suggestion: "Please provide a valid ticket ID in the request parameters"
        }
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
                  attributes: ["id", "name"]
                }
              ]
            }
          ]
        },
        {
          model: User,
          as: "creator",
          attributes: ["id", "name", "username"]
        },
        {
          model: User,
          as: "assignee",
          attributes: ["id", "name", "role"]
        },
        {
          model: User,
          as: "attendedBy",
          attributes: ["id", "name", "email"]
        },
        {
          model: User,
          as: "ratedBy",
          attributes: ["id", "name", "email"]
        },
        {
          model: User,
          as: "convertedBy",
          attributes: ["id", "name", "email"]
        },
        {
          model: User,
          as: "forwardedBy",
          attributes: ["id", "name", "email"]
        },
        {
          model: TicketAssignment,
          as: "assignments",
          include: [
            {
              model: User,
              as: "assignee",
              attributes: ["id", "name", "role"]
            }
          ],
          order: [["created_at", "ASC"]]
        },
        {
          model: RequesterDetails,
          as: "RequesterDetail"
        }
      ]
    });

    if (!ticket) {
      return res.status(404).json({ 
        success: false,
        message: "Ticket not found",
        details: {
          ticket_id: ticketId,
          suggestion: "Please check the ticket ID and ensure the ticket exists in the system"
        }
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
  for (const user of users) {
    if (user.email) {
      setImmediate(() => {
        sendEmail({ to: [user.email, "rehema.said3@ttcl.co.tz"], subject, htmlBody })
          .catch(e => console.error("Error sending notifyUsersByRole email:", e.message));
      });
    }
    await Notification.create({
      ticket_id: ticketId,
      sender_id: senderId,
      recipient_id: user.id,
      message,
      status: "unread",
      channel: senderRole
    });
  }
}

const closeTicket = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { resolution_details, userId, resolution_type } = req.body;

    if (!ticketId) {
      return res.status(400).json({ message: "Ticket ID is required" });
    }

    const ticket = await Ticket.findOne({
      where: { id: ticketId },
      include: [
        {
          model: User,
          as: "creator",
          attributes: ["id", "name"]
        }
      ]
    });

    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    // Handle attachment if uploaded
    let attachmentPath = null;
    if (req.file) {
      attachmentPath = `ticket_attachments/${req.file.filename}`; // Save relative path
      console.log("Attachment uploaded:", attachmentPath);
    }

    // Update ticket status and add resolution details
    await ticket.update({
      status: "Closed",
      resolution_details: resolution_details || "Ticket closed by agent",
      resolution_type: resolution_type || "Resolved",
      attachment_path: attachmentPath, // Save attachment path to ticket
      date_of_resolution: new Date(),
      attended_by_id: userId
    });

    // Fetch attended_by user name and role
    let attended_by_name = null;
    let attended_by_role = null;
    if (userId) {
      const attendedByUser = await User.findOne({ where: { id: userId } });
      attended_by_name = attendedByUser ? attendedByUser.name : null;
      attended_by_role = attendedByUser ? attendedByUser.role : null;
    }

    // Notify all coordinators and supervisors
    const notifySubject = `Ticket Closed: ${ticket.subject}`;
    const notifyHtml = `
      <p><strong>Ticket Closed</strong></p>
      <p>The following ticket has been closed:</p>
      <ul>
        <li><strong>Ticket ID:</strong> ${ticket.ticket_id}</li>
        <li><strong>Subject:</strong> ${ticket.subject}</li>
        <li><strong>Category:</strong> ${ticket.category}</li>
        <li><strong>Requester:</strong> ${getRequesterDisplayName(ticket)}</li>
        <li><strong>Closed By:</strong> ${attended_by_name || 'Unknown'} (${attended_by_role || 'Unknown Role'})</li>
        <li><strong>Resolution Type:</strong> ${resolution_type || 'Resolved'}</li>
        <li><strong>Resolution Details:</strong> ${resolution_details || 'Ticket closed by agent'}</li>
        <li><strong>Closed Date:</strong> ${new Date().toLocaleString()}</li>
      </ul>
    `;
    const notifyMsg = `Ticket ${ticket.ticket_id} has been closed by ${attended_by_name || 'Unknown'} (${attended_by_role || 'Unknown Role'}).`;
    await notifyUsersByRole(
      ["coordinator", "supervisor"],
      notifySubject,
      notifyHtml,
      ticketId,
      userId,
      notifyMsg
    );

    // Notify the creator (agent) by email if available
    if (ticket.creator && ticket.creator.email) {
      const emailSubject = `Your Ticket Has Been Closed: ${ticket.subject} (ID: ${ticket.ticket_id})`;
      const emailBody = `
        <p>Dear ${ticket.creator.name},</p>
        <p>Your ticket has been closed. Here are the details:</p>
        <ul>
          <li><strong>Ticket ID:</strong> ${ticket.ticket_id}</li>
          <li><strong>Subject:</strong> ${ticket.subject}</li>
          <li><strong>Category:</strong> ${ticket.category}</li>
          <li><strong>Description:</strong> ${ticket.description}</li>
          <li><strong>Requester:</strong> ${getRequesterDisplayName(ticket)}</li>
          <li><strong>Resolution:</strong> ${resolution_details || "Ticket closed by agent"}</li>
        </ul>
        <p>Thank you for using the WCF Customer Care System.</p>
      `;
      sendEmail({
        // to: ticket.creator.email,
        to:'rehema.said3@ttcl.co.tz',
        subject: emailSubject,
        htmlBody: emailBody
      }).catch(emailError => {
        console.error("Error sending closure email to creator:", emailError.message);
      });
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
      created_at: new Date()
    });

    // Update AssignedOfficer status (with error handling)
    try {
      await AssignedOfficer.update(
        { status: "Completed", completed_at: new Date() },
        { where: { ticket_id: ticketId, status: "Active" } }
      );
    } catch (assignedOfficerError) {
      console.warn("Warning: Could not update AssignedOfficer status:", assignedOfficerError.message);
      // Continue with ticket closure even if AssignedOfficer update fails
    }

    res.status(200).json({
      success: true,
      message: `Ticket ${ticket.ticket_id} closed successfully by ${attended_by_name || 'Unknown'} (${attended_by_role || 'Unknown Role'})`,
      details: {
        ticket_id: ticket.ticket_id,
        subject: ticket.subject,
        category: ticket.category,
        resolution_type: resolution_type || 'Resolved',
        resolution_details: resolution_details || 'Ticket closed by agent',
        closed_by: attended_by_name || 'Unknown',
        closed_by_role: attended_by_role || 'Unknown Role',
        closed_date: new Date().toLocaleString(),
        attachment_path: attachmentPath
      },
      ticket: {
        ...ticket.toJSON(),
        attended_by_name,
        attachment_path: attachmentPath
      }
    });
    return;
  } catch (error) {
    console.error("Error closing ticket:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to close ticket",
      error: error.message,
      details: {
        error_type: error.name || 'Unknown Error',
        error_code: error.code || 'UNKNOWN',
        timestamp: new Date().toLocaleString(),
        suggestion: "Please check your input and try again. If the problem persists, contact support."
      }
    });
  }
};

const closeCoordinatorTicket = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const {
      resolution_details,
      userId,
      resolution_type // e.g., 'Resolved', 'Not Applicable', 'Duplicate'
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
            resolution_details: !resolution_details ? "Missing" : "Provided"
          },
          suggestion: "Please provide all required fields: ticketId, userId, and resolution_details"
        }
      });
    }

    // Find the ticket and include relevant associations
    const ticket = await Ticket.findOne({
      where: {
        id: ticketId,
        category: {
          [Op.in]: ["Complaint", "Suggestion", "Compliment"] // Allow all coordinator-managed categories
        }
      },
      include: [
        {
          model: User,
          as: "creator",
          attributes: ["id", "name"]
        },
        {
          model: User,
          as: "assignee",
          attributes: ["id", "name", "role"]
        }
      ]
    });

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: "Ticket not found or not a coordinator-managed ticket type",
        details: {
          ticket_id: ticketId,
          allowed_categories: ["Complaint", "Suggestion", "Compliment"],
          suggestion: "Please check the ticket ID and ensure it's a coordinator-managed ticket type"
        }
      });
    }

    // Check if the user is authorized (must be a coordinator)
    const coordinator = await User.findOne({
      where: {
        id: userId,
        role: "coordinator"
      }
    });

    if (!coordinator) {
      return res.status(403).json({
        success: false,
        message: "Only coordinators can close these types of tickets",
        details: {
          user_id: userId,
          required_role: "coordinator",
          suggestion: "Please ensure you have coordinator privileges to close this ticket"
        }
      });
    }

    // Update the ticket
    await ticket.update({
      status: "Closed",
      resolution_details,
      resolution_type: resolution_type || "Resolved",
      date_of_resolution: new Date(),
      attended_by_id: userId
    });

    // Notify the creator (agent) by email if available
    if (ticket.creator && ticket.creator.email) {
      const emailSubject = `Your Ticket Has Been Closed: ${ticket.subject} (ID: ${ticket.ticket_id})`;
      const emailBody = `
        <p>Dear ${ticket.creator.name},</p>
        <p>Your ticket has been closed by a coordinator. Here are the details:</p>
        <ul>
          <li><strong>Ticket ID:</strong> ${ticket.ticket_id}</li>
          <li><strong>Subject:</strong> ${ticket.subject}</li>
          <li><strong>Category:</strong> ${ticket.category}</li>
          <li><strong>Description:</strong> ${ticket.description}</li>
          <li><strong>Requester:</strong> ${getRequesterDisplayName(ticket)}</li>
          <li><strong>Resolution:</strong> ${resolution_details || "Ticket closed by coordinator"}</li>
        </ul>
        <p>Thank you for using the WCF Customer Care System.</p>
      `;
      sendEmail({
        to: [ticket.creator.email, 'rehema.said3@ttcl.co.tz'],
        subject: emailSubject,
        htmlBody: emailBody
      }).catch(emailError => {
        console.error("Error sending closure email to creator:", emailError.message);
      });
    }

    // Notify all coordinators and supervisors
    const notifySubject2 = `Ticket Closed: ${ticket.subject}`;
    const notifyHtml2 = `
      <p><strong>Ticket Closed by Coordinator</strong></p>
      <p>The following ticket has been closed:</p>
      <ul>
        <li><strong>Ticket ID:</strong> ${ticket.ticket_id}</li>
        <li><strong>Subject:</strong> ${ticket.subject}</li>
        <li><strong>Category:</strong> ${ticket.category}</li>
        <li><strong>Requester:</strong> ${getRequesterDisplayName(ticket)}</li>
        <li><strong>Closed By:</strong> ${coordinator.name} (Coordinator)</li>
        <li><strong>Resolution Type:</strong> ${resolution_type || 'Resolved'}</li>
        <li><strong>Resolution Details:</strong> ${resolution_details}</li>
        <li><strong>Closed Date:</strong> ${new Date().toLocaleString()}</li>
      </ul>
    `;
    const notifyMsg2 = `Ticket ${ticket.ticket_id} has been closed by ${coordinator.name} (Coordinator).`;
    await notifyUsersByRole(
      ["coordinator", "supervisor"],
      notifySubject2,
      notifyHtml2,
      ticketId,
      userId,
      notifyMsg2
    );

    // If there was a focal person or other assignee involved, notify them too
    if (ticket.assigned_to && ticket.assigned_to !== userId) {
      await Notification.create({
        ticket_id: ticketId,
        sender_id: userId,
        recipient_id: ticket.assigned_to,
        message: `${ticket.category} ticket ${ticket.ticket_id} has been resolved and closed by ${coordinator.name} (Coordinator)`,
        status: "unread"
      });
    }

    await AssignedOfficer.update(
      { status: "Completed", completed_at: new Date() },
      { where: { ticket_id: ticketId, status: "Active" } }
    );

    res.status(200).json({
      success: true,
      message: `${ticket.category} ticket ${ticket.ticket_id} closed successfully by ${coordinator.name} (Coordinator)`,
      details: {
        ticket_id: ticket.ticket_id,
        subject: ticket.subject,
        category: ticket.category,
        resolution_type: resolution_type || 'Resolved',
        resolution_details: resolution_details,
        closed_by: coordinator.name,
        closed_by_role: 'Coordinator',
        closed_date: new Date().toLocaleString()
      },
      ticket: {
        ...ticket.toJSON(),
        resolution_date: new Date(),
        resolved_by: coordinator.name
      }
    });
    return;
  } catch (error) {
    console.error("Error closing ticket:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to close ticket",
      error: error.message
    });
  }
};

// Assign ticket to attendee by username (for focal person)
const assignTicket = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { assignedToUsername, assignedById, reason } = req.body;
    if (!ticketId || !assignedToUsername || !assignedById) {
      return res.status(400).json({ message: "Missing required fields" });
    }
    const assignedTo = await User.findOne({
      where: { username: assignedToUsername }
    });
    if (!assignedTo) {
      return res.status(404).json({ message: "Attendee not found" });
    }
    // Update ticket assignment
    await Ticket.update(
      {
        assigned_to_id: assignedTo.id,
        assigned_to_role: assignedTo.role,
        status: "Assigned"
      },
      { where: { id: ticketId } }
    );
    // Track assignment
    await TicketAssignment.create({
      ticket_id: ticketId,
      assigned_by_id: assignedById,
      assigned_to_id: assignedTo.id,
      assigned_to_role: assignedTo.role,
      action: "Assigned",
      reason,
      created_at: new Date()
    });
    // Send email to assigned attendee (if email exists)
    if (assignedTo.email) {
      const ticket = await Ticket.findOne({ where: { id: ticketId } });
      const emailSubject = `Ticket Assigned: ${ticket.subject || ""} (ID: ${
        ticket.ticket_id || ticketId
      })`;
      const emailHtmlBody = `
        <p>Dear ${assignedTo.name || assignedTo.username},</p>
        <p>You have been assigned a ticket. Details:</p>
        <ul>
          <li><strong>Ticket ID:</strong> ${ticket.ticket_id || ticketId}</li>
          <li><strong>Subject:</strong> ${ticket.subject || ""}</li>
          <li><strong>Description:</strong> ${ticket.description || ""}</li>
          <li><strong>Requester:</strong> ${getRequesterDisplayName(ticket)}</li>
        </ul>
        <p>Please log in to the system to review and handle this ticket.</p>
        <p>Thank you,</p>
        <p>WCF Customer Care System</p>
      `;
      try {
        // await sendEmail({ to: assignedTo.email, subject: emailSubject, htmlBody: emailHtmlBody });
        await sendEmail({
          to: "rehema.said3@ttcl.co.tz",
          subject: emailSubject,
          htmlBody: emailHtmlBody
        });
      } catch (emailError) {
        console.error("Error sending assignment email:", emailError.message);
      }
      // Send assignment email in background
      setImmediate(() => {
        sendEmail({
          to: [assignedTo.email, 'rehema.said3@ttcl.co.tz'],
          subject: emailSubject,
          htmlBody: emailHtmlBody
        }).catch(emailError => {
          console.error("Error sending assignment email:", emailError.message);
        });
      });
    }
    res.json({ message: "Ticket assigned successfully" });
    return;
  } catch (error) {
    console.error("Error assigning ticket:", error);
    return res
      .status(500)
      .json({ message: "Internal server error", error: error.message });
  }
};

const getAllAttendee = async (req, res) => {
  try {
    const attendee = await User.findAll({
      where: { role: "attendee" }
    });
    res.status(200).json({ attendees: attendee });
  } catch (error) {
    res.status(500).json({ message: "server error", error: error.message });
  }
};

// Get all assignment/reassignment actions for a ticket
const getTicketAssignments = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { agingType = 'calendar' } = req.query; // Allow query param for aging type
    
    // Get the ticket to access category and complaint_type for SLA calculations
    const ticket = await Ticket.findByPk(ticketId, {
      attributes: ['id', 'category', 'complaint_type', 'status']
    });
    
    const assignments = await TicketAssignment.findAll({
      where: { ticket_id: ticketId },
      include: [
        {
          model: User,
          as: "assignee",
          attributes: ["id", "name", "role"]
        }
      ],
      order: [["created_at", "ASC"]]
    });
    
    let mappedAssignments = assignments.map((a) => ({
      assigned_to_id: a.assigned_to_id,
      assigned_to_name: a.assignee ? a.assignee.name : null,
      assigned_to_role: a.assignee ? a.assignee.role : null,
      reason: a.reason,
      action: a.action,
      created_at: a.created_at,
      attachment_path: a.attachment_path,
      evidence_url: a.evidence_url
    }));
    
    // Add creator_name to the first assignment if available
    if (assignments.length > 0) {
      const creatorUser = await User.findOne({
        where: { id: assignments[0].assigned_by_id }
      });
      if (creatorUser) {
        mappedAssignments[0].creator_name =
          creatorUser.name ||
          `${creatorUser.first_name || ""} ${
            creatorUser.last_name || ""
          }`.trim();
      }
    }
    
    // Calculate aging for each assignment
    const assignmentsWithAging = calculateAssignmentsAging(mappedAssignments, new Date(), agingType);
    
    // Add aging status and formatted aging for each assignment
    const finalAssignments = assignmentsWithAging.map(assignment => {
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
        aging_type: assignment.aging.type
      };
    });
    
    console.log("ticket assignment with aging", finalAssignments);
    res.json(finalAssignments);
  } catch (error) {
    console.error("Error in getTicketAssignments:", error);
    res
      .status(500)
      .json({
        message: "Failed to fetch ticket assignments",
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
      order: [["assigned_at", "ASC"]]
    });
    res.json(officers);
  } catch (error) {
    res
      .status(500)
      .json({
        message: "Failed to fetch assigned officers",
        error: error.message
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
              attributes: ["id", "name", "email"]
            }
          ]
        },
        {
          model: User,
          as: "sender",
          attributes: ["id", "name"]
        }
      ],
      order: [["created_at", "DESC"]]
    });

    res.status(200).json({
      message: "Assigned and notified tickets fetched successfully",
      notificationCount: notifications.length,
      notifications
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
      attributes: ["id", "name", "role"]
    });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    // ALL ROLES (except coordinator) LOGIC: use assigned_to_id for all counts
    if (user.role !== "coordinator") {
      const ticketWhere = { assigned_to_id: userId };
      const statuses = [
        "Open",
        "Assigned",
        "Closed",
        "Carried Forward",
        "In Progress"
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
          created_at: { [Op.lt]: tenDaysAgo }
        }
      });
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      // Tickets opened today by this agent (created by userId today)
      const openedTodayCount = await Ticket.count({
        where: {
          userId: userId,
          created_at: { [Op.gte]: today }
        }
      });
      // Total tickets created by this agent
      const totalCreatedByMe = await Ticket.count({
        where: { created_by: userId }
      });
      const newTicketsCount = await Ticket.count({
        where: {
          ...ticketWhere,
          created_at: { [Op.gte]: today }
        }
      });
      const lastHour = new Date(new Date().setHours(new Date().getHours() - 1));
      const inHourCount = await Ticket.count({
        where: {
          ...ticketWhere,
          created_at: { [Op.gte]: lastHour }
        }
      });
      const resolvedHourCount = await Ticket.count({
        where: {
          ...ticketWhere,
          status: "Closed",
          updated_at: { [Op.gte]: lastHour }
        }
      });
      const pendingCount = counts.open + counts.inprogress;
      // Assigned tickets: assigned_to_id = userId and status in ["Assigned", "Open"]
      // This includes escalated tickets since they have status 'Assigned'
      let assignedCount = await Ticket.count({
        where: {
          assigned_to_id: userId,
          status: { [Op.in]: ["Assigned", "Open"] }
        }
      });
      // Escalated tickets: tickets that were escalated FROM this user (not TO this user)
      // Find tickets where this user was the previous assignee before escalation
      const escalatedAssignments = await TicketAssignment.findAll({
        where: {
          assigned_to_id: userId,
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
      });
      const escalatedTicketIds = escalatedAssignments.map(a => a.ticket_id);
      const escalatedCount = escalatedTicketIds.length;
      // Use the higher count to ensure we don't miss any assigned tickets
      assignedCount = Math.max(assignedCount, escalatedCount);
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
      // In Progress: tickets ever assigned to this user or created by this user and not closed
      const assignedTicketAssignments = await TicketAssignment.findAll({
        where: { assigned_to_id: userId },
        attributes: ["ticket_id"],
        group: ["ticket_id"]
      });
      const assignedTicketIds = assignedTicketAssignments.map(a => a.ticket_id);
      // Find all ticket IDs created by this user
      const createdTickets = await Ticket.findAll({
        where: { userId },
        attributes: ["id"]
      });
      const createdTicketIds = createdTickets.map(t => t.id);
      // Combine IDs (remove duplicates)
      const allRelevantTicketIds = Array.from(new Set([...assignedTicketIds, ...createdTicketIds]));
      // Count tickets where id in allRelevantTicketIds and status != 'Closed'
      const inProgressCount = await Ticket.count({
        where: {
          id: { [Op.in]: allRelevantTicketIds },
          status: { [Op.ne]: "Closed" }
        }
      });
      // Add closedByAgent: tickets closed by this agent
      const closedByAgent = await Ticket.count({
        where: {
          attended_by_id: userId,
          status: "Closed"
        }
      });
      // Debug log
      console.log("inProgressCount (dashboard logic):", inProgressCount);
      return res.status(200).json({
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
          closedByAgent // <-- Added here
        }
      });
    }
    // FOCAL PERSON/MANAGEMENT LOGIC
    if (
      [
        "focal-person",
        "claim-focal-person",
        "compliance-focal-person",
        "head-of-unit",
        "manager",
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
          [Op.or]: [{ status: null }, { status: "Open" }]
        }
      });
      const escalatedInquiries = await Ticket.count({
        where: {
          id: {
            [Op.in]: (await TicketAssignment.findAll({
              where: {
                assigned_to_id: userId,
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
              
            ]
          }
        }
      });
      const openInquiries = await Ticket.count({
        where: {
          ...ticketWhere,
          status: "Open"
        }
      });
      const resolvedInquiries = await Ticket.count({
        where: {
          attended_by_id: userId,
          status: "Closed"
        }
      });

      // Count for assigned attendees (you may need to define what this means)
      // For now, let's say it's tickets assigned to someone by the focal person
      // that are not yet closed.
      const assignedToOthersByMe = await TicketAssignment.count({
        where: {
          assigned_by_id: userId
          // action: { [Op.in]: ["Assigned", "Reassigned"] }
        },
        include: [
          {
            model: Ticket,
            as: "ticket",
            where: {
              status: { [Op.ne]: "Closed" }
            }
          }
        ]
      });

      return res.status(200).json({
        success: true,
        ticketStats: {
          newTickets: {
            "New Tickets": newInquiries,
            "Escalated Tickets": escalatedInquiries,
            Total: newInquiries + escalatedInquiries
          },
          ticketStatus: {
            Open: openInquiries,
            Closed: resolvedInquiries,
            AssignedAttendees: assignedToOthersByMe
          },
          // also pass the flat data for the dashboard page
          newInquiries,
          escalatedInquiries,
          totalInquiries,
          resolvedInquiries,
          openInquiries,
          closedInquiries: resolvedInquiries,
          inProgressInquiries
        }
      });
    }
    // COORDINATOR LOGIC (add as needed)
    if (user.role === "coordinator") {
      // Return the full nested structure expected by the sidebar
      return res.status(200).json({
        success: true,
        message: "Dashboard counts for coordinator",
        ticketStats: {
          newTickets: {
            "New Tickets": 0,
            "Escalated Tickets": 0,
            Total: 0
          },
          convertedTickets: {
            Complaints: 0,
            Suggestions: 0,
            Compliments: 0
          },
          channeledTickets: {
            Directorate: 0,
            Units: 0
          },
          ticketStatus: {
            Closed: 0
            // "On Progress": 0 // add if needed
          }
        }
      });
    }
    return res
      .status(400)
      .json({
        success: false,
        message: "Role not supported for dashboard counts"
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

    // Mark previous assignment as 'Reassigned'
    await AssignedOfficer.update(
      {
        status: "Reassigned",
        completed_at: new Date(),
        reassignment_reason: reassignment_reason || null
      },
      { where: { ticket_id: ticketId, status: "Active" } }
    );

    // Insert new assignment row
    await AssignedOfficer.create({
      ticket_id: ticketId,
      assigned_to_id,
      assigned_to_role,
      assigned_by_id,
      status: "Active",
      assigned_at: new Date(),
      notes: notes || "Reassignment"
    });

    // Update the ticket's current assignee
    await Ticket.update(
      {
        assigned_to_id,
        assigned_to_role
      },
      { where: { id: ticketId } }
    );

    res.status(200).json({
      success: true,
      message: "Ticket reassigned successfully"
    });
  } catch (error) {
    console.error("Error in reassignTicket:", error);
    res.status(500).json({
      success: false,
      message: "Failed to reassign ticket",
      error: error.message
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
    // Get only the most recent assignment per ticket_id, including ticket details
    const assignments = await TicketAssignment.findAll({
      where: {
        assigned_by_id: userId,
        action: { [Op.in]: ["Assigned", "Reassigned", "Open", "Forwaeded"] }
      },
      order: [
        ["ticket_id", "ASC"],
        ["created_at", "DESC"]
      ],
      include: [
        {
          model: Ticket,
          as: "ticket",
          where: { status: { [Op.ne]: "Closed" } }
        }
      ]
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
    res.status(200).json({
      message: "In-progress assignments fetched successfully",
      count: filteredAssignments.length,
      assignments: filteredAssignments
    });
  } catch (error) {
    res
      .status(500)
      .json({
        message: "Failed to fetch in-progress assignments",
        error: error.message
      });
  }
};

const reverseTicket = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { userId, reason } = req.body;

    // Get assignment history, ordered by created_at DESC
    const assignments = await TicketAssignment.findAll({
      where: { ticket_id: ticketId },
      order: [["created_at", "DESC"]]
    });

    if (assignments.length < 2) {
      return res
        .status(400)
        .json({ message: "No previous user to reverse to." });
    }

    // The previous user is the second most recent assignment
    const prevAssignment = assignments[1];

    // Update the ticket to assign to the previous user
    await Ticket.update(
      {
        assigned_to_id: prevAssignment.assigned_to_id,
        assigned_to_role: prevAssignment.assigned_to_role,
        status: "Returned"
      },
      { where: { id: ticketId } }
    );

    // Add a new assignment record for the reversal
    await TicketAssignment.create({
      ticket_id: ticketId,
      assigned_by_id: userId,
      assigned_to_id: prevAssignment.assigned_to_id,
      assigned_to_role: prevAssignment.assigned_to_role,
      action: "Reversed",
      reason: reason || "Ticket reversed to previous user",
      created_at: new Date()
    });

    // Fetch ticket and previous user details for email
    const ticket = await Ticket.findByPk(ticketId);
    const prevUser = await User.findByPk(prevAssignment.assigned_to_id);
    if (prevUser && prevUser.email) {
      const subject = `Ticket Reversed: ${ticket.ticket_id || ticket.id}`;
      const htmlBody = `
        <p>Hello ${prevUser.name || ""},</p>
        <p>The following ticket has been <b>reversed</b> to you:</p>
        <ul>
          <li><b>Ticket ID:</b> ${ticket.ticket_id || ticket.id}</li>
          <li><b>Subject:</b> ${ticket.subject}</li>
          <li><b>Category:</b> ${ticket.category}</li>
          <li><b>Requester:</b> ${getRequesterDisplayName(ticket)}</li>
          <li><b>Status:</b> Returned</li>
          <li><b>Reversal Reason:</b> ${
            reason || "Ticket reversed to previous user"
          }</li>
        </ul>
        <p>Please log into the system to review and take action.</p>
        <p>Regards,<br/>WCF Support Desk</p>
      `;
      try {
        // await sendEmail({ to: prevUser.email, subject, htmlBody });
        await sendEmail({ to: 'rehema.said3@ttcl.co.tz', subject, htmlBody });
      } catch (emailErr) {
        console.error("Failed to send reversal email:", emailErr.message);
        // Do not fail the reversal if email fails
      }
    }

    res
      .status(200)
      .json({ message: "Ticket reversed to previous user successfully." });
  } catch (error) {
    console.error("Error reversing ticket:", error);
    res
      .status(500)
      .json({ message: "Failed to reverse ticket", error: error.message });
  }
};
// ... existing code ...

// --- Ticket Count Endpoints for Sidebar ---
const getOpenTicketsCount = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId)
      return res.status(400).json({ message: "User ID is required" });
    const user = await User.findOne({
      where: { id: userId },
      attributes: ["id", "role"]
    });
    if (!user) return res.status(404).json({ message: "User not found" });
    let count;
    if (user.role === "super-admin") {
      count = await Ticket.count({ where: { status: ["Open", "Assigned"] } });
    } else {
      count = await Ticket.count({
        where: { userId, status: ["Open", "Assigned"] }
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
      attributes: ["id", "role"]
    });
    if (!user) return res.status(404).json({ message: "User not found" });
    let count;
    if (user.role === "super-admin" || user.role === "supervisor") {
      count = await Ticket.count({ where: { status: ["Assigned", "Open"] } });
    } else {
      count = await Ticket.count({
        where: {
          assigned_to_id: userId,
          status: ["Assigned", "Open", "Returned", "Forwarded"]
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
      attributes: ["id", "role"]
    });
    if (!user) return res.status(404).json({ message: "User not found" });
    let count;
    if (user.role === "super-admin" || user.role === "supervisor") {
      count = await Ticket.count({
        status: { [Op.in]: ["Assigned", "Open", "Returned", "Forwarded"] }
      });
    } else {
      // Find all ticket IDs ever assigned to this user
      const assignedTicketAssignments = await TicketAssignment.findAll({
        where: { assigned_to_id: userId },
        attributes: ["ticket_id"],
        group: ["ticket_id"]
      });
      const assignedTicketIds = assignedTicketAssignments.map(
        (a) => a.ticket_id
      );
      // Find all ticket IDs created by this user
      const createdTickets = await Ticket.findAll({
        where: { userId },
        attributes: ["id"]
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
          status: { [Op.ne]: "Closed" }
        }
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
      attributes: ["id", "role"]
    });
    if (!user) return res.status(404).json({ message: "User not found" });
    let count;
    if (user.role === "super-admin") {
      count = await Ticket.count({ where: { status: "Carried Forward" } });
    } else {
      count = await Ticket.count({
        where: { userId, status: "Carried Forward" }
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
      attributes: ["id", "role"]
    });
    if (!user) return res.status(404).json({ message: "User not found" });
    let count;
    if (user.role === "super-admin") {
      count = await Ticket.count({ where: { status: "Closed" } });
    } else {
      // Find all ticket IDs ever assigned to this user
      const assignedTicketAssignments = await TicketAssignment.findAll({
        where: { assigned_to_id: userId },
        attributes: ["ticket_id"],
        group: ["ticket_id"]
      });
      const assignedTicketIds = assignedTicketAssignments.map(
        (a) => a.ticket_id
      );
      // Find all ticket IDs created by this user
      const createdTickets = await Ticket.findAll({
        where: { userId },
        attributes: ["id"]
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
          status: "Closed"
        }
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
      attributes: ["id", "role"]
    });
    if (!user) return res.status(404).json({ message: "User not found" });
    let count;
    if (user.role === "super-admin") {
      // Keep current logic for super-admin
      const tenDaysAgo = new Date();
      tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
      count = await Ticket.count({
        where: {
          status: "Open",
          created_at: { [Op.lt]: tenDaysAgo }
        }
      });
    } else {
      // Use SLA logic for overdue
      const assignedTickets = await Ticket.findAll({
        where: {
          assigned_to_id: userId,
          status: { [Op.ne]: "Closed" }
        }
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
      attributes: ["id", "role"]
    });
    if (!user) return res.status(404).json({ message: "User not found" });
    let tickets = [];
    if (user.role === "super-admin") {
      const tenDaysAgo = new Date();
      tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
      tickets = await Ticket.findAll({
        where: {
          status: "Open",
          created_at: { [Op.lt]: tenDaysAgo }
        }
      });
    } else {
      const assignedTickets = await Ticket.findAll({
        where: {
          assigned_to_id: userId,
          status: { [Op.ne]: "Closed" }
        }
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
    });
    const escalatedTicketIds = escalatedAssignments.map(a => a.ticket_id);

    // Get the escalated tickets
    const tickets = await Ticket.findAll({
      where: {
        id: { [Op.in]: escalatedTicketIds },
        is_escalated: true
      },
      include: [
        {
          model: User,
          as: "assignee",
          attributes: ["id", "name", "email"]
        },
        {
          model: TicketAssignment,
          as: "assignments",
          include: [
            {
              model: User,
              as: "assignee",
              attributes: ["id", "name", "email"]
            }
          ]
        },
        {
          model: RequesterDetails,
          as: "RequesterDetail"
        }
      ],
      order: [["created_at", "DESC"]]
    });

    res.status(200).json({
      message: "Escalated tickets fetched successfully",
      totalTickets: tickets.length,
      tickets
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
      group: ["ticket_id"]
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
          attributes: ["id", "name", "email"]
        },
        {
          model: TicketAssignment,
          as: "assignments",
          include: [
            {
              model: User,
              as: "assignee",
              attributes: ["id", "name", "email"]
            }
          ]
        },
        {
          model: RequesterDetails,
          as: "RequesterDetail"
        }
      ],
      order: [["created_at", "DESC"]]
    });
    res.status(200).json({
      message: "Ever assigned tickets fetched successfully",
      totalTickets: tickets.length,
      tickets
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
      group: ["ticket_id"]
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
      attributes: ["id", "role"]
    });
    if (!user) return res.status(404).json({ message: "User not found" });
    let count;
    if (user.role === "super-admin") {
      count = await Ticket.count();
    } else {
      count = await Ticket.count({ where: { userId } });
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
        action: 'Escalated'
      },
      include: [
        {
          model: Ticket,
          as: 'ticket',
          where: { 
            is_escalated: true,
            status: { [Op.ne]: 'Closed' }
          },
          include: [
            {
              model: User,
              as: 'assignee',
              attributes: ['id', 'name', 'role']
            }
          ]
        },
        {
          model: User,
          as: 'assignee',
          attributes: ['id', 'name', 'role']
        }
      ],
      order: [['created_at', 'DESC']]
    });
    res.status(200).json({ escalatedFrom: escalatedAssignments });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Helper to get requester display name
function getRequesterDisplayName(ticket) {
  if (ticket.requester === 'Representative' && ticket.representative_name) {
    return ticket.representative_name;
  }
  const name = [ticket.first_name, ticket.last_name, ticket.middle_name].filter(Boolean).join(' ').trim();
  if (name) return name;
  if (ticket.institution) return ticket.institution;
  return '-';
}

// Coordinator forwards major complaint to Director General
const forwardToDirectorGeneral = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { userId, coordinator_notes, resolution_details } = req.body;

    if (!ticketId || !userId) {
      return res.status(400).json({ message: "Ticket ID and user ID are required" });
    }

    const ticket = await Ticket.findOne({
      where: { id: ticketId },
      include: [
        {
          model: User,
          as: "creator",
          attributes: ["id", "name"]
        },
        {
          model: User,
          as: "ratedBy",
          attributes: ["id", "name", "email"]
        }
      ]
    });

    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    // Check if this is a major complaint assigned to coordinator
    if (ticket.category !== "Complaint" || 
        ticket.complaint_type !== "Major" || 
        ticket.assigned_to_id !== userId) {
      return res.status(400).json({ 
        message: "This ticket is not a major complaint assigned to you" 
      });
    }

    // Find Director General
    const directorGeneral = await User.findOne({
      where: { role: "director-general" }
    });

    if (!directorGeneral) {
      return res.status(404).json({ 
        message: "Director General not found" 
      });
    }

    // Update resolution details if coordinator edited them
    if (resolution_details) {
      await ticket.update({
        resolution_details: resolution_details,
        coordinator_notes: coordinator_notes || "Coordinator reviewed and approved resolution"
      });
    } else {
      // If no edits, just add coordinator notes
      await ticket.update({
        coordinator_notes: coordinator_notes || "Coordinator reviewed and approved resolution"
      });
    }

    // Assign to Director General
    await ticket.update({
      assigned_to_id: directorGeneral.id,
      assigned_to_role: "director-general",
      status: "Assigned"
    });

    // Record the assignment to Director General
    await TicketAssignment.create({
      ticket_id: ticketId,
      assigned_by_id: userId,
      assigned_to_id: directorGeneral.id,
      assigned_to_role: "director-general",
      action: "Forwarded to Director General",
      reason: coordinator_notes || "Coordinator reviewed and forwarded to DG for approval",
      coordinator_notes: coordinator_notes,
      workflow_step: "Forwarded to DG",
      created_at: new Date()
    });

    // Notify Director General by email
    if (directorGeneral.email) {
      const emailSubject = `Major Complaint for Approval: ${ticket.subject} (ID: ${ticket.ticket_id})`;
      const emailBody = `
        <p>Dear ${directorGeneral.name},</p>
        <p>A major complaint has been forwarded to you for approval:</p>
        <ul>
          <li><strong>Ticket ID:</strong> ${ticket.ticket_id}</li>
          <li><strong>Subject:</strong> ${ticket.subject}</li>
          <li><strong>Category:</strong> ${ticket.category}</li>
          <li><strong>Resolution:</strong> ${ticket.resolution_details}</li>
          <li><strong>Coordinator Notes:</strong> ${coordinator_notes || "No additional notes"}</li>
        </ul>
        <p>Please review and approve or reverse to coordinator.</p>
        <p>Thank you,</p>
        <p>WCF Customer Care System</p>
      `;
      
      sendEmail({
        to: [directorGeneral.email, 'rehema.said3@ttcl.co.tz'],
        subject: emailSubject,
        htmlBody: emailBody
      }).catch(emailError => {
        console.error("Error sending email to DG:", emailError.message);
      });
    }

    res.status(200).json({
      message: "Major complaint forwarded to Director General for approval",
      ticket: {
        ...ticket.toJSON(),
        assigned_to_name: directorGeneral.name
      }
    });
  } catch (error) {
    console.error("Error forwarding to Director General:", error);
    return res.status(500).json({
      message: "Failed to forward to Director General",
      error: error.message
    });
  }
};

// Get aging statistics for a specific user
const getUserAgingStats = async (req, res) => {
  try {
    const { userId } = req.params;
    const { period = '30' } = req.query; // Default to 30 days
    
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
          [Op.between]: [startDate, endDate]
        }
      },
      include: [
        {
          model: Ticket,
          as: 'ticket',
          attributes: ['id', 'category', 'complaint_type', 'status']
        }
      ],
      order: [['created_at', 'DESC']]
    });

    // Calculate aging for each assignment
    const assignmentsWithAging = calculateAssignmentsAging(assignments, endDate, 'calendar');
    
    // Group by aging status
    const stats = {
      total: assignmentsWithAging.length,
      onTime: 0,
      warning: 0,
      overdue: 0,
      critical: 0,
      averageDays: 0,
      totalDays: 0
    };

    assignmentsWithAging.forEach(assignment => {
      const status = getAgingStatus(
        assignment.aging.days,
        assignment.ticket?.category,
        assignment.ticket?.complaint_type
      );
      
      stats.totalDays += assignment.aging.days;
      
      switch (status) {
        case 'On Time':
          stats.onTime++;
          break;
        case 'Warning':
          stats.warning++;
          break;
        case 'Overdue':
          stats.overdue++;
          break;
        case 'Critical':
          stats.critical++;
          break;
      }
    });

    // Calculate averages
    if (stats.total > 0) {
      stats.averageDays = Math.round((stats.totalDays / stats.total) * 100) / 100;
    }

    // Calculate percentages
    stats.onTimePercent = stats.total > 0 ? Math.round((stats.onTime / stats.total) * 100) : 0;
    stats.warningPercent = stats.total > 0 ? Math.round((stats.warning / stats.total) * 100) : 0;
    stats.overduePercent = stats.total > 0 ? Math.round((stats.overdue / stats.total) * 100) : 0;
    stats.criticalPercent = stats.total > 0 ? Math.round((stats.critical / stats.total) * 100) : 0;

    // Get recent assignments with aging details
    const recentAssignments = assignmentsWithAging.slice(0, 10).map(assignment => ({
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
      )
    }));

    res.json({
      message: "User aging statistics fetched successfully",
      period: `${period} days`,
      stats,
      recentAssignments
    });

  } catch (error) {
    console.error("Error in getUserAgingStats:", error);
    res.status(500).json({
      message: "Failed to fetch user aging statistics",
      error: error.message
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
        error: "MISSING_TICKET_ID"
      });
    }

    // Find ticket with minimal data for external systems
    const ticket = await Ticket.findOne({
      where: { id: ticketId },
      attributes: [
        'id',
        'ticket_id',
        'status',
        'category',
        'complaint_type',
        'subject',
        'created_at',
        'updated_at',
        'phone_number',
        'region',
        'responsible_unit_name'
      ],
      include: [
        {
          model: User,
          as: "assignee",
          attributes: ["id", "name", "role"]
        },
        {
          model: TicketAssignment,
          as: "assignments",
          attributes: ['id', 'created_at', 'status'],
          include: [
            {
              model: User,
              as: "assignee",
              attributes: ["id", "name", "role"]
            }
          ],
          order: [["created_at", "DESC"]],
          limit: 1
        }
      ]
    });

    if (!ticket) {
      return res.status(404).json({ 
        success: false,
        message: "Ticket not found",
        error: "TICKET_NOT_FOUND",
        ticket_id: ticketId
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
        ticket_id: ticket.ticket_id,
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
        current_assignee: ticket.assignee ? {
          id: ticket.assignee.id,
          name: ticket.assignee.name,
          role: ticket.assignee.role
        } : null,
        last_assignment: ticket.assignments && ticket.assignments.length > 0 ? {
          assigned_at: ticket.assignments[0].created_at,
          assigned_to: ticket.assignments[0].assignee ? {
            id: ticket.assignments[0].assignee.id,
            name: ticket.assignments[0].assignee.name,
            role: ticket.assignments[0].assignee.role
          } : null
        } : null
      },
      timestamp: new Date().toISOString()
    };

    return res.status(200).json(response);

  } catch (error) {
    console.error("Error in getTicketStatusExternal:", error);
    return res.status(500).json({ 
      success: false,
      message: "Internal server error",
      error: "INTERNAL_ERROR"
    });
  }
};

module.exports = {
  checkTicketSlaBreach,
  escalateAndUpdateTicketOnSlaBreach,
  createTicket,
  getTickets,
  getTicketCounts,
  getOpenTickets,
  getAssignedTickets,
  getInprogressTickets,
  getCarriedForwardTickets,
  getClosedTickets,
  getOverdueTickets,
  getAllTickets,
  getAllCustomersTickets,
  mockComplaintWorkflow,
  searchByPhoneNumber,
  getTicketById,
  closeTicket,
  closeCoordinatorTicket,
  assignTicket,
  getAllAttendee,
  getTicketAssignments,
  getAssignedOfficers,
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
  forwardToDirectorGeneral,
  getUserAgingStats,
  getTicketStatusExternal
};
