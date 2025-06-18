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

    const ticketStats = {
      total,
      open: counts.open || 0,
      assigned: counts.assigned || 0,
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
      section: inputSection,
      sub_section,
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

   

    // --- Assignment Logic ---
    let assignedUser = null;
    let allocatedUserUsername = employerAllocatedStaffUsername || req.body.allocated_user_username;
    // let allocatedUserUsername = employerAllocatedStaffUsername || 'rehema.finance';
   
    if (category === 'Inquiry') {
      // Claims or Compliance
      if (allocatedUserUsername) {
        assignedUser = await User.findOne({
          where: { username: allocatedUserUsername },
          attributes: ['id', 'name', 'email', 'role', 'unit_section']
        });
      }
      if (!assignedUser) {
        // Fallback to focal person for the section/unit
        assignedUser = await User.findOne({
          where: {
            role: 'focal-person',
            unit_section: finalSection || responsible_unit_name // Use section/unit if available
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
      where: { id: functionId || responsible_unit_id },
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


    let finalSection = inputSection;
    if (finalSection === 'Unit') {
      finalSection = sub_section;
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
      responsible_unit_id: responsible_unit_id || functionId,
      responsible_unit_name: responsible_unit_name || finalSection,
      section: finalSection || responsibleUnit?.section?.name || 'Unit',
      sub_section: sub_section || responsibleUnit?.name || '',
      subject: subject || '',
      description,
      status: initialStatus,
      userId: userId,
      assigned_to: assignedUser.id,
      employerId: ticketEmployerId,
    };
    if (shouldClose) {
      ticketData.resolution_details = resolution_details || 'Ticket resolved during creation';
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
    // --- SMS Notification ---
    // let smsRecipient = String(ticketPhoneNumber || '').replace(/^"+/, '').replace(/^0/, '255');
    // const isValidTzPhone = (num) => /^255\d{9}$/.test(num);
    // if ((requester === 'Employee' || requester === 'Representative') && isValidTzPhone(smsRecipient)) {
    //   const smsMessage = `Dear ${requesterFullName}, your ticket (ID: ${newTicket.ticket_id}) has been created.`;
    //   try {
    //     // await sendQuickSms({ message: smsMessage, recipient: smsRecipient });
    //     await sendQuickSms({ message: smsMessage, recipient: smsRecipient });
    //     console.log("SMS sent (test) to 255673554743");
    //   } catch (smsError) {
    //     console.error("Error sending SMS:", smsError.message);
    //     console.error("Error sending SMS:", smsError.message);
    //   }
    // }

    

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
        // console.error("Error sending email:", emailError.message);
        console.error("Error sending email:", 'rehema.said3@ttcl.co.tz');
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
          await sendEmail({ to: supervisor.email, subject: emailSubject, htmlBody: emailBody });
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
        where: { status: "Open" }, // Filter by status
        attributes: { exclude: ["userId"] },
        order: [["created_at", "DESC"]]
      });
    } else {
      // Agent: Fetch only OPEN tickets created by this agent
      tickets = await Ticket.findAll({
        where: { userId, status: "Open" }, // Filter by userId and status
        // attributes: { exclude: ["userId"] },
        order: [["created_at", "DESC"]]
      });
    }

    if (tickets.length === 0) {
      return res.status(404).json({ message: "No open tickets found." });
    }

    // Modify response to include created_by (user.name)
    const response = tickets.map((ticket) => ({
      ...ticket.toJSON(),
      created_by: user.name
    }));

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
    const { userId } = req.params; // Get userId from URL

    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    console.log("Fetching Assigned tickets for user ID:", userId);

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
        where: { status: "Assigned" }, // Filter by status
        attributes: { exclude: ["userId"] },
        order: [["created_at", "DESC"]]
      });
    } else {
      // Agent: Fetch only OPEN tickets created by this agent
      tickets = await Ticket.findAll({
        where: { userId, status: "Assigned" }, // Filter by userId and status
        // attributes: { exclude: ["userId"] },
        order: [["created_at", "DESC"]]
      });
    }

    if (tickets.length === 0) {
      return res.status(404).json({ message: "No assigned tickets found." });
    }

    // Modify response to include created_by (user.name)
    const response = tickets.map((ticket) => ({
      ...ticket.toJSON(),
      created_by: user.name
    }));

    res.status(200).json({
      message: "Assigned tickets fetched successfully",
      totalTickets: tickets.length,
      tickets: response
    });
  } catch (error) {
    console.error("Error fetching open tickets:", error);
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
        order: [["created_at", "DESC"]]
      });
    } else {
      // Agent: Fetch only OPEN tickets created by this agent
      tickets = await Ticket.findAll({
        where: { userId, status: "In Progress" }, // Filter by userId and status
        // attributes: { exclude: ["userId"] },
        order: [["created_at", "DESC"]]
      });
    }

    if (tickets.length === 0) {
      return res.status(404).json({ message: "No In progress tickets found." });
    }

    // Modify response to include created_by (user.name)
    const response = tickets.map((ticket) => ({
      ...ticket.toJSON(),
      created_by: user.name
    }));

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
        order: [["created_at", "DESC"]]
      });
    } else {
      // Agent: Fetch only carried forward tickets created by this agent
      tickets = await Ticket.findAll({
        where: { userId, status: "Carried Forward" }, // Filter by userId and status
        // attributes: { exclude: ["userId"] },
        order: [["created_at", "DESC"]]
      });
    }

    if (tickets.length === 0) {
      return res.status(404).json({ message: "No open tickets found." });
    }

    // Modify response to include created_by (user.name)
    const response = tickets.map((ticket) => ({
      ...ticket.toJSON(),
      created_by: user.name
    }));

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
        order: [["created_at", "DESC"]]
      });
    } else {
      // Agent: Fetch only Closed tickets created by this agent
      tickets = await Ticket.findAll({
        where: { userId, status: "Closed" }, // Filter by userId and status
        // attributes: { exclude: ["userId"] },
        order: [["created_at", "DESC"]]
      });
    }

    if (tickets.length === 0) {
      return res.status(404).json({ message: "No closed tickets found." });
    }

    // Modify response to include created_by (user.name)
    const response = tickets.map((ticket) => ({
      ...ticket.toJSON(),
      created_by: user.name
    }));

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
        order: [["created_at", "DESC"]],
      });
    }

    if (tickets.length === 0) {
      return res.status(404).json({ message: "No overdue tickets found." });
    }

    // Map tickets to include created_by
    const response = tickets.map((ticket) => ({
      ...ticket.toJSON(),
      created_by: user.name,
    }));

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
          }
        ],
        order: [["created_at", "DESC"]]
      });
    }

    if (tickets.length === 0) {
      return res.status(404).json({ message: "No tickets found for this user." });
    }

    const response = tickets.map((ticket) => ({
      ...ticket.toJSON(),
      created_by: user.name,
    }));

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
    const { phoneNumber } = req.params;

    if (!phoneNumber) {
      return res.status(400).json({ message: "Phone number is required" });
    }

    const tickets = await Ticket.findAll({
      where: {
        [Op.or]: [
          { phone_number: phoneNumber },
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
        {
          model: User,
          as: 'convertedBy',
          attributes: ['id', 'name', 'email']
        },
        {
          model: User,
          as: 'forwardedBy',
          attributes: ['id', 'name', 'email']
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

// Helper to notify all users with a given role
async function notifyUsersByRole(roles, subject, htmlBody, ticketId, senderId, message) {
  const users = await User.findAll({ where: { role: roles } });
  for (const user of users) {
    if (user.email) {
      await sendEmail({ to: 'rehema.said3@ttcl.co.tz', subject, htmlBody });
    }
    await Notification.create({
      ticket_id: ticketId,
      sender_id: senderId,
      recipient_id: user.id,
      message,
      status: 'unread'
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

    return res.status(200).json({
      message: "Ticket closed successfully",
      ticket
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

const getClaimsWithValidNumbers = async (req, res) => {
  try {
    const response = await axios.get("https://demomspapi.wcf.go.tz/api/v1/search/details");

    // Filter entries where claim_number is NOT null
    const filteredClaims = response.data.filter(item => item.firstname !== null);

    res.status(200).json({
      message: "Filtered claims fetched successfully",
      total: filteredClaims.length,
      data: filteredClaims,
    });

  } catch (error) {
    console.error("Error fetching claims:", error.message);
    res.status(500).json({ message: "Failed to fetch claims", error: error.message });
  }
};

module.exports = {
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
  getClaimsWithValidNumbers
};
