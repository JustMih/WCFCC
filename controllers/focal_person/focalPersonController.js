const Ticket = require("../../models/Ticket");
const User = require("../../models/User");
const AssignedOfficer = require("../../models/AssignedOfficer");
const { Op, Sequelize } = require("sequelize");

const getFocalPersonTickets = async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findByPk(userId);
    const section = user.unit_section;
    const statusParam = req.query.status ? req.query.status.toLowerCase() : 'new';
    let where = {
      section,
      [Op.or]: [
        { category: "Inquiry" },
        { converted_to: "Inquiry" }
      ]
    };

    switch (statusParam) {
      case 'new':
        where = {
          ...where,
          [Op.or]: [
            { status: null },
            { status: 'Open' },
          ]
        };
        break;
      case 'escalated':
        where = {
          ...where,
          is_escalated: true
        };
        break;
      case 'open':
        where = {
          ...where,
          // status: 'Open',
          status:'Assigned'
        };
        break;
      // case 'in-progress':
      //   where = {
      //     ...where,
      //     status: 'In Progress'
      //   };
      //   break;
      case 'closed':
        where = {
          ...where,
          status: 'Closed'
        };
        break;
      default:
        // fallback to new
        where = {
          ...where,
          [Op.or]: [
            { status: null },
            { status: 'Open' }
          ]
        };
    }

    const inquiries = await Ticket.findAll({
      where,
      order: [['created_at', 'DESC']]
    });

    res.status(200).json({
      message: inquiries.length ? "Tickets fetched successfully." : "No tickets found.",
      inquiries,
      count: inquiries.length
    });
  } catch (error) {
    console.error("Error fetching Focal person tickets:", error);
    res.status(500).json({
      message: "Server error",
      error: error.message
    });
  }
};

const getFocalPersonDashboardCounts = async (req, res) => {
  try {
    const userId = req.user.userId;
    // Only count tickets assigned to this focal person and not closed
    const ticketWhere = {
      assigned_to_id: userId,
      status: { [Op.ne]: 'Closed' }
    };

    // New inquiries (Open or null)
    const newInquiries = await Ticket.count({
      where: {
        ...ticketWhere,
        [Op.or]: [
          { status: null },
          { status: 'Open' }
        ]
      }
    });
    // Escalated inquiries (customize as needed, e.g., is_escalated: true)
    const escalatedInquiries = await Ticket.count({
      where: {
        ...ticketWhere,
        is_escalated: true
      }
    });
    // Total inquiries (not closed)
    const totalInquiries = await Ticket.count({ where: ticketWhere });
    // In progress
    const inProgressInquiries = await Ticket.count({
      where: {
        ...ticketWhere,
        status: 'In Progress'
      }
    });
    // Open inquiries
    const openInquiries = await Ticket.count({
      where: {
        ...ticketWhere,
        status: 'Open'
      }
    });
    // Resolved/closed inquiries (status: Closed, for reference)
    const resolvedInquiries = await Ticket.count({
      where: {
        assigned_to_id: userId,
        status: 'Closed'
      }
    });
    res.status(200).json({
      success: true,
      newInquiries,
      escalatedInquiries,
      totalInquiries,
      resolvedInquiries,
      openInquiries,
      closedInquiries: resolvedInquiries,
      inProgressInquiries
    });
  } catch (error) {
    console.error("Error fetching dashboard counts:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch dashboard counts",
      error: error.message
    });
  }
};

const assignTicket = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { 
      first_name,
      middle_name,
      last_name,
      nida_number,
      phone_number,
      employer_id,
      assigned_to_id,
      notes
    } = req.body;

    const ticket = await Ticket.findByPk(ticketId);
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    // Verify it's a Claims Inquiry ticket
    if ((ticket.category !== "Inquiry" && ticket.converted_to !== "Inquiry")) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to assign this ticket type'
      });
    }

    // Create assigned officer record
    const assignedOfficer = await AssignedOfficer.create({
      first_name,
      middle_name,
      last_name,
      nida_number,
      phone_number,
      employer_id,
      assigned_to_id,
      notes,
      status: 'Active',
      assigned_at: new Date(),
      reassignment_history: []
    });

    // Update ticket status
    await ticket.update({
      status: 'Assigned',
      assigned_officer_id: assignedOfficer.id
    });

    res.json({
      success: true,
      message: 'Ticket assigned successfully',
      ticket,
      assignedOfficer
    });
  } catch (error) {
    console.error('Error in assignTicket:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to assign ticket',
      error: error.message
    });
  }
};

const reassignTicket = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { 
      first_name,
      middle_name,
      last_name,
      nida_number,
      phone_number,
      employer_id,
      assigned_to_id,
      assigned_to_role,
      notes,
      reassignment_reason
    } = req.body;

    const ticket = await Ticket.findByPk(ticketId, {
      include: [{
        model: AssignedOfficer,
        as: 'assignedOfficer'
      }]
    });

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    // Verify it's a Claims Inquiry ticket
    if ((ticket.category !== "Inquiry" && ticket.converted_to !== "Inquiry")) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to reassign this ticket type'
      });
    }

    // Update current assigned officer status
    if (ticket.assignedOfficer) {
      await ticket.assignedOfficer.update({
        status: 'Reassigned',
        reassignment_history: [
          ...(ticket.assignedOfficer.reassignment_history || []),
          {
            reason: reassignment_reason,
            reassigned_at: new Date(),
            reassigned_by: req.user.id,
            new_officer: {
              first_name,
              last_name,
              employer_id
            }
          }
        ]
      });
    }

    // Create new assigned officer record
    const newAssignedOfficer = await AssignedOfficer.create({
      first_name,
      middle_name,
      last_name,
      nida_number,
      phone_number,
      employer_id,
      assigned_to_id,
      assigned_to_role,
      notes,
      status: 'Active',
      assigned_at: new Date(),
      reassignment_history: [{
        previous_officer: ticket.assignedOfficer ? {
          id: ticket.assignedOfficer.id,
          first_name: ticket.assignedOfficer.first_name,
          last_name: ticket.assignedOfficer.last_name,
          employer_id: ticket.assignedOfficer.employer_id
        } : null,
        reason: reassignment_reason,
        reassigned_at: new Date(),
        reassigned_by: req.user.id
      }]
    });

    // Update ticket
    await ticket.update({
      status: 'Reassigned',
      assigned_officer_id: newAssignedOfficer.id,
      assigned_to_role
    });

    res.json({
      success: true,
      message: 'Ticket reassigned successfully',
      ticket,
      previousOfficer: ticket.assignedOfficer,
      newAssignedOfficer
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

const completeAssignment = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { completion_notes } = req.body;

    const ticket = await Ticket.findByPk(ticketId, {
      include: [{
        model: AssignedOfficer,
        as: 'assignedOfficer'
      }]
    });

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    if (!ticket.assignedOfficer) {
      return res.status(400).json({
        success: false,
        message: 'No assigned officer found for this ticket'
      });
    }

    // Update assigned officer status
    await ticket.assignedOfficer.update({
      status: 'Completed',
      completed_at: new Date(),
      notes: completion_notes
    });

    // Update ticket status
    await ticket.update({
      status: 'Closed'
    });

    res.json({
      success: true,
      message: 'Assignment completed successfully',
      ticket,
      assignedOfficer: ticket.assignedOfficer
    });
  } catch (error) {
    console.error('Error in completeAssignment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to complete assignment',
      error: error.message
    });
  }
};

module.exports = {
  getFocalPersonTickets,
  getFocalPersonDashboardCounts,
  assignTicket,
  reassignTicket,
  completeAssignment
};
