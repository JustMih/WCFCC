const Ticket = require('../../models/Ticket');
const User = require('../../models/User');
const FunctionData = require('../../models/FunctionData');
const Function = require('../../models/Function');
const Section = require('../../models/Section');
const Notification = require('../../models/Notification');
const AgentLoginLog = require("../../models/agent_activity_logs");
const ChatMassage = require("../../models/chart_message")
const bcrypt = require("bcryptjs");
const { validationResult } = require("express-validator");
const { Op } = require("sequelize");
const { sendQuickSms } = require("../../services/smsService");
const { sendEmail } = require('../../services/emailService');
const RequesterDetails = require("../../models/RequesterDetails");
const Employer = require("../../models/Employer");
const TicketAssignment = require("../../models/TicketAssignment");
const AssignedOfficer = require("../../models/AssignedOfficer");

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
  const holidaySet = new Set((holidays || []).map(h => new Date(h).toDateString()));
  while (current <= end) {
    const day = current.getDay();
    const isWeekend = (day === 0 || day === 6);
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
  if (!ticket || !ticket.created_at) return { workingDays: 0, slaDays: 0, breached: false };

  // Determine SLA days
  let slaDays = 0;
  if (ticket.category === "Inquiry") {
    slaDays = SLA_RULES.inquiry;
  } else if (ticket.category === "Complaint") {
    const type = ticket.complaint_type === "major" ? "complaint_major" : "complaint_minor";
    slaDays = SLA_RULES[type];
  }

  // Calculate working days since created_at
  const workingDays = getWorkingDays(ticket.created_at, new Date(), holidays);

  // Check if breached
  const breached = workingDays > slaDays;

  return { workingDays, slaDays, breached };
}

/**
 * Escalate and update ticket if SLA is breached.
 * @param {Object} ticket - The ticket object (must have id, category, complaint_type, created_at, assigned_to_id, assigned_to_role, unit_section)
 * @param {string[]} holidays - Array of holiday dates in 'YYYY-MM-DD' format (optional)
 * @returns {Promise<boolean>} true if escalated, false otherwise
 */
async function escalateAndUpdateTicketOnSlaBreach(ticket, holidays = []) {
  const { breached, workingDays, slaDays } = checkTicketSlaBreach(ticket, holidays);
  if (!breached) return false;

  // Define escalation path
  const ESCALATION_PATH = {
    inquiry: ["focal-person", "attendee"],
    complaint_minor: ["attendee", "head-of-unit", "manager", "director"],
    complaint_major: ["attendee", "head-of-unit", "manager", "director", "director-general"]
  };
  let path;
  if (ticket.category === "Inquiry") path = ESCALATION_PATH.inquiry;
  else if (ticket.category === "Complaint" && ticket.complaint_type === "major") path = ESCALATION_PATH.complaint_major;
  else if (ticket.category === "Complaint") path = ESCALATION_PATH.complaint_minor;
  else return false;

  const currentRole = (ticket.assigned_to_role || '').toLowerCase();
  const idx = path.indexOf(currentRole);
  if (idx === -1 || idx === path.length - 1) return false; // Already at top
  const nextRole = path[idx + 1];
  const section = ticket.unit_section;

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
      console.warn(`Escalation failed: No user found for role '${nextRole}' (section: '${sectionValue}') or any section.`);
      return false;
    }
  }

  // Update ticket assignment
  await Ticket.update(
    { assigned_to_id: nextUser.id, assigned_to_role: nextRole, status: 'Escalated' },
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
    action: "Escalated",
    reason: `SLA breached after ${workingDays} working days (SLA: ${slaDays} days). Escalated automatically to ${nextRole}.`,
    created_at: new Date()
  });

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
      attributes: ["id", "name", "role"],
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const isSuperAdmin = user.role === "super-admin";
    const whereUserCondition = isSuperAdmin ? {} : { created_by: id };

    // Count tickets by status
    const statuses = ["Open", "Assigned", "Closed", "Carried Forward", "In Progress"];
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
        status: "Open",
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
        const avgWaitMinutes = waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length;
        longestWait = `${Math.floor(maxWaitMinutes / 60)}:${String(maxWaitMinutes % 60).padStart(2, "0")}`;
        avgWait = `${Math.floor(avgWaitMinutes / 60)}:${String(Math.round(avgWaitMinutes % 60)).padStart(2, "0")}`;
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

const generateTicketId = () => {
  const random = Math.floor(100000 + Math.random() * 900000);
  return `WCF-CC-${random}`;
};

// Function to map function_data IDs to function IDs
const mapFunctionDataToFunctionId = (functionDataId) => {
  const mapping = {
    // Claims Administration Section function_data IDs
    'aa6e4251-5fa9-4c80-8cec-f9558bd5aa0a': '660e8400-e29b-41d4-a716-446655440001', // Pension Payment
    'c530d96c-f715-4ad8-9c9f-1265d7603570': '660e8400-e29b-41d4-a716-446655440001', // Compensation Payment
    '6016c1c0-7832-49ec-a129-4825df540606': '660e8400-e29b-41d4-a716-446655440001', // Approval of Medical Aid
    'f1599d1f-9515-4241-949d-44bcf69523c6': '660e8400-e29b-41d4-a716-446655440001', // Formal Hearing
    '9998439c-2dbc-4fd6-a032-07e06e7a8ce4': '660e8400-e29b-41d4-a716-446655440001', // HCP & HSP Matters
    
    // Compliance Section function_data IDs
    'f1599d1f-9515-4241-949d-44bcf69523ca': '660e8400-e29b-41d4-a716-446655440002', // Contribution
    '9998439c-2dbc-4fd6-a032-07e06e7a8ced': '660e8400-e29b-41d4-a716-446655440002', // Registration
    '9998439c-2dbc-4fd6-a032-07e06e7a8ce2': '660e8400-e29b-41d4-a716-446655440002', // Annual Return
    '9998439c-2dbc-4fd6-a032-07e06e7a8ce1': '660e8400-e29b-41d4-a716-446655440002', // Inspection
    '9998439c-2dbc-4fd6-a032-07e06e7a8cea': '660e8400-e29b-41d4-a716-446655440002', // Generation of Control Number
    '9998439c-2dbc-4fd6-a032-07e06e7a8cec': '660e8400-e29b-41d4-a716-446655440002', // Add/Remove Employee on Payroll
    
    // Records Section function_data IDs
    '8f9d02a4-b62a-4aeb-97cf-56a46e3b6603': '660e8400-e29b-41d4-a716-446655440003', // Correspondences
    
    // Claims Assessment Section function_data IDs
    'b5483c58-6915-49e3-92cc-d6a07bc9390f': '660e8400-e29b-41d4-a716-446655440004', // Medical Advice Panel (MAP)
    'bc43ec3f-d785-4a93-b7a1-70d80d44c89b': '660e8400-e29b-41d4-a716-446655440004', // Impairment Assessment
    'b0091d2a-3f79-4e79-8e5b-8fc301857e3b': '660e8400-e29b-41d4-a716-446655440004', // Assessment Matters
    'bc43ec3f-d785-4a93-b7a1-70d80d44c89a': '660e8400-e29b-41d4-a716-446655440004', // HCP & HSP Matters
    
    // Workplace Risk Assessment Section function_data IDs
    '7ef33e1f-9485-4d38-8d78-58d90e10df3f': '660e8400-e29b-41d4-a716-446655440005', // Workplace Risk Assessment Matters
    
    // Planning and Research function_data IDs
    'fb8c9f9a-17ec-4fd6-a214-b1f69183f937': '660e8400-e29b-41d4-a716-446655440006', // Planning and Research Matters
    
    // Finance Section function_data IDs
    '2650de56-7294-4483-85f2-c79f770b7cb5': '660e8400-e29b-41d4-a716-446655440007', // Payments
    
    // Investment function_data IDs
    '6f4f72df-0b0e-4ba2-b233-97c4b29dfbb3': '660e8400-e29b-41d4-a716-446655440008', // Investment Matters
    
    // Legal Unit function_data IDs
    '1af12ab6-14ee-4aa6-9b8b-0f8bb2ad60bc': '660e8400-e29b-41d4-a716-446655440009', // Legal Matters
    'e3cdb476-6459-4e8c-8eb0-ff1e364b37b0': '660e8400-e29b-41d4-a716-446655440009', // Review Decision
    
    // ICT Unit function_data IDs
    '1037d524-d7a3-4f15-b470-0380bb50f7c3': '660e8400-e29b-41d4-a716-446655440010', // ICT Technical Support
    
    // Actuarial Statistics and Risk Management function_data IDs
    '4d49728c-367c-4b12-9352-42d53d858f52': '660e8400-e29b-41d4-a716-446655440011', // Actuarial Services and Risk Management Matters
    '17226401-7543-49fd-949c-552f9c6d1866': '660e8400-e29b-41d4-a716-446655440011', // Statistics Matters
    
    // Public Relation Unit function_data IDs
    'd1a44228-05a2-4c4a-a8c6-3a0aa33a5ab4': '660e8400-e29b-41d4-a716-446655440012', // Awareness
    'e1cd3376-e5e4-40f2-9f6a-9db741245eb5': '660e8400-e29b-41d4-a716-446655440012', // Donation/ Sponsorship Matters
    'f065982f-fbab-4e7f-a0a0-d3b4e17907fd': '660e8400-e29b-41d4-a716-446655440012', // Exhibition Matters
    'f887ef83-52c4-49f6-b1a3-2743ae34f35b': '660e8400-e29b-41d4-a716-446655440012', // Advertisement Matters
    
    // Procurement Management Unit function_data IDs
    'c41e8752-07c1-4b3b-a58b-d0cbfe3f1cc0': '660e8400-e29b-41d4-a716-446655440013', // Procurement Matters
    
    // HR/Admin Unit function_data IDs
    '2858ff9b-0c44-4c8d-80df-0f40187e1309': '660e8400-e29b-41d4-a716-446655440014', // Recruitment Matters
    '56f92083-d168-4aa2-a4a9-3d58e59b55e2': '660e8400-e29b-41d4-a716-446655440014', // Human Resource Matters
    'd663c582-d7e7-4b80-b5df-64879fa08d62': '660e8400-e29b-41d4-a716-446655440014', // Leave Management & Intern Attachments
    '56f92083-d168-4aa2-a4a9-3d58e59b55e3': '660e8400-e29b-41d4-a716-446655440014', // DG's Office Matters
    
    // Internal Audit Unit function_data IDs
    'f0015b29-bab2-4b9b-9d10-380f88b6b03e': '660e8400-e29b-41d4-a716-446655440015', // Audit Matters
  };
  
  return mapping[functionDataId] || functionDataId; // Return original if not found in mapping
};

const createTicket = async (req, res) => {
  try {
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
      sub_section:inputSection,
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
    } = req.body;

    // Initialize finalSection before any use
    let finalSection = inputSection;
    if (finalSection === 'Unit') {
      finalSection = sub_section;
    }

    const userId = req?.user?.userId;
    if (!userId) {
      return res.status(400).json({ message: "User ID is required to create a ticket." });
    }
    if (!subject) {
      return res.status(400).json({ message: "Subject is required." });
    }
    // Validate inquiry_type for Inquiry category
    if (category === 'Inquiry' && !inquiry_type) {
      return res.status(400).json({ message: "Inquiry type (Claims or Compliance) is required for Inquiry category." });
    }

    // Map function_data ID to function ID if needed
    const mappedResponsibleUnitId = mapFunctionDataToFunctionId(responsible_unit_id || functionId);

    // --- Assignment Logic ---
    let assignedUser = null;
    let allocatedUserUsername = employerAllocatedStaffUsername || req.body.allocated_user_username;
    // let allocatedUserUsername = employerAllocatedStaffUsername;
    // console.log(allocatedUserUsername);
    // attendee.hr1
   
    if (category === 'Inquiry') {
      // Claims or Compliance
      if (allocatedUserUsername) {
        assignedUser = await User.findOne({
          where: { username: allocatedUserUsername },
          attributes: ['id', 'name', 'email', 'role', 'unit_section']
        });
        // If not found, create the user
        if (!assignedUser) {
          const nameParts = allocatedUserUsername.split('.').map(
            part => part.charAt(0).toUpperCase() + part.slice(1)
          );
          const newUser = await User.create({
            username: allocatedUserUsername,
            name: nameParts.join(' '),
            email: `${allocatedUserUsername}@ttcl.co.tz`,
            role: 'attendee',
            unit_section: finalSection || responsible_unit_name,
            password: await bcrypt.hash('defaultPassword123', 10),
            status: 'active',
          });
          assignedUser = newUser;
        }
      }
      // If not assigned by username, try focal-person by inquiry_type
      if (!assignedUser && inquiry_type) {
        let focalRole = null;
        if (inquiry_type.toLowerCase() === 'claims') {
          focalRole = 'claim-focal-person';
        } else if (inquiry_type.toLowerCase() === 'compliance') {
          focalRole = 'compliance-focal-person';
        }
        if (focalRole) {
          assignedUser = await User.findOne({
            where: {
              role: focalRole,
              unit_section: finalSection || responsible_unit_name
            },
            attributes: ['id', 'name', 'email', 'role', 'unit_section']
          });
        }
      }
      // Fallback to general focal-person if still not found
      if (!assignedUser) {
        assignedUser = await User.findOne({
          where: {
            role:{[Op.in]: ['focal-person', 'claim-focal-person', 'complience-focal-person']},
            unit_section: responsible_unit_name||finalSection  // Use section/unit if available
          },
          attributes: ['id', 'name', 'email', 'role', 'unit_section']
        });
      }
    } else if (["Complaint", "Suggestion", "Compliment"].includes(category)) {
      // Assign to coordinator
      assignedUser = await User.findOne({
        where: { role: 'coordinator' },
        attributes: ['id', 'name', 'email', 'role', 'unit_section']
      });
    }
    if (!assignedUser) {
      return res.status(400).json({ message: `No appropriate user found to assign the ${category} ticket to.` });
    }

    // --- Ticket Data Preparation ---
    const ticketId = generateTicketId();
    const responsibleUnit = await Function.findOne({
      where: { id: mappedResponsibleUnitId },
      include: [{ model: Section, as: 'section' }]
    });
    const initialStatus = shouldClose ? 'Closed' : (status || 'Open');
    let ticketEmployerId = null;
    let ticketPhoneNumber = phoneNumber;
    let ticketInstitution = institution;
    let requesterFullName = `${firstName} ${lastName || ''}`;
    // Handle Employer details and association
    if (requester === 'Employer') {
      let employer = await Employer.findOne({ where: { registration_number: employerRegistrationNumber } });
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
          allocated_staff_username: employerAllocatedStaffUsername,
        });
      }
      ticketEmployerId = employer.id;
      ticketPhoneNumber = employerPhone;
      ticketInstitution = employerName;
      requesterFullName = employerName;
    } else if (requester === 'Representative') {
      ticketPhoneNumber = requesterPhoneNumber;
      requesterFullName = requesterName;
    }

    const ticketData = {
      
      ticket_id: ticketId,
      first_name: firstName,
      middle_name: middleName || '',
      last_name: lastName,
      phone_number: ticketPhoneNumber,
      nida_number: nidaNumber,
      requester,
      institution: ticketInstitution,
      channel,
      region,
      district,
      category,
      inquiry_type,
      responsible_unit_id: mappedResponsibleUnitId,
      responsible_unit_name: responsible_unit_name,
      section: responsibleUnit?.section?.name || 'Unit',
      sub_section: responsibleUnit?.name || finalSection,
      subject: subject || '',
      description,
      status: initialStatus,
      userId: userId,
      assigned_to: assignedUser.id,
      assigned_to_id: assignedUser.id,
      assigned_to_role: assignedUser.role,
      employerId: ticketEmployerId,
    };
    if (shouldClose) {
      ticketData.resolution_details = resolution_details || description || 'Ticket resolved during creation';
      ticketData.date_of_resolution = new Date();
      ticketData.attended_by_id = userId;
    }
    // --- Ticket Creation ---
    const newTicket = await Ticket.create(ticketData);
    // Save representative details if applicable
    if (requester === 'Representative') {
      await RequesterDetails.create({
        ticketId: newTicket.id,
        name: requesterName,
        phoneNumber: requesterPhoneNumber,
        email: requesterEmail,
        address: requesterAddress,
        relationshipToEmployee: relationshipToEmployee,
      });
    }
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
        message: `New ${category} ticket assigned to you: ${subject}`,
        channel: channel,
        status: 'unread',
        category: category
      });
      // --- Create Ticket Assignment Record ---
      await TicketAssignment.create({
        ticket_id: newTicket.id,
        assigned_by_id: userId,
        assigned_to_id: assignedUser.id,
        assigned_to_role: assignedUser.role,
        action: 'Assigned',
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
        assigned_to_role: attended_by_role,
        action: 'Closed',
        reason: resolution_details || 'Ticket closed by agent',
        created_at: new Date()
      });
    }

// Format phone number for SMS: ensure it starts with +255 and is followed by 9 digits
let smsRecipient = String(ticketPhoneNumber || '').replace(/^\+/, '').replace(/^0/, '255');
const isValidTzPhone = (num) => /^255\d{9}$/.test(num);

if ((requester === 'Employee' || requester === 'Representative') && isValidTzPhone(smsRecipient)) {
  const smsMessage = `Dear ${requesterFullName}, your ticket (ID: ${newTicket.ticket_id}) has been created.`;
  try {
    await sendQuickSms({ message: smsMessage, recipient: smsRecipient });
    console.log("SMS sent successfully to", smsRecipient);
  } catch (smsError) {
    console.error("Error sending SMS:", smsError.message);
  }
} else {
  console.log('Not sending SMS, invalid phone:', smsRecipient);
}

    // --- Email Notification to Assignee ---
    let emailWarning = '';
    if (assignedUser.email) {
      const emailSubject = `New ${category} Ticket Assigned: ${subject} (ID: ${newTicket.ticket_id})`;
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
        await sendEmail({ to: 'rehema.said3@ttcl.co.tz', subject: emailSubject, htmlBody: emailHtmlBody });
      } catch (emailError) {
        console.error("Error sending email:", emailError.message);
        // console.error("Error sending email:", 'rehema.said3@ttcl.co.tz');
        emailWarning += ' (Warning: Failed to send email to assignee.)';
      }
    }
    // --- Notification for Assignee ---
    await Notification.create({
      ticket_id: newTicket.id,
      sender_id: userId,
      recipient_id: assignedUser.id,
      message: `New ${category} ticket ${shouldClose ? '(Closed)' : ''} assigned to you: ${subject}`,
      channel: channel,
      status: 'unread'
    });
    // --- Email to Supervisor if Closed on Creation ---
    if (shouldClose) {
      const supervisor = await User.findOne({
        where: {
          role: 'supervisor',
          unit_section: newTicket.section
        },
        attributes: ['id', 'name', 'email']
      });
      if (supervisor && supervisor.email) {
        const emailSubject = `Ticket Closed: ${newTicket.subject} (ID: ${newTicket.ticket_id})`;
        const emailBody = `The following ticket has been closed by the agent: ${newTicket.subject} (ID: ${newTicket.ticket_id})`;
        try {
          // await sendEmail({ to: supervisor.email, subject: emailSubject, htmlBody: emailBody });
          await sendEmail({ to: 'rehema.said3@ttcl.co.tz', subject: emailSubject, htmlBody: emailHtmlBody });
        } catch (emailError) {
          console.error("Error sending email to supervisor:", emailError.message);
          emailWarning += ' (Warning: Failed to send email to supervisor.)';
        }
      }
    }
    return res.status(201).json({
      message: `Ticket created successfully${shouldClose ? ' and closed' : ''}${emailWarning}`,
      ticket: newTicket
    });
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
          status:{[Op.ne]: "Closed"}},
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
    console.error("Error fetching tickets:", error);
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
            as: 'assignee',
            attributes: ['id', 'name', 'email']
          },
          {
            model: TicketAssignment,
            as: 'assignments',
            include: [
              {
                model: User,
                as: 'assignee',
                attributes: ['id', 'name', 'email']
              }
            ]
          }
        ],
        order: [["created_at", "DESC"]]
      });
    } else {
      // Agent: Fetch only OPEN tickets created by this agent
      tickets = await Ticket.findAll({
        where: { userId, status: ["Open", "Assigned"] }, // Filter by userId and status
        include: [
          {
            model: User,
            as: 'assignee',
            attributes: ['id', 'name', 'email']
          },
          {
            model: TicketAssignment,
            as: 'assignments',
            include: [
              {
                model: User,
                as: 'assignee',
                attributes: ['id', 'name', 'email']
              }
            ]
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
      t.assignments = (t.assignments || []).sort((a, b) => new Date(a.created_at) - new Date(b.created_at)).map(a => ({
        assigned_to_id: a.assigned_to_id,
        assigned_to_name: a.assignee?.name || null,
        assigned_to_role: a.assignee?.role || null,
        reason: a.reason,
        action: a.action,
        created_at: a.created_at
      }));
      return {
        ...t,
        created_by: user.name
      };
    });
    console.log('all ticketd open', response);
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
    if (user.role === "super-admin") {
      // Super admin: Fetch all tickets with status Assigned or Open
      tickets = await Ticket.findAll({
        where: { status: { [Op.in]: ["Assigned", "Open"] } },
        include: [
          {
            model: User,
            as: 'assignee',
            attributes: ['id', 'name', 'email']
          },
          {
            model: TicketAssignment,
            as: 'assignments',
            include: [
              {
                model: User,
                as: 'assignee',
                attributes: ['id', 'name', 'email']
              }
            ]
          }
        ],
        order: [["created_at", "DESC"]]
      });
    } else {
      // Fetch tickets assigned to this user (attendee)
      tickets = await Ticket.findAll({
        where: {
          assigned_to_id: userId,
          status: { [Op.in]: ["Assigned", "Open"] }
        },
        include: [
          {
            model: User,
            as: 'assignee',
            attributes: ['id', 'name', 'email']
          },
          {
            model: TicketAssignment,
            as: 'assignments',
            include: [
              {
                model: User,
                as: 'assignee',
                attributes: ['id', 'name', 'email']
              }
            ]
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
      t.assignments = (t.assignments || []).sort((a, b) => new Date(a.created_at) - new Date(b.created_at)).map(a => ({
        assigned_to_id: a.assigned_to_id,
        assigned_to_name: a.assignee?.name || null,
        assigned_to_role: a.assignee?.role || null,
        reason: a.reason,
        action: a.action,
        created_at: a.created_at
      }));
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

    if (user.role === "super-admin") {
      // Super admin: Fetch all OPEN tickets
      tickets = await Ticket.findAll({
        where: { status: "In Progress" }, // Filter by status
        attributes: { exclude: ["userId"] },
        include: [
          {
            model: User,
            as: 'assignee',
            attributes: ['id', 'name', 'email']
          },
          {
            model: TicketAssignment,
            as: 'assignments',
            include: [
              {
                model: User,
                as: 'assignee',
                attributes: ['id', 'name', 'email']
              }
            ]
          }
        ],
        order: [["created_at", "DESC"]]
      });
    } else {
      // Agent: Fetch only OPEN tickets created by this agent
      tickets = await Ticket.findAll({
        where: { userId, status: "In Progress" }, // Filter by userId and status
        include: [
          {
            model: User,
            as: 'assignee',
            attributes: ['id', 'name', 'email']
          },
          {
            model: TicketAssignment,
            as: 'assignments',
            include: [
              {
                model: User,
                as: 'assignee',
                attributes: ['id', 'name', 'email']
              }
            ]
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
      t.assignments = (t.assignments || []).sort((a, b) => new Date(a.created_at) - new Date(b.created_at)).map(a => ({
        assigned_to_id: a.assigned_to_id,
        assigned_to_name: a.assignee?.name || null,
        assigned_to_role: a.assignee?.role || null,
        reason: a.reason,
        action: a.action,
        created_at: a.created_at
      }));
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
            as: 'assignee',
            attributes: ['id', 'name', 'email']
          },
          {
            model: TicketAssignment,
            as: 'assignments',
            include: [
              {
                model: User,
                as: 'assignee',
                attributes: ['id', 'name', 'email']
              }
            ]
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
            as: 'assignee',
            attributes: ['id', 'name', 'email']
          },
          {
            model: TicketAssignment,
            as: 'assignments',
            include: [
              {
                model: User,
                as: 'assignee',
                attributes: ['id', 'name', 'email']
              }
            ]
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
      t.assignments = (t.assignments || []).sort((a, b) => new Date(a.created_at) - new Date(b.created_at)).map(a => ({
        assigned_to_id: a.assigned_to_id,
        assigned_to_name: a.assignee?.name || null,
        assigned_to_role: a.assignee?.role || null,
        reason: a.reason,
        action: a.action,
        created_at: a.created_at
      }));
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
            as: 'assignee',
            attributes: ['id', 'name', 'email']
          },
          {
            model: TicketAssignment,
            as: 'assignments',
            include: [
              {
                model: User,
                as: 'assignee',
                attributes: ['id', 'name', 'email']
              }
            ]
          }
        ],
        order: [["created_at", "DESC"]]
      });
    } else {
      // Agent: Fetch only Closed tickets created by this agent
      tickets = await Ticket.findAll({
        where: { userId, status: "Closed" }, // Filter by userId and status
        include: [
          {
            model: User,
            as: 'assignee',
            attributes: ['id', 'name', 'email']
          },
          {
            model: TicketAssignment,
            as: 'assignments',
            include: [
              {
                model: User,
                as: 'assignee',
                attributes: ['id', 'name', 'email']
              }
            ]
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
      t.assignments = (t.assignments || []).sort((a, b) => new Date(a.created_at) - new Date(b.created_at)).map(a => ({
        assigned_to_id: a.assigned_to_id,
        assigned_to_name: a.assignee?.name || null,
        assigned_to_role: a.assignee?.role || null,
        reason: a.reason,
        action: a.action,
        created_at: a.created_at
      }));
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

    console.log("Fetching Overdue tickets for user ID:", userId);

    // Fetch User details including role
    const user = await User.findOne({
      where: { id: userId },
      attributes: ["id", "name", "role"],
    });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Define overdue logic: Open tickets older than 10 days
    const tenDaysAgo = new Date();
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

    let tickets;
    if (user.role === "super-admin") {
      // Super admin: Fetch all overdue tickets (Open, older than 10 days)
      tickets = await Ticket.findAll({
        where: {
          status: "Open",
          created_at: { [Op.lt]: tenDaysAgo },
        },
        include: [
          {
            model: User,
            as: 'assignee',
            attributes: ['id', 'name', 'email']
          },
          {
            model: TicketAssignment,
            as: 'assignments',
            include: [
              {
                model: User,
                as: 'assignee',
                attributes: ['id', 'name', 'email']
              }
            ]
          }
        ],
        order: [["created_at", "DESC"]],
      });
    } else {
      // Agent: Fetch only their overdue tickets
      tickets = await Ticket.findAll({
        where: {
          userId,
          status: "Open",
          created_at: { [Op.lt]: tenDaysAgo },
        },
        include: [
          {
            model: User,
            as: 'assignee',
            attributes: ['id', 'name', 'email']
          },
          {
            model: TicketAssignment,
            as: 'assignments',
            include: [
              {
                model: User,
                as: 'assignee',
                attributes: ['id', 'name', 'email']
              }
            ]
          }
        ],
        order: [["created_at", "DESC"]],
      });
    }

    if (tickets.length === 0) {
      return res.status(404).json({ message: "No overdue tickets found." });
    }

    // Map tickets to include created_by and assignment history
    const response = tickets.map((ticket) => {
      const t = ticket.toJSON();
      t.assignments = (t.assignments || []).sort((a, b) => new Date(a.created_at) - new Date(b.created_at)).map(a => ({
        assigned_to_id: a.assigned_to_id,
        assigned_to_name: a.assignee?.name || null,
        assigned_to_role: a.assignee?.role || null,
        reason: a.reason,
        action: a.action,
        created_at: a.created_at
      }));
      return {
        ...t,
        created_by: user.name,
      };
    });

    res.status(200).json({
      message: "Overdue tickets fetched successfully",
      totalTickets: tickets.length,
      tickets: response,
    });
  } catch (error) {
    console.error("Error fetching overdue tickets:", error);
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
          as: 'responsibleSection',
          attributes: ['id', 'name'],
          include: [
            {
              model: Function,
              as: 'functions',
              attributes: ['id', 'name'],
              include: [
                {
                  model: FunctionData,
                  as: 'functionData',
                  attributes: ['id', 'name']
                }
              ]
            }
          ]
        },
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'name', 'email']
        },
        {
          model: User,
          as: 'assignee',
          attributes: ['id', 'name', 'email']
        },
        {
          model: User,
          as: 'attendedBy',
          attributes: ['id', 'name', 'email']
        },
        {
          model: User,
          as: 'ratedBy',
          attributes: ['id', 'name', 'email']
        },
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
      tickets,
    });
  } catch (error) {
    console.error("Error fetching tickets:", error.stack);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getAllTickets = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }
    console.log("Fetching All tickets for user ID:", userId);
    const user = await User.findOne({
      where: { id: userId },
      attributes: ["id", "name", "role"],
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
            as: 'responsibleSection',
            attributes: ['id', 'name'],
            include: [
              {
                model: Function,
                as: 'functions',
                attributes: ['id', 'name'],
                include: [
                  {
                    model: FunctionData,
                    as: 'functionData',
                    attributes: ['id', 'name']
                  }
                ]
              }
            ]
          },
          {
            model: User,
            as: 'creator',
            attributes: ['id', 'name', 'email']
          },
          {
            model: User,
            as: 'assignee',
            attributes: ['id', 'name', 'email']
          },
          {
            model: TicketAssignment,
            as: 'assignments',
            include: [
              {
                model: User,
                as: 'assignee',
                attributes: ['id', 'name', 'email']
              }
            ]
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
            as: 'responsibleSection',
            attributes: ['id', 'name'],
            include: [
              {
                model: Function,
                as: 'functions',
                attributes: ['id', 'name'],
                include: [
                  {
                    model: FunctionData,
                    as: 'functionData',
                    attributes: ['id', 'name']
                  }
                ]
              }
            ]
          },
          {
            model: User,
            as: 'creator',
            attributes: ['id', 'name', 'email']
          },
          {
            model: User,
            as: 'assignee',
            attributes: ['id', 'name', 'email']
          },
          {
            model: TicketAssignment,
            as: 'assignments',
            include: [
              {
                model: User,
                as: 'assignee',
                attributes: ['id', 'name', 'email']
              }
            ]
          }
        ],
        order: [["created_at", "DESC"]]
      });
    }

    if (tickets.length === 0) {
      return res.status(404).json({ message: "No tickets found for this user." });
    }

    const response = tickets.map((ticket) => {
      const t = ticket.toJSON();
      t.assignments = (t.assignments || []).sort((a, b) => new Date(a.created_at) - new Date(b.created_at)).map(a => ({
        assigned_to_id: a.assigned_to_id,
        assigned_to_name: a.assignee?.name || "N/A",
        assigned_to_role: a.assignee?.role || "N/A",
        action: a.action,
        reason: a.reason || t.description,
        created_at: a.created_at
      }));
      return {
        ...t,
        created_by: user.name,
      };
    });
console.log('all ticketd closed', response);
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
      category: 'complaint',
      status: 'pending',
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
      case 'rate':
        // Coordinator rates and assigns complaint
        mockTicket.complaint_rating = 'minor';
        mockTicket.complaint_type = 'unit';
        mockTicket.status = 'assigned';
        mockTicket.assigned_to_id = userId;
        break;

      case 'progress':
        // Head of Unit/Manager updates progress
        mockTicket.status = 'in_progress';
        mockTicket.attended_by_id = userId;
        mockTicket.recommendation = 'Working on resolution';
        break;

      case 'recommend':
        // Attendee makes recommendation
        mockTicket.status = 'recommended';
        mockTicket.recommendation = 'Proposed solution';
        mockTicket.evidence_url = 'https://example.com/evidence.pdf';
        break;

      case 'review':
        // Head of Unit/Manager reviews
        mockTicket.status = 'reviewed';
        mockTicket.review_notes = 'Review completed';
        break;

      case 'approve':
        // DG approves
        mockTicket.status = 'approved';
        mockTicket.approval_notes = 'Approved by DG';
        mockTicket.closed_at = new Date();
        break;

      case 'reverse':
        // Any approver can reverse
        mockTicket.status = 'reversed';
        mockTicket.review_notes = 'Reversed for further review';
        break;

      case 'convert':
        // Coordinator converts to inquiry
        mockTicket.category = 'inquiry';
        mockTicket.status = 'pending';
        break;

      default:
        return res.status(400).json({ message: 'Invalid action' });
    }

    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500));

    res.json({
      message: `Complaint ${action} completed successfully`,
      ticket: mockTicket
    });

  } catch (error) {
    console.error('Error in mock workflow:', error);
    res.status(500).json({ message: 'Error in mock workflow' });
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
      order: [['created_at', 'DESC']],
      include: [
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'name', 'role']
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
    return res.status(500).json({ message: "Internal server error", error: error.message });
  }
};

const getTicketById = async (req, res) => {
  try {
    const { ticketId } = req.params;
    
    const ticket = await Ticket.findOne({
      where: { id: ticketId },
      include: [
        {
          model: Section,
          as: 'responsibleSection',
          attributes: ['id', 'name'],
          include: [
            {
              model: Function,
              as: 'functions',
              attributes: ['id', 'name'],
              include: [
                {
                  model: FunctionData,
                  as: 'functionData',
                  attributes: ['id', 'name']
                }
              ]
            }
          ]
        },
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'name', 'username']
        },
        {
          model: User,
          as: 'assignee',
          attributes: ['id', 'name', 'role']
        },
        {
          model: User,
          as: 'attendedBy',
          attributes: ['id', 'name', 'email']
        },
        {
          model: User,
          as: 'ratedBy',
          attributes: ['id', 'name', 'email']
        },
        {
          model: User,
          as: 'convertedBy',
          attributes: ['id', 'name', 'email']
        },
        {
          model: User,
          as: 'forwardedBy',
          attributes: ['id', 'name', 'email']
        },
        {
          model: TicketAssignment,
          as: 'assignments',
          include: [
            {
              model: User,
              as: 'assignee',
              attributes: ['id', 'name', 'role']
            }
          ],
          order: [['created_at', 'ASC']]
        }
      ]
    });

    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    return res.status(200).json({ ticket });
  } catch (error) {
    console.error("Error fetching ticket:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Helper to notify all users with a given role when ticket closed
async function notifyUsersByRole(roles, subject, htmlBody, ticketId, senderId, message) {
  const users = await User.findAll({ where: { role: roles } });
  // Fetch sender's role for channel
  let senderRole = 'system';
  if (senderId) {
    const senderUser = await User.findOne({ where: { id: senderId } });
    if (senderUser && senderUser.role) senderRole = senderUser.role;
  }
  for (const user of users) {
    if (user.email) {
      // await sendEmail({ to: user.email, subject, htmlBody });
      await sendEmail({ to: 'rehema.said3@ttcl.co.tz', subject, htmlBody });
    }
    await Notification.create({
      ticket_id: ticketId,
      sender_id: senderId,
      recipient_id: user.id,
      message,
      status: 'unread',
      channel: senderRole
    });
  }
}

const closeTicket = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { resolution_details, userId } = req.body;

    if (!ticketId) {
      return res.status(400).json({ message: "Ticket ID is required" });
    }

    const ticket = await Ticket.findOne({
      where: { id: ticketId },
      include: [
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'name']
        }
      ]
    });

    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    // Update ticket status and add resolution details
    await ticket.update({
      status: 'Closed',
      resolution_details: resolution_details || 'Ticket closed by agent',
      date_of_resolution: new Date(),
      attended_by_id: userId
    });

    // Notify all coordinators and supervisors
    const notifySubject = `Ticket Closed: ${ticket.subject}`;
    const notifyHtml = `<p>The following ticket has been closed: ${ticket.subject} (ID: ${ticket.ticket_id})</p>`;
    const notifyMsg = `Ticket ${ticket.ticket_id} has been closed.`;
    await notifyUsersByRole(['coordinator', 'supervisor'], notifySubject, notifyHtml, ticketId, userId, notifyMsg);

    // Fetch attended_by user name and role
    let attended_by_name = null;
    let attended_by_role = null;
    if (userId) {
      const attendedByUser = await User.findOne({ where: { id: userId } });
      attended_by_name = attendedByUser ? attendedByUser.name : null;
      attended_by_role = attendedByUser ? attendedByUser.role : null;
    }

    // Record the closing action in TicketAssignment
    await TicketAssignment.create({
      ticket_id: ticketId,
      assigned_by_id: userId,
      assigned_to_id: userId,
      assigned_to_role: attended_by_role,
      action: 'Closed',
      reason: resolution_details || 'Ticket closed by agent',
      created_at: new Date()
    });

    await AssignedOfficer.update(
      { status: 'Completed', completed_at: new Date() },
      { where: { ticket_id: ticketId, status: 'Active' } }
    );

    return res.status(200).json({
      message: "Ticket closed successfully",
      ticket: {
        ...ticket.toJSON(),
        attended_by_name
      }
    });

  } catch (error) {
    console.error("Error closing ticket:", error);
    return res.status(500).json({
      message: "Failed to close ticket",
      error: error.message
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
        message: "Ticket ID, user ID, and resolution details are required" 
      });
    }

    // Find the ticket and include relevant associations
    const ticket = await Ticket.findOne({
      where: { 
        id: ticketId,
        category: {
          [Op.in]: ['Complaint', 'Suggestion', 'Compliment'] // Allow all coordinator-managed categories
        }
      },
      include: [
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'name']
        },
        {
          model: User,
          as: 'assignee',
          attributes: ['id', 'name', 'role']
        }
      ]
    });

    if (!ticket) {
      return res.status(404).json({ 
        message: "Ticket not found or not a coordinator-managed ticket type" 
      });
    }

    // Check if the user is authorized (must be a coordinator)
    const coordinator = await User.findOne({
      where: { 
        id: userId,
        role: 'coordinator'
      }
    });

    if (!coordinator) {
      return res.status(403).json({ 
        message: "Only coordinators can close these types of tickets" 
      });
    }

    // Update the ticket
    await ticket.update({
      status: 'Closed',
      resolution_details,
      resolution_type: resolution_type || 'Resolved',
      date_of_resolution: new Date(),
      attended_by_id: userId
    });

    // Notify all coordinators and supervisors
    const notifySubject2 = `Ticket Closed: ${ticket.subject}`;
    const notifyHtml2 = `<p>The following ticket has been closed: ${ticket.subject} (ID: ${ticket.ticket_id})</p>`;
    const notifyMsg2 = `Ticket ${ticket.ticket_id} has been closed.`;
    await notifyUsersByRole(['coordinator', 'supervisor'], notifySubject2, notifyHtml2, ticketId, userId, notifyMsg2);

    // If there was a focal person or other assignee involved, notify them too
    if (ticket.assigned_to && ticket.assigned_to !== userId) {
      await Notification.create({
        ticket_id: ticketId,
        sender_id: userId,
        recipient_id: ticket.assigned_to,
        message: `${ticket.category} ticket ${ticket.ticket_id} has been resolved and closed by coordinator`,
        status: 'unread'
      });
    }

    await AssignedOfficer.update(
      { status: 'Completed', completed_at: new Date() },
      { where: { ticket_id: ticketId, status: 'Active' } }
    );

    return res.status(200).json({
      message: `${ticket.category} closed successfully`,
      ticket: {
        ...ticket.toJSON(),
        resolution_date: new Date(),
        resolved_by: coordinator.name
      }
    });

  } catch (error) {
    console.error("Error closing ticket:", error);
    return res.status(500).json({
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
    const assignedTo = await User.findOne({ where: { username: assignedToUsername } });
    if (!assignedTo) {
      return res.status(404).json({ message: "Attendee not found" });
    }
    // Update ticket assignment
    await Ticket.update(
      { assigned_to_id: assignedTo.id, assigned_to_role: assignedTo.role, status: 'Assigned' },
      { where: { id: ticketId } }
    );
    // Track assignment
    await TicketAssignment.create({
      ticket_id: ticketId,
      assigned_by_id: assignedById,
      assigned_to_id: assignedTo.id,
      assigned_to_role: assignedTo.role,
      action: 'Assigned',
      reason,
      created_at: new Date()
    });
    // Send email to assigned attendee (if email exists)
    if (assignedTo.email) {
      const ticket = await Ticket.findOne({ where: { id: ticketId } });
      const emailSubject = `Ticket Assigned: ${ticket.subject || ''} (ID: ${ticket.ticket_id || ticketId})`;
      const emailHtmlBody = `
        <p>Dear ${assignedTo.name || assignedTo.username},</p>
        <p>You have been assigned a ticket. Details:</p>
        <ul>
          <li><strong>Ticket ID:</strong> ${ticket.ticket_id || ticketId}</li>
          <li><strong>Subject:</strong> ${ticket.subject || ''}</li>
          <li><strong>Description:</strong> ${ticket.description || ''}</li>
        </ul>
        <p>Please log in to the system to review and handle this ticket.</p>
        <p>Thank you,</p>
        <p>WCF Customer Care System</p>
      `;
      try {
        // await sendEmail({ to: assignedTo.email, subject: emailSubject, htmlBody: emailHtmlBody });
        await sendEmail({ to: 'rehema.said3@ttcl.co.tz', subject: emailSubject, htmlBody: emailHtmlBody });
      } catch (emailError) {
        console.error("Error sending assignment email:", emailError.message);
      }
    }
    return res.json({ message: 'Ticket assigned successfully' });
  } catch (error) {
    console.error('Error assigning ticket:', error);
    return res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

const getAllAttendee = async (req, res) => {
  try {
    const attendee = await User.findAll({
      where: { role: "attendee" },
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
    const assignments = await TicketAssignment.findAll({
      where: { ticket_id: ticketId },
      include: [
        {
          model: User,
          as: 'assignee',
          attributes: ['id', 'name', 'role']
        }
      ],
      order: [["created_at", "ASC"]]
    });
    let mappedAssignments = assignments.map(a => ({
      assigned_to_id: a.assigned_to_id,
      assigned_to_name: a.assignee ? a.assignee.name : null,
      assigned_to_role: a.assignee ? a.assignee.role : null,
      reason: a.reason,
      action: a.action,
      created_at: a.created_at
    }));
    // Add creator_name to the first assignment if available
    if (assignments.length > 0) {
      const creatorUser = await User.findOne({ where: { id: assignments[0].assigned_by_id } });
      if (creatorUser) {
        mappedAssignments[0].creator_name = creatorUser.name || `${creatorUser.first_name || ''} ${creatorUser.last_name || ''}`.trim();
      }
    }
    console.log('ticket assignment', mappedAssignments);
    res.json(mappedAssignments);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch ticket assignments", error: error.message });
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
    res.status(500).json({ message: "Failed to fetch assigned officers", error: error.message });
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
          where: {
            assigned_to_id: userId,
            status: { [Op.in]: ["Open", "Assigned"] }
          },
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
    const user = await User.findOne({ where: { id: userId }, attributes: ["id", "name", "role"] });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    // ALL ROLES (except coordinator) LOGIC: use assigned_to_id for all counts
    if (user.role !== 'coordinator') {
      const ticketWhere = { assigned_to_id: userId };
      const statuses = ["Open", "Assigned", "Closed", "Carried Forward", "In Progress"];
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
      const today = new Date();
      today.setHours(0, 0, 0, 0);
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
      // Assigned tickets: assigned_to_id = userId and status in ["Assigned", "Open"]
      let assignedCount = await Ticket.count({
        where: {
          assigned_to_id: userId,
          status: { [Op.in]: ["Assigned", "Open"] },
        },
      });
      // Escalated tickets: assigned_to_id = userId and is_escalated = true
      const escalatedCount = await Ticket.count({
        where: {
          assigned_to_id: userId,
          is_escalated: true,
        },
      });
      // In-progress assignments count (not closed)
      const assignments = await TicketAssignment.findAll({
        where: {
          assigned_by_id: userId,
          action: { [Op.in]: ["Assigned", "Reassigned"] },
        },
        include: [
          {
            model: Ticket,
            as: "ticket",
            where: { status: { [Op.ne]: "Closed" } },
          }
        ],
      });
      // Reduce to only the latest assignment per ticket_id
      const latestAssignmentsMap = new Map();
      for (const assignment of assignments) {
        if (!latestAssignmentsMap.has(assignment.ticket_id)) {
          latestAssignmentsMap.set(assignment.ticket_id, assignment);
        }
      }
      const filteredAssignments = Array.from(latestAssignmentsMap.values()).filter(a => a.ticket);
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
          const avgWaitMinutes = waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length;
          longestWait = `${Math.floor(maxWaitMinutes / 60)}:${String(maxWaitMinutes % 60).padStart(2, "0")}`;
          avgWait = `${Math.floor(avgWaitMinutes / 60)}:${String(Math.round(avgWaitMinutes % 60)).padStart(2, "0")}`;
          maxWait = longestWait;
          slaBreaches = waitTimes.filter((t) => t > 1440).length; // > 24 hours
        }
      }
      // Debug log
      console.log('Filtered assignments for in-progress count:', filteredAssignments.map(a => ({
        ticket_id: a.ticket_id,
        ticket_status: a.ticket?.status,
        assigned_by_id: a.assigned_by_id,
        action: a.action
      })));
      // In Progress: status = 'In Progress'
      const inProgressCount = await Ticket.count({ where: { assigned_to_id: userId, status: 'In Progress' } });
      return res.status(200).json({
        success: true,
        ticketStats: {
          total,
          assigned: assignedCount,
          escalated: escalatedCount,
          closed: counts.closed || 0,
          carriedForward: counts.carriedforward || 0,
          inProgress: inProgressCount,
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
        },
      });
    }
    // FOCAL PERSON/MANAGEMENT LOGIC
    if (["focal-person", "claim-focal-person", "compliance-focal-person",
       "head-of-unit", "manager", "supervisor", "director-general", "director",
        "admin", "super-admin"].includes(user.role)) {
      // Use focal person dashboard logic
      // You may want to import and call getFocalPersonDashboardCounts here, or inline the logic
      // For now, inline the logic:
      const ticketWhere = { assigned_to_id: userId };
      const newInquiries = await Ticket.count({
        where: {
          ...ticketWhere,
          [Op.or]: [
            { status: null },
            { status: "Open" },
          ],
        },
      });
      const escalatedInquiries = await Ticket.count({
        where: {
          ...ticketWhere,
          is_escalated: true,
        },
      });
      const totalInquiries = await Ticket.count({ where: ticketWhere });
      const inProgressInquiries = await Ticket.count({
        where: {
          ...ticketWhere,
          status: "In Progress",
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
          assigned_to_id: userId,
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
        include: [{
          model: Ticket,
          as: 'ticket',
          where: {
            status: { [Op.ne]: 'Closed' }
          }
        }]
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
    if (user.role === 'coordinator') {
      // Return the full nested structure expected by the sidebar
      return res.status(200).json({
        success: true,
        message: 'Dashboard counts for coordinator',
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
            Closed: 0,
            // "On Progress": 0 // add if needed
          }
        }
      });
    }
    return res.status(400).json({ success: false, message: "Role not supported for dashboard counts" });
  } catch (error) {
    console.error("Error fetching dashboard counts:", error);
    res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};


const reassignTicket = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { assigned_to_id, assigned_to_role, reassignment_reason, notes } = req.body;
    const assigned_by_id = req.user?.userId;

    // Mark previous assignment as 'Reassigned'
    await AssignedOfficer.update(
      { status: 'Reassigned', completed_at: new Date(), reassignment_reason: reassignment_reason || null },
      { where: { ticket_id: ticketId, status: 'Active' } }
    );

    // Insert new assignment row
    await AssignedOfficer.create({
      ticket_id: ticketId,
      assigned_to_id,
      assigned_to_role,
      assigned_by_id,
      status: 'Active',
      assigned_at: new Date(),
      notes: notes || 'Reassignment'
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
      message: 'Ticket reassigned successfully'
    });
  } catch (error) {
    console.error('Error in reassignTicket:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reassign ticket',
      error: error.message
    });
  }
};

const getInProgressAssignments = async (req, res) => {
  try {
    // Prefer userId from authenticated user (JWT), fallback to query param
    const userId = req.user?.userId || req.query.userId;
    if (!userId) {
      return res.status(400).json({ message: 'User ID is required' });
    }
    // Get only the most recent assignment per ticket_id, including ticket details
    const assignments = await TicketAssignment.findAll({
      where: {
        assigned_by_id: userId,
        action: { [Op.in]: ['Assigned', 'Reassigned'] },
      },
      order: [['ticket_id', 'ASC'], ['created_at', 'DESC']],
      include: [
        {
          model: Ticket,
          as: 'ticket',
          where: { status: { [Op.ne]: 'Closed' } },
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
    const filteredAssignments = latestAssignments.filter(a => a.ticket);
    res.status(200).json({
      message: 'In-progress assignments fetched successfully',
      count: filteredAssignments.length,
      assignments: filteredAssignments,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch in-progress assignments', error: error.message });
  }
};


const reverseTicket = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { userId, reason } = req.body;

    // Get assignment history, ordered by created_at DESC
    const assignments = await TicketAssignment.findAll({
      where: { ticket_id: ticketId },
      order: [['created_at', 'DESC']]
    });

    if (assignments.length < 2) {
      return res.status(400).json({ message: "No previous user to reverse to." });
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

    res.status(200).json({ message: "Ticket reversed to previous user successfully." });
  } catch (error) {
    console.error("Error reversing ticket:", error);
    res.status(500).json({ message: "Failed to reverse ticket", error: error.message });
  }
};
// ... existing code ...



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
};
