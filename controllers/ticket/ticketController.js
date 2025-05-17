const Ticket = require('../../models/Ticket');
const User = require('../../models/User');
const FunctionData = require('../../models/FunctionData');
const Function = require('../../models/Function');
const Section = require('../../models/Section');


const bcrypt = require("bcryptjs");
const { validationResult } = require("express-validator");
const { Op } = require("sequelize");

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
      functionId,
      description,
      status,
      subject
    } = req.body;

    const ticketId = generateTicketId();
    const userId = req.user.userId;
    
    if (!userId) {
      return res.status(400).json({ message: "User ID is required to create a ticket." });
    }

    // Validate required fields
    if (!subject) {
      return res.status(400).json({ message: "Subject is required." });
    }

    const newTicket = await Ticket.create({
      ticket_id: ticketId,
      first_name: firstName,
      middle_name: middleName || '',
      last_name: lastName,
      phone_number: phoneNumber,
      nida_number: nidaNumber,
      requester,
      institution,
      channel,
      region,
      district,
      category,
      function_id: functionId,
      description,
      subject,
      status: status || 'Open',
      created_by: userId,
    });

    return res.status(201).json({
      message: "Ticket created successfully",
      ticket: newTicket
    });

  } catch (error) {
    console.error("Ticket creation error:", error.stack);
    return res.status(500).json({ message: "Internal server error", error: error.message });
  }
};




// const createTicket = async (req, res) => {
//   try {
//     console.log("Request Body:", req.body);

//     let {
//       firstName,
//       middleName,
//       lastName,
//       phoneNumber,
//       employer,
//       title,
//       description,
//       priority,
//       status,
//       category, // New field: Complaint, Inquiry, etc.
//       nida_number,
//       subject,
//       region,
//       district
//     } = req.body;

//     const userId = req.user.userId;

//     // Validate input
//     const errors = validationResult(req);
//     if (!errors.isEmpty()) {
//       return res.status(400).json({ errors: errors.array() });
//     }

//     // Basic field checks
//     const required = [];
//     if (!firstName) required.push("firstName");
//     if (!lastName) required.push("lastName");
//     if (!phoneNumber) required.push("phoneNumber");
//     if (!employer) required.push("imployer");
//     if (!section) required.push("section");
//     if (!category) required.push("category");
//     if (!subject) required.push("subject");
//     if (!description) required.push("description");
//     if (!category) required.push("category");

//     if (required.length) {
//       return res.status(400).json({
//         message: "Missing required fields",
//         missingFields: required
//       });
//     }

//     // Defaults
//     status = status || "Open";
//     ticket_id

//     const validPriorities = ["Low", "Medium", "High", "Urgent"];
//     const validStatuses = ["Open", "In Progress", "Carried Forward", "Closed", "Assigned"];

//     if (!validPriorities.includes(priority)) {
//       return res.status(400).json({
//         message: "Invalid priority value",
//         allowedValues: validPriorities
//       });
//     }

//     if (!validStatuses.includes(status)) {
//       return res.status(400).json({
//         message: "Invalid status value",
//         allowedValues: validStatuses
//       });
//     }

//     // Create base ticket
//     const ticket = await Ticket.create({
//       firstName,
//       middleName,
//       lastName,
//       phone_number: phoneNumber,
//       nida_number,
//       institution,
//       title,
//       description,
//       priority,
//       status: "Open",
//       category,
//       subject,
//       region,
//       district,
//       userId,
//       created_at: new Date(),
//       updated_at: new Date()
//     });

//     // === Auto-assignment logic === //
//     if (category === "Inquiry") {
//       // 1. Try finding officer assigned to this user
//       const officer = await AssignedOfficer.findOne({
//         where: {
//           [Op.or]: [
//             { nida_number },
//             { phone_number: phoneNumber }
//           ]
//         }
//       });

//       if (officer) {
//         ticket.assigned_to_id = officer.assigned_to_id;
//         ticket.status = "Assigned";
//       } else {
//         const focal = await User.findOne({ where: { role: "focal-person" } });
//         if (focal) {
//           ticket.assigned_to_id = focal.id;
//           ticket.status = "Assigned";
//         }
//       }
//       await ticket.save();
//     }

//     if (category === "Complaint") {
//       const coordinator = await User.findOne({ where: { role: "coordinator" } });
//       if (coordinator) {
//         ticket.assigned_to_id = coordinator.id;
//         ticket.status = "Assigned";
//         await ticket.save();
//       }
//     }

//     return res.status(201).json({
//       message: "Ticket created successfully",
//       ticket
//     });
//   } catch (error) {
//     console.error("Error creating ticket:", error);
//     return res.status(500).json({ message: "Server error", error: error.message });
//   }
// };


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

// const getAllCustomersTickets = async (req, res) => {
//   try {
//     const tickets = await Ticket.findAll({
//       order: [["created_at", "DESC"]],
//       include: [
//         {
//           model: User,
//           as: "creator",
//           attributes: ["id", "name"],
//         },
//       ],
//     });

//     return res.status(200).json({
//       message: "Tickets fetched successfully",
//       totalTickets: tickets.length,
//       tickets,
//     });
//   } catch (error) {
//     console.error("Error fetching tickets:", error.stack);
//     return res.status(500).json({ message: "Server error", error: error.message });
//   }
// };

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
      ],
      attributes: [
        'id', 'ticket_id', 'first_name', 'middle_name', 'last_name',
        'phone_number', 'nida_number', 'requester', 'institution',
        'region', 'district', 'subject', 'category', 'sub_section',
        'section', 'channel', 'description', 'complaint_type',
        'converted_to', 'status', 'request_registered_date',
        'date_of_resolution', 'date_of_feedback', 'date_of_review_resolution',
        'resolution_details', 'aging_days', 'responsible_unit_name',
        'converted_at', 'forwarded_at', 'assigned_to_role',
        'created_at', 'updated_at', 'created_by', 'assigned_to_id',
        'attended_by_id', 'rated_by_id', 'converted_by_id', 'forwarded_by_id',
        'responsible_unit_id'
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
  searchByPhoneNumber
};
