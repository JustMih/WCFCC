// const { Ticket, User, Unit } = require('../../models'); // Adjust path if needed

const Ticket = require('../../models/Ticket');
const User = require('../../models/User');
const Unit = require('../../models/FunctionData');
const FunctionModel = require('../../models/Function');
const Section = require('../../models/Section');
const { Op, Sequelize } = require('sequelize');

const sequelize = require('sequelize');

const getAllCoordinatorComplaints = async (req, res) => {
  try {
    const complaints = await Ticket.findAll({
      where: {
        category: 'Complaint',
        // assigned_to_role: 'Coordinator',
        status: 'Open'

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

    if (complaints.length === 0) {
      return res.status(404).json({ message: 'No complaints assigned to Coordinator' });
    }

    res.status(200).json({
      message: 'Complaints assigned to Coordinator fetched successfully',
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
      const validCategories = ['Complaint', 'Congrats', 'Suggestion'];
      if (!validCategories.includes(category)) {
        return res.status(400).json({ message: "Invalid category: must be one of Complaint, Congrats, or Suggestion" });
      }
      ticket.converted_to = category;
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
    const complaintsCount = await Ticket.count({ where: { category: 'Complaint' } });
    const newTicketsCount = await Ticket.count({ where: { status: 'Open' } });
    const escalatedTicketsCount = await Ticket.count({ where: { status: 'Escalated' } });

    // Converted Tickets breakdown
    const inquiriesCount = await Ticket.count({ where: { converted_to: 'Inquiry' } });
    const convertedComplaintsCount = await Ticket.count({ where: { converted_to: 'Complaint' } });
    const suggestionsCount = await Ticket.count({ where: { converted_to: 'Suggestion' } });
    const complementsCount = await Ticket.count({ where: { converted_to: 'Compliment' } });

    // Channeled Tickets breakdown
    const directorateCount = await Ticket.count({ where: { assigned_to_role: 'Directorate' } });
    const unitsCount = await Ticket.count({ where: { assigned_to_role: 'Unit' } });

    // Ticket Status breakdown
    const openCount = await Ticket.count({ where: { status: 'Open' } });
    const onProgressCount = await Ticket.count({ where: { status: 'In Progress' } });
    const closedCount = await Ticket.count({ where: { status: 'Closed' } });
    const minorCount = await Ticket.count({ where: { complaint_type: 'Minor' } });
    const majorCount = await Ticket.count({ where: { complaint_type: 'Major' } });

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

module.exports = {
  getAllCoordinatorComplaints,
  rateTickets,
  convertOrForwardTicket,
  getCoordinatorDashboardCounts
}