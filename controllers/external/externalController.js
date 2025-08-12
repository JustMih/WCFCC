const { Ticket, User, TicketAssignment } = require("../../models");

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
              as: "assignedTo",
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
          assigned_to: ticket.assignments[0].assignedTo ? {
            id: ticket.assignments[0].assignedTo.id,
            name: ticket.assignments[0].assignedTo.name,
            role: ticket.assignments[0].assignedTo.role
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
  getTicketStatusExternal
}; 