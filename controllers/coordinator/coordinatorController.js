// const { Ticket, User, Unit } = require('../../models'); // Adjust path if needed

const Ticket = require('../../models/Ticket');
const User = require('../../models/User');
const Unit = require('../../models/FunctionData');
const FunctionModel = require('../../models/Function');
const Section = require('../../models/Section');
const { Op, Sequelize } = require('sequelize');


const getAllCoordinatorComplaints = async (req, res) => {
  try {
    const complaints = await Ticket.findAll({
      where: {
        category: 'Complaint',
        [Op.and]: [
          {
            [Op.or]: [
              { converted_to: null },
              { converted_to: 'Complaint' }
            ]
          },
          {
            [Op.or]: [
              { status: null },
              { status: 'Open' }
            ]
          }
        ]
      },
      include: [
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'name']
        }
      ],
      order: [['created_at', 'DESC']]
    });

    if (!complaints.length) {
      return res.status(404).json({
        message: 'No coordinator-eligible complaints found.'
      });
    }

    res.status(200).json({
      message: 'Complaints routed to Coordinator fetched successfully.',
      complaints
    });
  } catch (error) {
    console.error('Error fetching Coordinator complaints:', error);
    res.status(500).json({
      message: 'Server error',
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
    return res.status(400).json({ message: "Invalid complaint type. Use 'Minor' or 'Major'." });
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
  const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
  return uuidRegex.test(uuid);
};
const convertOrForwardTicket = async (req, res) => {
  const { userId, category, responsible_unit_id } = req.body;
  const { id: ticketId } = req.params;

  try {
    // Validate userId (should be a valid UUID)
    if (!userId || !isValidUUID(userId)) {
      return res.status(400).json({ message: "Invalid userId: must be a valid UUID" });
    }

    // Find the ticket
    const ticket = await Ticket.findByPk(ticketId);
    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    // Handle category conversion
    if (category) {
      // Validate category (optional: ensure it's one of the allowed values)
      const validCategories = ['Complaint', 'Congrats', 'Suggestion', 'Compliment', 'Inquiry'];
      if (!validCategories.includes(category)) {
        return res.status(400).json({ message: "Invalid category: must be one of Complaint, Congrats, or Suggestion" });
      }
      ticket.category = category;
      ticket.converted_by_id = userId;
      ticket.converted_at = new Date();
    }

    // Handle forwarding to a unit
    if (responsible_unit_id) {
      // Validate responsible_unit_id (must be a valid UUID)
      if (!isValidUUID(responsible_unit_id)) {
        return res.status(400).json({ message: "Invalid responsible_unit_id: must be a valid UUID" });
      }

      // Check if the unit exists and get its name
      const unit = await FunctionModel.findByPk(responsible_unit_id);
      if (!unit) {
        return res.status(404).json({ message: "Unit not found for the given responsible_unit_id" });
      }

      ticket.responsible_unit_id = responsible_unit_id;
      ticket.forwarded_by_id = req.user.id;
      ticket.forwarded_at = new Date();
      ticket.assigned_to_role = 'Attendee'; // Set the role to Attendee when forwarding to a unit
    }

    // Save the updated ticket
    await ticket.save();

    // Get the updated ticket with unit information
    const updatedTicket = await Ticket.findByPk(ticketId, {
      include: [
        {
          model: FunctionModel,
          as: 'responsibleUnit',
          attributes: ['name']
        }
      ]
    });

    return res.status(200).json({
      message: `Ticket ${category ? `converted to ${category}` : ''}${category && responsible_unit_id ? ' and ' : ''}${responsible_unit_id ? 'forwarded to unit' : ''}`,
      data: updatedTicket,
    });
  } catch (error) {
    console.error("Convert/Forward Error:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getCoordinatorDashboardCounts = async (req, res) => {
  try {
    // New Tickets breakdown
    const complaintsCount = await Ticket.count({ 
      where: { 
        [Op.or]: [
          { category: 'Complaint' },
          { category: 'Congrats' },
          { category: 'Suggestion' },
          { category: 'Compliment' },
          { category: 'Inquiry' }
        ],
        status: { [Op.ne]: 'Closed' },
        [Op.and]: [
          {
            [Op.or]: [
              { converted_to: null },
              { converted_to: 'Complaint' }
            ]
          },
          {
            [Op.or]: [
              { status: null },
              { status: 'Open' }
            ]
          }
        ]
      } 
    });
    
    const newTicketsCount = await Ticket.count({ 
      where: { 
        [Op.or]: [
          { category: 'Complaint' },
          { category: 'Congrats' },
          { category: 'Suggestion' },
          { category: 'Compliment' },
          { category: 'Inquiry' }
        ],
        status: { [Op.ne]: 'Closed' },
        [Op.and]: [
          {
            [Op.or]: [
              { converted_to: null },
            ]
          },
          {
            [Op.or]: [
              { status: null },
              { status: 'Open' }
            ]
          }
        ]
      } 
    });
    
    const escalatedTicketsCount = await Ticket.count({ 
      where: { 
        status: 'Escalated',
        [Op.or]: [
          { category: 'Complaint' },
          { category: 'Congrats' },
          { category: 'Suggestion' },
          { category: 'Compliment' },
          { category: 'Inquiry' }
        ],
        [Op.or]: [
          { converted_to: null },
          { converted_to: 'Complaint' }
        ]
      } 
    });

    // Converted Tickets breakdown
    const inquiriesCount = await Ticket.count({ 
      where: { 
        category: 'Inquiry',
        status: { [Op.ne]: 'Closed' }
      } 
    });
    
    const convertedComplaintsCount = await Ticket.count({ 
      where: { 
        category: 'Complaint',
        converted_to: { [Op.ne]: null },
        status: { [Op.ne]: 'Closed' }
      } 
    });
    
    const suggestionsCount = await Ticket.count({ 
      where: { 
        category: 'Suggestion',
        status: { [Op.ne]: 'Closed' }
      } 
    });
    
    const complementsCount = await Ticket.count({ 
      where: { 
        category: 'Compliment',
        status: { [Op.ne]: 'Closed' }
      } 
    });

    // Channeled Tickets breakdown
    const directorateCount = await Ticket.count({ 
      where: { 
        assigned_to_role: 'Directorate',
        [Op.or]: [
          { category: 'Complaint' },
          { category: 'Congrats' },
          { category: 'Suggestion' },
          { category: 'Compliment' },
          { category: 'Inquiry' }
        ],
        status: { [Op.ne]: 'Closed' }
      } 
    });
    
    const unitsCount = await Ticket.count({ 
      where: { 
        assigned_to_role: 'Unit',
        [Op.or]: [
          { category: 'Complaint' },
          { category: 'Congrats' },
          { category: 'Suggestion' },
          { category: 'Compliment' },
          { category: 'Inquiry' }
        ],
        status: { [Op.ne]: 'Closed' }
      } 
    });

    // Ticket Status breakdown
    const openCount = await Ticket.count({ 
      where: { 
        [Op.or]: [
          { status: null },
          { status: 'Open' }
        ],
        [Op.or]: [
          { category: 'Complaint' },
          { category: 'Congrats' },
          { category: 'Suggestion' },
          { category: 'Compliment' },
          { category: 'Inquiry' }
        ]
      } 
    });
    
    const onProgressCount = await Ticket.count({ 
      where: { 
        status: 'In Progress',
        [Op.or]: [
          { category: 'Complaint' },
          { category: 'Congrats' },
          { category: 'Suggestion' },
          { category: 'Compliment' },
          { category: 'Inquiry' }
        ]
      } 
    });
    
    const closedCount = await Ticket.count({ 
      where: { 
        status: 'Closed',
        [Op.or]: [
          { category: 'Complaint' },
          { category: 'Congrats' },
          { category: 'Suggestion' },
          { category: 'Compliment' },
          { category: 'Inquiry' }
        ]
      } 
    });
    
    const minorCount = await Ticket.count({ 
      where: { 
        complaint_type: 'Minor',
        [Op.or]: [
          { category: 'Complaint' },
          { category: 'Congrats' },
          { category: 'Suggestion' },
          { category: 'Compliment' },
          { category: 'Inquiry' }
        ]
      } 
    });
    
    const majorCount = await Ticket.count({ 
      where: { 
        complaint_type: 'Major',
        [Op.or]: [
          { category: 'Complaint' },
          { category: 'Congrats' },
          { category: 'Suggestion' },
          { category: 'Compliment' },
          { category: 'Inquiry' }
        ]
      } 
    });

    res.status(200).json({
      message: "Dashboard counts retrieved successfully",
      data: {
        newTickets: {
          Complaints: complaintsCount,
          "New Tickets": newTicketsCount,
          "Escalated Tickets": escalatedTicketsCount
        },
        convertedTickets: {
          Inquiries: inquiriesCount,
          Complaints: convertedComplaintsCount,
          Suggestions: suggestionsCount,
          Complements: complementsCount
        },
        channeledTickets: {
          Directorate: directorateCount,
          Units: unitsCount
        },
        ticketStatus: {
          Open: openCount,
          "On Progress": onProgressCount,
          Closed: closedCount,
          Minor: minorCount,
          Major: majorCount
        }
      }
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getTicketsByCategoryAndType = async (req, res) => {
  try {
    const { category, type, userId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const offset = (page - 1) * limit;
    const search = req.query.search || '';

    let whereClause = {};
    let includeClause = [
      {
        model: User,
        as: 'creator',
        attributes: ['id', 'name', 'phone']
      }
    ];

    // Build where clause based on category and type
    switch (category) {
      case 'new':
        switch (type) {
          case 'complaints':
            whereClause = { category: 'Complaint' };
            break;
          case 'tickets':
            whereClause = { status: 'Open' };
            break;
          case 'escalated':
            whereClause = { status: 'Escalated' };
            break;
        }
        break;

      case 'converted':
        switch (type) {
          case 'inquiries':
            whereClause = { converted_to: 'Inquiry' };
            break;
          case 'complaints':
            whereClause = { converted_to: 'Complaint' };
            break;
          case 'suggestions':
            whereClause = { converted_to: 'Suggestion' };
            break;
          case 'complements':
            whereClause = { converted_to: 'Compliment' };
            break;
        }
        break;

      case 'channeled':
        switch (type) {
          case 'directorate':
            whereClause = { assigned_to_role: 'Directorate' };
            break;
          case 'units':
            whereClause = { assigned_to_role: 'Unit' };
            break;
        }
        break;

      case 'status':
        switch (type) {
          case 'open':
            whereClause = { status: 'Open' };
            break;
          case 'progress':
            whereClause = { status: 'In Progress' };
            break;
          case 'closed':
            whereClause = { status: 'Closed' };
            break;
          case 'minor':
            whereClause = { complaint_type: 'Minor' };
            break;
          case 'major':
            whereClause = { complaint_type: 'Major' };
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
      order: [['created_at', 'DESC']],
      limit,
      offset
    });

    res.status(200).json({
      message: 'Tickets fetched successfully',
      tickets,
      totalPages: Math.ceil(totalCount / limit),
      currentPage: page,
      totalCount
    });
  } catch (error) {
    console.error('Error fetching tickets:', error);
    res.status(500).json({
      message: 'Server error',
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
//     const tenDaysAgo = new Date();
//     tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
//     whereClause = {
//       status: 'Open',
//       created_at: { [Op.lt]: tenDaysAgo }
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
    const { tickets, user } = await getTicketsByStatus(userId, 'Open');

    if (tickets.length === 0) {
      return res.status(404).json({ message: 'No open tickets found' });
    }

    const response = tickets.map(ticket => ({
      ...ticket.toJSON(),
      created_by: user.name
    }));

    res.status(200).json({
      message: 'Open tickets fetched successfully',
      totalTickets: tickets.length,
      tickets: response
    });
  } catch (error) {
    console.error('Error fetching open tickets:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const getAssignedTickets = async (req, res) => {
  try {
    const { userId } = req.params;
    const { tickets, user } = await getTicketsByStatus(userId, 'Assigned');

    if (tickets.length === 0) {
      return res.status(404).json({ message: 'No assigned tickets found' });
    }

    const response = tickets.map(ticket => ({
      ...ticket.toJSON(),
      created_by: user.name
    }));

    res.status(200).json({
      message: 'Assigned tickets fetched successfully',
      totalTickets: tickets.length,
      tickets: response
    });
  } catch (error) {
    console.error('Error fetching assigned tickets:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const getInprogressTickets = async (req, res) => {
  try {
    const { userId } = req.params;
    const { tickets, user } = await getTicketsByStatus(userId, 'In Progress');

    if (tickets.length === 0) {
      return res.status(404).json({ message: 'No in-progress tickets found' });
    }

    const response = tickets.map(ticket => ({
      ...ticket.toJSON(),
      created_by: user.name
    }));

    res.status(200).json({
      message: 'In-progress tickets fetched successfully',
      totalTickets: tickets.length,
      tickets: response
    });
  } catch (error) {
    console.error('Error fetching in-progress tickets:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const getCarriedForwardTickets = async (req, res) => {
  try {
    const { userId } = req.params;
    const { tickets, user } = await getTicketsByStatus(userId, 'Carried Forward');

    if (tickets.length === 0) {
      return res.status(404).json({ message: 'No carried forward tickets found' });
    }

    const response = tickets.map(ticket => ({
      ...ticket.toJSON(),
      created_by: user.name
    }));

    res.status(200).json({
      message: 'Carried forward tickets fetched successfully',
      totalTickets: tickets.length,
      tickets: response
    });
  } catch (error) {
    console.error('Error fetching carried forward tickets:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const getClosedTickets = async (req, res) => {
  try {
    const { userId } = req.params;
    const { tickets, user } = await getTicketsByStatus(userId, 'Closed');

    if (tickets.length === 0) {
      return res.status(404).json({ message: 'No closed tickets found' });
    }

    const response = tickets.map(ticket => ({
      ...ticket.toJSON(),
      created_by: user.name
    }));

    res.status(200).json({
      message: 'Closed tickets fetched successfully',
      totalTickets: tickets.length,
      tickets: response
    });
  } catch (error) {
    console.error('Error fetching closed tickets:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const getOverdueTickets = async (req, res) => {
  try {
    const { userId } = req.params;
    const { tickets, user } = await getTicketsByStatus(userId, 'Open', true);

    if (tickets.length === 0) {
      return res.status(404).json({ message: 'No overdue tickets found' });
    }

    const response = tickets.map(ticket => ({
      ...ticket.toJSON(),
      created_by: user.name
    }));

    res.status(200).json({
      message: 'Overdue tickets fetched successfully',
      totalTickets: tickets.length,
      tickets: response
    });
  } catch (error) {
    console.error('Error fetching overdue tickets:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const getTicketsByStatus = async (req, res) => {
  try {
    const { status } = req.query;
    let whereClause = {
      [Op.or]: [
        { category: 'Complaint' },
        { category: 'Congrats' },
        { category: 'Suggestion' },
        { category: 'Compliment' },
        { category: 'Inquiry' }
      ]
    };

    // Map status/category/channel/severity as needed
    switch (status) {
      case 'complaints':
        whereClause.category = 'Complaint';
        break;
      case 'new':
        whereClause[Op.and] = [
          {
            [Op.or]: [
              { status: null },
              { status: 'Open' }
            ]
          },
          {
            [Op.or]: [
              { converted_to: null }
            ]
          }
        ];
        break;
      case 'escalated':
        whereClause.status = 'Escalated';
        break;
      case 'inquiries':
        whereClause.category = 'Inquiry';
        whereClause.status = { [Op.ne]: 'Closed' };
        break;
      case 'suggestions':
        whereClause.category = 'Suggestion';
        whereClause.status = { [Op.ne]: 'Closed' };
        break;
      case 'complements':
        whereClause.category = 'Compliment';
        whereClause.status = { [Op.ne]: 'Closed' };
        break;
      case 'directorate':
        whereClause.assigned_to_role = 'Directorate';
        whereClause.status = { [Op.ne]: 'Closed' };
        break;
      case 'units':
        whereClause.assigned_to_role = 'Unit';
        whereClause.status = { [Op.ne]: 'Closed' };
        break;
      case 'open':
        whereClause[Op.or] = [
          { status: null },
          { status: 'Open' }
        ];
        break;
      case 'on-progress':
        whereClause.status = 'In Progress';
        break;
      case 'closed':
        whereClause.status = 'Closed';
        break;
      case 'minor':
        whereClause.complaint_type = 'Minor';
        break;
      case 'major':
        whereClause.complaint_type = 'Major';
        break;
      default:
        whereClause.status = status;
    }

    // Remove the include for now to avoid association errors
    const tickets = await Ticket.findAll({
      where: whereClause,
      order: [['created_at', 'DESC']]
    });

    res.json({ tickets });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
};


module.exports = {
  getAllCoordinatorComplaints,
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
}