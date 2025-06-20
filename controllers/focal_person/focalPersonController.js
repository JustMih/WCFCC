const Ticket = require("../../models/Ticket");
const User = require("../../models/User");
const AssignedOfficer = require("../../models/AssignedOfficer");
const { Op, Sequelize } = require("sequelize");

const getFocalPersonTickets = async (req, res) => {
  try {
    const userId = req.user.userId; // or get from req.params if needed
    const user = await User.findByPk(userId);
    const inquiries = await Ticket.findAll({
      where: {
        section: user.unit_section,
        [Op.or]: [
          { category: "Inquiry" },
          { converted_to: "Inquiry" }
        ],
        [Op.and]: [
          {
            [Op.or]: [
              { status: 'Open' },
              { status: null },
            ]
          }
        ]
      },
      order: [['created_at', 'DESC']]
    });

    res.status(200).json({
      message: inquiries.length ? "Inquiry tickets fetched successfully." : "No tickets found.",
      inquiries
    });
  } catch (error) {
    console.error("Error fetching Focal person tickets Inquiry:", error);
    res.status(500).json({
      message: "Server error",
      error: error.message
    });
  }
};

const getFocalPersonDashboardCounts = async (req, res) => {
  try {
    // Get new inquiries (status is null or Open)
    const newInquiries = await Ticket.count({
      where: {
        [Op.or]: [
          { category: "Inquiry" },
          { converted_to: "Inquiry" }
        ],
        [Op.and]: [
          {
            [Op.or]: [
              { status: null },
              { status: 'Open' }
            ]
          }
        ]
      }
    });

    // Get escalated inquiries
    const escalatedInquiries = await Ticket.count({
      where: {
        [Op.or]: [
          { category: "Inquiry" },
          { converted_to: "Inquiry" }
        ],
        // is_escalated: true
      }
    });

    // Get total inquiries
    const totalInquiries = await Ticket.count({
      where: {
        [Op.or]: [
          { category: "Inquiry" },
          { converted_to: "Inquiry" }
        ]
      }
    });

    // Get resolved (closed) inquiries
    const resolvedInquiries = await Ticket.count({
      where: {
        [Op.or]: [
          { category: "Inquiry" },
          { converted_to: "Inquiry" }
        ],
        status: 'Closed'
      }
    });

    // Get open inquiries
    const openInquiries = await Ticket.count({
      where: {
        [Op.or]: [
          { category: "Inquiry" },
          { converted_to: "Inquiry" }
        ],
        status: 'Open'
      }
    });

    // Get closed inquiries (same as resolved)
    const closedInquiries = resolvedInquiries;

    // Get in progress inquiries
    const inProgressInquiries = await Ticket.count({
      where: {
        [Op.or]: [
          { category: "Inquiry" },
          { converted_to: "Inquiry" }
        ],
        status: 'In Progress'
      }
    });

    res.status(200).json({
      success: true,
      newInquiries,
      escalatedInquiries,
      totalInquiries,
      resolvedInquiries,
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
      assigned_officer_id: newAssignedOfficer.id
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
