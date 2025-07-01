// const { Ticket, User, Unit } = require('../../models'); // Adjust path if needed

const Ticket = require("../../models/Ticket");
const User = require("../../models/User");
const Unit = require("../../models/FunctionData");
const FunctionModel = require("../../models/Function");
const Section = require("../../models/Section");
const { Op, Sequelize } = require("sequelize");
const TicketAssignment = require("../../models/TicketAssignment");


const getAllCoordinatorTickets = async (req, res) => {
  try {
    const complaints = await Ticket.findAll({
      where: {
        category: {
          [Op.in]: ["Complaint", "Suggestion", "Compliment"]
        },
        [Op.and]: [
          {
            [Op.or]: [
              { status: null },
              { status: 'Open' },
              { status: 'Returned' }
            ]
          },
          // { converted_to: null },
          // { responsible_unit_name: null }
        ]
      },
      include: [
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'name', 'username', 'email']
        }
      ]
    });

    if (!complaints.length) {
      return res.status(404).json({
        message: "No coordinator-eligible complaints found."
      });
    }

    res.status(200).json({
      message: "Complaints routed to Coordinator fetched successfully.",
      complaints
    });
  } catch (error) {
    console.error("Error fetching Coordinator complaints:", error);
    res.status(500).json({
      message: "Server error",
      error: error.message
    });
  }
};


const rateTickets = async (req, res) => {
  const { userId } = req.body;
  const ticketId = req.params.id;
  const { complaintType } = req.body;
  if (!userId) {
    return res.status(400).json({ message: "User ID is required" });
  }

  if (!["Minor", "Major"].includes(complaintType)) {
    return res
      .status(400)
      .json({ message: "Invalid complaint type. Use 'Minor' or 'Major'." });
  }

  try {
    const ticket = await Ticket.findByPk(ticketId);

    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    ticket.complaint_type = complaintType;
    ticket.rated_by_id = userId; // ✅ From token
    ticket.rated_at = new Date();

    await ticket.save();

    return res.status(200).json({
      message: `Ticket rated as ${complaintType}`,
      data: ticket
    });
  } catch (error) {
    console.error("Rating Error:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

// const convertOrForwardTicket = async (req, res) => {
//   const { userId } = req.body;
//   const { id: ticketId } = req.params;
//   const { category, responsible_unit_id } = req.body;

//   try {
//     const ticket = await Ticket.findByPk(ticketId);

//     if (!ticket) {
//       return res.status(404).json({ message: "Ticket not found" });
//     }

//     // If converting to another category
//     if (category) {
//       ticket.converted_to = category;
//       ticket.converted_by_id = userId;
//       ticket.converted_at = new Date();
//     }

//     // If forwarding to a unit
//     if (responsible_unit_id) {
//       ticket.responsible_unit_id = responsible_unit_id;
//       ticket.forwarded_by_id = req.user.id;
//       ticket.forwarded_at = new Date();
//     }

//     await ticket.save();

//     res.status(200).json({
//       message: `Ticket ${category ? `converted to ${category}` : ''}${category && responsible_unit_id ? ' and ' : ''}${responsible_unit_id ? `forwarded to unit` : ''}`,
//       data: ticket
//     });
//   } catch (error) {
//     console.error("Convert/Forward Error:", error);
//     res.status(500).json({ message: "Server error" });
//   }
// };

// UUID validation regex (matches UUID v1-v5)
const isValidUUID = (uuid) => {
  const uuidRegex =
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
  return uuidRegex.test(uuid);
};

const convertOrForwardTicket = async (req, res) => {
  const { userId, category, responsible_unit_name, complaintType } = req.body;
  const { id: ticketId } = req.params;

  // Start a transaction
  const transaction = await Ticket.sequelize.transaction();

  try {
    const userId = req.user.userId;

    // Find the ticket
    const ticket = await Ticket.findByPk(ticketId, { transaction });
    if (!ticket) {
      await transaction.rollback();
      return res.status(404).json({ message: "Ticket not found" });
    }

    // Check if any action parameters are provided
    if (!category && !responsible_unit_name && !complaintType) {
      await transaction.rollback();
      return res.status(400).json({
        message: "Please provide a rating (complaintType) and select a unit to forward to. Category conversion is optional."
      });
    }

    // Check if required parameters are provided
    if (!complaintType) {
      await transaction.rollback();
      return res.status(400).json({
        message: "Rating is required. Please provide complaintType (Minor or Major)."
      });
    }

    if (!responsible_unit_name) {
      await transaction.rollback();
      return res.status(400).json({
        message: "Forwarding is required. Please select a unit to forward the ticket to."
      });
    }

    let conversionDone = false;
    let forwardingDone = false;
    let ratingDone = false;

    // Handle rating (if provided)
    if (complaintType) {
      if (!["Minor", "Major"].includes(complaintType)) {
        await transaction.rollback();
        return res.status(400).json({ 
          message: "Invalid complaint type. Use 'Minor' or 'Major'." 
        });
      }

      ticket.complaint_type = complaintType;
      ticket.rated_by_id = userId;
      ticket.rated_at = new Date();
      ratingDone = true;
    }

    // Handle category conversion
    if (category) {
      const validCategories = ["Inquiry"];
      if (!validCategories.includes(category)) {
        await transaction.rollback();
        return res
          .status(400)
          .json({
            message:
              "Invalid category: must be one of " + validCategories.join(", ")
          });
      }

      ticket.converted_to = category;
      ticket.converted_by_id = userId;
      ticket.converted_at = new Date();
      conversionDone = true;
    }

    // Handle forwarding to a unit
    if (responsible_unit_name) {
      // Check if ticket is already forwarded in this session
      if (forwardingDone) {
        await transaction.rollback();
        return res.status(400).json({
          message: "Ticket is already being forwarded in this request. Cannot forward multiple times."
        });
      }

      // Check if ticket was already forwarded previously
      if (ticket.forwarded_at && ticket.responsible_unit_name) {
        await transaction.rollback();
        return res.status(400).json({
          message: `Ticket is already forwarded to '${ticket.responsible_unit_name}' on ${new Date(ticket.forwarded_at).toLocaleDateString()}. Cannot forward again.`
        });
      }

      // Validate that ticket is rated before forwarding
      if (!ticket.complaint_type && !ratingDone) {
        await transaction.rollback();
        return res.status(400).json({
          message: "Ticket must be rated (Minor or Major) before it can be forwarded"
        });
      }

      const unit = await Section.findOne({
        where: { name: responsible_unit_name },
        transaction
      });

      if (!unit) {
        await transaction.rollback();
        return res
          .status(404)
          .json({ message: `Unit '${responsible_unit_name}' not found` });
      }

      // Find the head of the unit (head-of-unit role)
      const unitHead = await User.findOne({
        where: {
          unit_section: responsible_unit_name,
          role: "head-of-unit"
        },
        transaction
      });

      if (!unitHead) {
        await transaction.rollback();
        return res
          .status(404)
          .json({ message: `No head-of-unit found for unit '${responsible_unit_name}'` });
      }

      ticket.responsible_unit_id = unit.id;
      ticket.responsible_unit_name = unit.name;
      ticket.forwarded_by_id = userId;
      ticket.forwarded_at = new Date();
      ticket.assigned_to_role = unitHead.role;
      ticket.assigned_to_id = unitHead.id;
      ticket.assigned_to = unitHead.id;
      ticket.status = "Assigned";
      forwardingDone = true;

      // Create ticket assignment record
      await TicketAssignment.create({
        ticket_id: ticket.id,
        assigned_by_id: userId,
        assigned_to_id: unitHead.id,
        assigned_to_role: unitHead.role,
        action: "Forwarded",
        reason: `Ticket forwarded to ${responsible_unit_name} by coordinator`,
        created_at: new Date()
      }, { transaction });
    }

    // Save the ticket
    await ticket.save({ transaction });

    // Commit the transaction
    await transaction.commit();

    // Reload updated ticket
    const updatedTicket = await Ticket.findByPk(ticketId, {
      include: [
        {
          model: FunctionModel,
          as: "responsibleUnit",
          attributes: ["name"]
        }
      ]
    });

    // Build dynamic message
    const messageParts = [];
    if (ratingDone) messageParts.push(`rated as '${complaintType}'`);
    if (conversionDone) messageParts.push(`converted to '${category}'`);
    if (forwardingDone) messageParts.push(`forwarded to '${responsible_unit_name}'`);
    const message = `Ticket successfully ${messageParts.join(" and ")}`;

    return res.status(200).json({
      message,
      data: updatedTicket
    });
  } catch (error) {
    // Rollback transaction on error
    await transaction.rollback();
    console.error("Convert/Forward Error:", error);
    return res
      .status(500)
      .json({ message: "Server error", error: error.message });
  }
};

const getCoordinatorDashboardCounts = async (req, res) => {
  try {
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    const baseNewTicketConditions = [
      { responsible_unit_name: null },
      { complaint_type: { [Op.is]: null } },
      { [Op.or]: [{ status: null }, { status: "Open" }, { status: "Returned" }] },
      { converted_to: null },
      { created_at: { [Op.gte]: threeDaysAgo } }
    ];

    const complaintsCount = await Ticket.count({
      where: {
        category: "Complaint",
        [Op.and]: [
          { [Op.or]: [{ status: null }, { status: "Open" }, { status: "Returned" }] }
        ]
      }
    });

    const suggestionsCount = await Ticket.count({
      where: {
        category: "Suggestion",
        [Op.and]: [
          { [Op.or]: [{ status: null }, { status: "Open" }, { status: "Returned" }] }
        ]
      }
    });

    const complementsCount = await Ticket.count({
      where: {
        category: "Compliment",
        [Op.and]: [
          { [Op.or]: [{ status: null }, { status: "Open" }, { status: "Returned" }] }
        ]
      }
    });

    // New Tickets: last 10 days
    const newTicketsCount = await Ticket.count({
      where: {
        category: { [Op.in]: ["Complaint", "Suggestion", "Compliment"] },
        [Op.and]: [
          { [Op.or]: [{ status: null }, { status: "Open" }, { status: "Returned" }] },
          // { converted_to: { [Op.is]: null } },
          // { responsible_unit_name: { [Op.is]: null } },
          // { complaint_type: { [Op.is]: null } },
          // { created_at: { [Op.gte]: threeDaysAgo } }
        ]
      }
    });

    // Escalated Tickets: older than 10 days
    const escalatedTicketsCount = await Ticket.count({
      where: {
        category: { [Op.in]: ["Complaint", "Suggestion", "Compliment"] },
        [Op.and]: [
          { [Op.or]: [{ status: null }, { status: "Open" }, { status: "Returned" }] },
          { converted_to: null },
          { responsible_unit_name: null },
          { complaint_type: { [Op.is]: null } },
          { created_at: { [Op.lt]: threeDaysAgo } }
        ]
      }
    });

    // All New Tickets (no date filter)
    const allNewTicketsTotal = await Ticket.count({
      where: {
        category: { [Op.in]: ["Complaint", "Suggestion", "Compliment"] },
        // [Op.and]: [
        //   { [Op.or]: [{ status: null }, { status: "Open" }] }
        // ]
      }
    });

    // Channeled Tickets Breakdown
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

    // Ticket Status Breakdown
    // const openCount = await Ticket.count({
    //   where: {
    //     category: { [Op.in]: ['Complaint', 'Suggestion', 'Compliment'] },
    //     [Op.or]: [
    //       { status: null },
    //       { status: 'Open' }
    //     ]
    //   }
    // });

    const onProgressCount = await Ticket.count({
      where: {
        category: { [Op.in]: ["Complaint", "Suggestion", "Compliment"] },
        status: { [Op.ne]: ["Closed"] },
        responsible_unit_name: { [Op.ne]: null },
        complaint_type: { [Op.ne]: null }
      }
    });

    const closedCount = await Ticket.count({
      where: {
        category: { [Op.in]: ["Complaint", "Suggestion", "Compliment"] },
        status: "Closed"
      }
    });

    const minorCount = await Ticket.count({
      where: {
        complaint_type: "Minor",
        category: { [Op.in]: ["Complaint", "Suggestion", "Compliment"] }
      }
    });

    const majorCount = await Ticket.count({
      where: {
        complaint_type: "Major",
        category: { [Op.in]: ["Complaint", "Suggestion", "Compliment"] }
      }
    });

    const ticketStatus = {
      "On Progress": onProgressCount,
      Closed: closedCount,
      Minor: minorCount,
      Major: majorCount
      // add other statuses if needed
    };

    const ticketStatusTotal = Object.values(ticketStatus).reduce((a, b) => 0 + b, 0);

    res.status(200).json({
      message: "Dashboard counts retrieved successfully",
      ticketStats: {
        newTickets: {
          "Total": allNewTicketsTotal,
          "New Tickets": newTicketsCount,
          "Escalated Tickets": escalatedTicketsCount
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
        ticketStatus,
        ticketStatusTotal
      }
    });
  } catch (error) {
    console.error("Dashboard Error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getTicketsByCategoryAndType = async (req, res) => {
  try {
    const { category, type, userId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const offset = (page - 1) * limit;
    const search = req.query.search || "";

    let whereClause = {};
    let includeClause = [
      {
        model: User,
        as: "creator",
        attributes: ["id", "name", "username", "email"]
      }
    ];

    // Build where clause based on category and type
    switch (category) {
      case "new":
        switch (type) {
          case "complaints":
            whereClause = {
              category: { [Op.in]: ["Complaint", "Suggestion", "Compliment"] },
              [Op.and]: [
                { [Op.or]: [{ status: null }, { status: "Open" }, { status: "Returned" }] },
                // { converted_to: { [Op.is]: null } },
                // { responsible_unit_name: { [Op.is]: null } },
                // { complaint_type: { [Op.is]: null } },
                // { created_at: { [Op.gte]: threeDaysAgo } }
              ]
            };
            break;
          case "escalated":
            whereClause = {  created_at: { [Op.gte]: threeDaysAgo } ,
            category: { [Op.in]: ["Complaint", "Suggestion", "Compliment"] }, };
            break;
        }
        break;

      case "converted":
        switch (type) {
          case "inquiries":
            whereClause = { converted_to: "Inquiry" };
            break;
          case "complaints":
            whereClause = { converted_to: "Complaint" };
            break;
          case "suggestions":
            whereClause = { converted_to: "Suggestion" };
            break;
          case "complements":
            whereClause = { converted_to: "Compliment" };
            break;
        }
        break;

      case "channeled":
        switch (type) {
          case "directorate":
            whereClause = { assigned_to_role: "Directorate" };
            break;
          case "units":
            whereClause = { assigned_to_role: "Unit" };
            break;
        }
        break;

      case "status":
        switch (type) {
          case "open":
            whereClause = { status: "Open" };
            break;
          case "progress":
            whereClause = { status: "In Progress" };
            break;
          case "closed":
            whereClause = { status: "Closed" };
            break;
          case "minor":
            whereClause = { complaint_type: "Minor" };
            break;
          case "major":
            whereClause = { complaint_type: "Major" };
            break;
        }
        break;
    }

    // Add search condition if search term is provided
    if (search) {
      whereClause = {
        ...whereClause,
        [Op.or]: [
          { ticket_id: { [Op.like]: `%${search}%` } },
          { name: { [Op.like]: `%${search}%` } },
          { phone: { [Op.like]: `%${search}%` } }
        ]
      };
    }

    // Get total count for pagination
    const totalCount = await Ticket.count({
      where: whereClause,
      include: includeClause
    });

    // Get paginated tickets
    const tickets = await Ticket.findAll({
      where: whereClause,
      include: includeClause,
      order: [["created_at", "DESC"]],
      limit,
      offset
    });

    res.status(200).json({
      message: "Tickets fetched successfully",
      tickets,
      totalPages: Math.ceil(totalCount / limit),
      currentPage: page,
      totalCount
    });
  } catch (error) {
    console.error("Error fetching tickets:", error);
    res.status(500).json({
      message: "Server error",
      error: error.message
    });
  }
};

// // Helper function to get tickets with common logic
// const getTicketsByStatus = async (userId, status, isOverdue = false) => {
//   const user = await User.findOne({
//     where: { id: userId },
//     attributes: ['id', 'name', 'role']
//   });

//   if (!user) {
//     throw new Error('User not found');
//   }

//   let whereClause = {};

//   if (isOverdue) {
//     const threeDaysAgo = new Date();
//     threeDaysAgo.setDate(threeDaysAgo.getDate() - 10);
//     whereClause = {
//       status: 'Open',
//       created_at: { [Op.lt]: threeDaysAgo }
//     };
//   } else {
//     whereClause = { status };
//   }

//   if (user.role !== 'super-admin') {
//     whereClause.assigned_to = userId;
//   }

//   const tickets = await Ticket.findAll({
//     where: whereClause,
//     include: [
//       {
//         model: User,
//         as: 'creator',
//         attributes: ['id', 'name', 'phone']
//       }
//     ],
//     order: [['created_at', 'DESC']]
//   });

//   return {
//     tickets,
//     user
//   };
// };

const getOpenTickets = async (req, res) => {
  try {
    const { userId } = req.params;
    const { tickets, user } = await getTicketsByStatus(userId, "Open");

    if (tickets.length === 0) {
      return res.status(404).json({ message: "No open tickets found" });
    }

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
    const { userId } = req.params;
    const { tickets, user } = await getTicketsByStatus(userId, "Assigned");

    if (tickets.length === 0) {
      return res.status(404).json({ message: "No assigned tickets found" });
    }

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
    console.error("Error fetching assigned tickets:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getInprogressTickets = async (req, res) => {
  try {
    const { userId } = req.params;
    const { tickets, user } = await getTicketsByStatus(userId, "In Progress");

    if (tickets.length === 0) {
      return res.status(404).json({ message: "No in-progress tickets found" });
    }

    const response = tickets.map((ticket) => ({
      ...ticket.toJSON(),
      created_by: user.name
    }));

    res.status(200).json({
      message: "In-progress tickets fetched successfully",
      totalTickets: tickets.length,
      tickets: response
    });
  } catch (error) {
    console.error("Error fetching in-progress tickets:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getCarriedForwardTickets = async (req, res) => {
  try {
    const { userId } = req.params;
    const { tickets, user } = await getTicketsByStatus(
      userId,
      "Carried Forward"
    );

    if (tickets.length === 0) {
      return res
        .status(404)
        .json({ message: "No carried forward tickets found" });
    }

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
    console.error("Error fetching carried forward tickets:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getClosedTickets = async (req, res) => {
  try {
    const { userId } = req.params;
    const { tickets, user } = await getTicketsByStatus(userId, "Closed");

    if (tickets.length === 0) {
      return res.status(404).json({ message: "No closed tickets found" });
    }

    const response = tickets.map((ticket) => ({
      ...ticket.toJSON(),
      created_by: user.name
    }));

    res.status(200).json({
      message: "Closed tickets fetched successfully",
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
    const { tickets, user } = await getTicketsByStatus(userId, "Open", true);

    if (tickets.length === 0) {
      return res.status(404).json({ message: "No overdue tickets found" });
    }

    const response = tickets.map((ticket) => ({
      ...ticket.toJSON(),
      created_by: user.name
    }));

    res.status(200).json({
      message: "Overdue tickets fetched successfully",
      totalTickets: tickets.length,
      tickets: response
    });
  } catch (error) {
    console.error("Error fetching overdue tickets:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};


const getTicketsByStatus = async (req, res) => {
  try {
    const { status } = req.query;

    let whereClause = {
      [Op.or]: [
        { category: "Complaint" },
        { category: "Suggestion" },
        { category: "Compliment" }
      ]
    };

    switch (status) {
      case "new":
        whereClause.category = {
          [Op.in]: ["Complaint", "Suggestion", "Compliment"]
        };
        whereClause[Op.and] = [
          { [Op.or]: [{ status: null }, { status: "Open" }, { status: "Returned" }] }
        ];
        break;
      case "escalated":
        whereClause.category = {
          [Op.in]: ["Complaint", "Suggestion", "Compliment"]
        };
        whereClause[Op.and] = [
          { [Op.or]: [{ status: null }, { status: "Open" }, { status: "Returned" }] },
          { converted_to: { [Op.is]: null } },
          { responsible_unit_name: { [Op.is]: null } },
          { complaint_type: { [Op.is]: null } },
          {
            created_at: {
              [Op.lt]: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) // > 10 days
            }
          }
        ];
        break;
      case "complaints":
        whereClause.category = { [Op.in]: ["Complaint"] };
        whereClause[Op.and] = [
          { [Op.or]: [{ status: null }, { status: "Open" }, { status: "Returned" }] }
        ];
        break;
      case "suggestions":
        whereClause.category = { [Op.in]: ["Suggestion"] };
        whereClause[Op.and] = [
          { [Op.or]: [{ status: null }, { status: "Open" }, { status: "Returned" }] }
        ];
        break;
      case "complements":
        whereClause.category = { [Op.in]: ["Compliment"] };
        whereClause[Op.and] = [
          { [Op.or]: [{ status: null }, { status: "Open" }, { status: "Returned" }] }
        ];
        break;
      case "directorate":
        whereClause.category = {
          [Op.in]: ["Complaint", "Suggestion", "Compliment"]
        };
        whereClause[Op.and] = [
          { [Op.or]: [{ status: null }, { status: "Open" }, { status: "Returned" }] },
          { responsible_unit_name:  { [Op.like]: "%Directorate%" } },
          
        ];
        break;
        case "units":
        whereClause.category = {
          [Op.in]: ["Complaint", "Suggestion", "Compliment"]
        };
        whereClause[Op.and] = [
          { [Op.or]: [{ status: null }, { status: "Open" }, { status: "Returned" }] },
          { responsible_unit_name: { [Op.like]: "%unit%" } },
        ];
        break;
      case "open":
        whereClause.category = {
          [Op.in]: ["Complaint", "Suggestion", "Compliment"]
        };
        whereClause[Op.and] = [
          { [Op.or]: [{ status: null }, { status: "Open" }, { status: "Returned" }] },
          { responsible_unit_name: { [Op.not]: null } }
        ];
        break;
      case "on-progress":
        whereClause.category = {
          [Op.in]: ["Complaint", "Suggestion", "Compliment"]
        };
        whereClause[Op.and] = [
          { status: "In Progress" },
          { responsible_unit_name: { [Op.not]: null } }
        ];
        break;
      case "closed":
        whereClause.category = {
          [Op.in]: ["Complaint", "Suggestion", "Compliment"]
        };
        whereClause.status = "Closed";
        break;
      case "minor":
        whereClause.category = {
          [Op.in]: ["Complaint", "Suggestion", "Compliment"]
        };
        whereClause[Op.and] = [
          { complaint_type: "Minor" },
          { status: { [Op.ne]: "Closed" } }
        ];
        break;
      case "major":
        whereClause.category = {
          [Op.in]: ["Complaint", "Suggestion", "Compliment"]
        };
        whereClause[Op.and] = [
          { complaint_type: "Major" },
          { status: { [Op.ne]: "Closed" } }
        ];
        break;
      case "major":
        whereClause.category = {
          [Op.in]: ["Complaint", "Suggestion", "Compliment"]
        };
        whereClause[Op.and] = [
          { complaint_type: "Major" },
          { status: { [Op.ne]: "Closed" } }
        ];
        break;
      default:
        whereClause.status = status;
        whereClause[Op.and] = [{ status: { [Op.ne]: "Closed" } }];
        break;
    }

    const tickets = await Ticket.findAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'name', 'username', 'email']
        }
      ],
      order: [["created_at", "DESC"]]
    });

    res.json({ tickets });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};

// Rate and complete registration of complaints
const rateAndRegisterComplaint = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { rating, registrationNotes } = req.body;
    const coordinatorId = req.user.userId;

    const ticket = await Ticket.findOne({
      where: {
        id: ticketId,
        category: "Complaint"
      }
    });

    if (!ticket) {
      return res.status(404).json({ message: "Complaint not found" });
    }

    // Update ticket with rating and registration details
    await ticket.update({
      complaint_rating: rating,
      registration_notes: registrationNotes,
      registered_by: coordinatorId,
      registration_date: new Date(),
      status: "Registered"
    });

    res.status(200).json({
      message: "Complaint rated and registered successfully",
      ticket
    });
  } catch (error) {
    console.error("Error rating and registering complaint:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Convert complaint to inquiry
const convertToInquiry = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { conversionReason } = req.body;
    const coordinatorId = req.user.userId;

    const ticket = await Ticket.findOne({
      where: {
        id: ticketId,
        category: "Complaint"
      }
    });

    if (!ticket) {
      return res.status(404).json({ message: "Complaint not found" });
    }

    // Update ticket to inquiry
    await ticket.update({
      category: "Inquiry",
      converted_to: "Inquiry",
      conversion_reason: conversionReason,
      converted_by: coordinatorId,
      conversion_date: new Date(),
      status: "Open"
    });

    res.status(200).json({
      message: "Complaint converted to inquiry successfully",
      ticket
    });
  } catch (error) {
    console.error("Error converting complaint to inquiry:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Channel complaint to appropriate unit
const channelComplaint = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { unitId, channelingNotes } = req.body;
    const coordinatorId = req.user.userId;

    const ticket = await Ticket.findOne({
      where: {
        id: ticketId,
        category: "Complaint"
      }
    });

    if (!ticket) {
      return res.status(404).json({ message: "Complaint not found" });
    }

    // Get the supervisor of the unit
    const supervisor = await User.findOne({
      where: {
        role: "supervisor",
        unit_id: unitId
      }
    });

    if (!supervisor) {
      return res
        .status(404)
        .json({ message: "No supervisor found for the selected unit" });
    }

    // Update ticket with channeling details
    await ticket.update({
      assigned_to: supervisor.id,
      channeled_to_unit: unitId,
      channeling_notes: channelingNotes,
      channeled_by: coordinatorId,
      channeling_date: new Date(),
      status: "Assigned"
    });

    res.status(200).json({
      message: "Complaint channeled successfully",
      ticket
    });
  } catch (error) {
    console.error("Error channeling complaint:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Coordinator closes a ticket
const closeCoordinatorTicket = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { resolution_details } = req.body;
    const coordinatorId = req.user.userId;

    const ticket = await Ticket.findOne({
      where: { id: ticketId }
    });

    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    await ticket.update({
      status: 'Closed',
      resolution_details: resolution_details || 'Ticket closed by coordinator',
      date_of_resolution: new Date(),
      attended_by_id: coordinatorId
    });

    // Record in Ticket_assignments
    await TicketAssignment.create({
      ticket_id: ticket.id,
      assigned_by_id: coordinatorId,
      assigned_to_id: coordinatorId,
      assigned_to_role: 'coordinator',
      action: 'Closed',
      reason: resolution_details || 'Ticket closed by coordinator',
      created_at: new Date()
    });
    console.error("Closing ticket details");
    res.status(200).json({
      message: "Ticket closed successfully by coordinator",
      ticket
    });
  } catch (error) {
    console.error("Error closing ticket by coordinator:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

module.exports = {
  getAllCoordinatorTickets,
  rateAndRegisterComplaint,
  convertToInquiry,
  channelComplaint,
  rateTickets,
  convertOrForwardTicket,
  getCoordinatorDashboardCounts,
  getTicketsByCategoryAndType,
  getOpenTickets,
  getAssignedTickets,
  getInprogressTickets,
  getCarriedForwardTickets,
  getClosedTickets,
  getOverdueTickets,
  getTicketsByStatus,
  closeCoordinatorTicket
};
