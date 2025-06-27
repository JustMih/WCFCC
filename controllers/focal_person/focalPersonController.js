const Ticket = require("../../models/Ticket");
const User = require("../../models/User");
const AssignedOfficer = require("../../models/AssignedOfficer");
const { Op, Sequelize } = require("sequelize");
const TicketAssignment = require("../../models/TicketAssignment");

const getFocalPersonTickets = async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findByPk(userId);
    const section = user.unit_section;
    const statusParam = req.query.status ? req.query.status.toLowerCase() : 'new';
    let where;
    if (statusParam === 'new') {
      where = {
        assigned_to_id: userId,
        status: 'Open',
      };
    } else {
      switch (statusParam) {
        case 'escalated':
          where = {
            assigned_to_id: userId,
            status: 'Open',
            is_escalated: true
          };
          break;
        case 'open':
          where = {
            assigned_to_id: userId,
            status: 'Open'
          };
          break;
        case 'closed':
          where = {
            assigned_to_id: userId,
            status: 'Closed'
          };
          break;
        default:
          where = {
            assigned_to_id: userId,
            [Op.or]: [
              { status: null },
              { status: 'Open' }
            ]
          };
      }
    }

    // Eager-load assignments and their assignee user info
    const inquiries = await Ticket.findAll({
      where,
      order: [['created_at', 'DESC']],
      include: [
        {
          model: TicketAssignment,
          as: 'assignments',
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
          as: 'creator',
          attributes: ['id', 'name', 'role']
        }
      ]
    });

    // Debug: Log the raw data to check if assignee is being populated
    console.log('DEBUG inquiries:', JSON.stringify(inquiries, null, 2));

    // Map over inquiries to include assignments with assigned_to_name and assigned_to_role
    const response = inquiries.map((ticket) => {
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
        created_by: t.creator?.name || t.created_by || null
      };
    });

    res.status(200).json({
      message: response.length ? "Tickets fetched successfully." : "No tickets found.",
      inquiries: response,
      count: response.length
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
    // Find all ticket IDs ever assigned to this focal person (for open and closed)
    const assignedTicketAssignments = await AssignedOfficer.findAll({
      where: { assigned_to_id: userId },
      attributes: ['ticket_id'],
      group: ['ticket_id']
    });
    const assignedTicketIds = assignedTicketAssignments.map(a => a.ticket_id);

    // Open inquiries: tickets ever assigned to this user and not closed
    const openInquiries = await Ticket.count({
      where: {
        id: { [Op.in]: assignedTicketIds },
        status: { [Op.ne]: 'Closed' }
      },
    });
    // Closed inquiries: tickets ever assigned to this user and status = 'Closed'
    const closedInquiries = await Ticket.count({
      where: {
        id: { [Op.in]: assignedTicketIds },
        status: 'Closed'
      }
    });
    res.status(200).json({
      success: true,
      newInquiries,
      escalatedInquiries,
      totalInquiries,
      resolvedInquiries: closedInquiries,
      openInquiries,
      closedInquiries,
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
