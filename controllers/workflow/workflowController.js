const Ticket = require('../../models/Ticket');
const User = require('../../models/User');
const TicketAssignment = require('../../models/TicketAssignment');
const { Op } = require('sequelize');
const { 
  assignToNextInWorkflow, 
  getWorkflowStatus,
  WORKFLOW_PATHS 
} = require('../../services/workflowService');

/**
 * Head of Unit / Supervisor Actions
 */

// Assign ticket to attendee
const assignToAttendee = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { attendeeId, justification } = req.body;
    const supervisorId = req.user.userId;

    const ticket = await Ticket.findByPk(ticketId);
    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    const supervisor = await User.findByPk(supervisorId);
    if (supervisor.role !== 'supervisor' && supervisor.role !== 'head-of-unit') {
      return res.status(403).json({ message: "Only supervisors or head of unit can assign to attendees" });
    }

    const attendee = await User.findByPk(attendeeId);
    if (!attendee || attendee.role !== 'attendee') {
      return res.status(400).json({ message: "Invalid attendee selected" });
    }

    // Update ticket assignment
    await ticket.update({
      assigned_to_id: attendeeId,
      assigned_to_role: 'attendee',
      status: 'Assigned'
    });

    // Create assignment record
    await TicketAssignment.create({
      ticket_id: ticketId,
      assigned_by_id: supervisorId,
      assigned_to_id: attendeeId,
      assigned_to_role: 'attendee',
      action: 'Assigned to Attendee',
      reason: justification || 'Assigned by Head of Unit',
      created_at: new Date()
    });

    res.status(200).json({
      success: true,
      message: "Ticket assigned to attendee successfully",
      data: {
        ticket,
        assignedTo: attendee,
        assignmentDetails: {
          assignedBy: supervisor.name,
          assignedTo: attendee.name,
          reason: justification || 'Assigned by Head of Unit'
        }
      }
    });
  } catch (error) {
    console.error("Error assigning to attendee:", error);
    res.status(500).json({ 
      success: false,
      message: "Server error", 
      error: error.message 
    });
  }
};

// Head of Unit attends and closes (for minor complaints)
const attendAndClose = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { resolution_details, evidence_url } = req.body;
    const supervisorId = req.user.userId;

    const ticket = await Ticket.findByPk(ticketId);
    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    if (ticket.complaint_type !== 'Minor') {
      return res.status(400).json({ message: "Only minor complaints can be closed by Head of Unit" });
    }

    // Update ticket
    await ticket.update({
      status: 'Closed',
      resolution_details,
      evidence_url,
      date_of_resolution: new Date(),
      attended_by_id: supervisorId
    });

    // Create assignment record
    await TicketAssignment.create({
      ticket_id: ticketId,
      assigned_by_id: supervisorId,
      assigned_to_id: supervisorId,
      assigned_to_role: 'supervisor',
      action: 'Attended and Closed',
      reason: resolution_details,
      created_at: new Date()
    });

    res.status(200).json({
      success: true,
      message: "Ticket attended and closed successfully",
      data: {
        ticket,
        closedBy: supervisor.name,
        resolutionDetails: resolution_details
      }
    });
  } catch (error) {
    console.error("Error attending and closing:", error);
    res.status(500).json({ 
      success: false,
      message: "Server error", 
      error: error.message 
    });
  }
};

/**
 * Attendee Actions
 */

// Attendee attends and recommends
const attendAndRecommend = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { recommendation, evidence_url } = req.body;
    const attendeeId = req.user.userId;

    const ticket = await Ticket.findByPk(ticketId);
    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    // Update ticket with attendee's recommendation
    await ticket.update({
      resolution_details: recommendation,
      evidence_url,
      date_of_resolution: new Date(),
      attended_by_id: attendeeId
    });

    // Create assignment record for attendee
    await TicketAssignment.create({
      ticket_id: ticketId,
      assigned_by_id: attendeeId,
      assigned_to_id: attendeeId,
      assigned_to_role: 'attendee',
      action: 'Attended and Recommended',
      reason: recommendation,
      created_at: new Date()
    });

    // Find Head of Unit for the ticket's section/unit
    const section = ticket.section || ticket.unit_section;
    let headOfUnit = await User.findOne({
      where: {
        role: 'head-of-unit',
        unit_section: section
      }
    });
    let assignedRole = 'head-of-unit';
    let assignedUser = headOfUnit;
    if (!headOfUnit) {
      // Fallback: assign to coordinator
      const coordinator = await User.findOne({ where: { role: 'coordinator' } });
      if (!coordinator) {
        return res.status(404).json({ message: "No Head of Unit or Coordinator found for assignment" });
      }
      assignedRole = 'coordinator';
      assignedUser = coordinator;
    }

    // Assign ticket to Head of Unit or Coordinator
    await ticket.update({
      assigned_to_id: assignedUser.id,
      assigned_to_role: assignedRole,
      status: 'Assigned'
    });

    // Create assignment record for Head of Unit or Coordinator
    await TicketAssignment.create({
      ticket_id: ticketId,
      assigned_by_id: attendeeId,
      assigned_to_id: assignedUser.id,
      assigned_to_role: assignedRole,
      action: 'Assigned',
      reason: `Ticket recommended by attendee and assigned to ${assignedRole.replace('-', ' ')}`,
      created_at: new Date()
    });

    res.status(200).json({
      success: true,
      message: "Recommendation submitted and ticket assigned to Head of Unit",
      data: {
        ticket,
        recommendation: recommendation,
        assignedTo: assignedUser,
        assignedRole: assignedRole
      }
    });
  } catch (error) {
    console.error("Error attending and recommending:", error);
    res.status(500).json({ 
      success: false,
      message: "Server error", 
      error: error.message 
    });
  }
};

// Upload evidence
const uploadEvidence = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { evidence_url, notes } = req.body;
    const userId = req.user.userId;

    const ticket = await Ticket.findByPk(ticketId);
    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    // Update ticket with evidence
    await ticket.update({
      evidence_url,
      review_notes: notes
    });

    // Create assignment record
    await TicketAssignment.create({
      ticket_id: ticketId,
      assigned_by_id: userId,
      assigned_to_id: userId,
      assigned_to_role: ticket.assigned_to_role,
      action: 'Evidence Uploaded',
      reason: notes || 'Evidence uploaded',
      created_at: new Date()
    });

    res.status(200).json({
      success: true,
      message: "Evidence uploaded successfully",
      data: {
        ticket,
        uploadedBy: userId,
        evidenceUrl: evidence_url,
        notes: notes
      }
    });
  } catch (error) {
    console.error("Error uploading evidence:", error);
    res.status(500).json({ 
      success: false,
      message: "Server error", 
      error: error.message 
    });
  }
};

/**
 * Director General Actions
 */

// DG approves and closes
const approveAndClose = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { approval_notes } = req.body;
    const dgId = req.user.userId;

    const ticket = await Ticket.findByPk(ticketId);
    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    if (ticket.complaint_type !== 'Major') {
      return res.status(400).json({ message: "Only major complaints require DG approval" });
    }

    // Update ticket
    await ticket.update({
      status: 'Closed',
      approval_notes,
      date_of_resolution: new Date(),
      attended_by_id: dgId
    });

    // Create assignment record
    await TicketAssignment.create({
      ticket_id: ticketId,
      assigned_by_id: dgId,
      assigned_to_id: dgId,
      assigned_to_role: 'director-general',
      action: 'Approved and Closed',
      reason: approval_notes,
      created_at: new Date()
    });

    res.status(200).json({
      message: "Ticket approved and closed successfully",
      data: ticket
    });
  } catch (error) {
    console.error("Error approving and closing:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// DG approves and forwards to coordinator
const approveAndForward = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { approval_notes } = req.body;
    const dgId = req.user.userId;

    const ticket = await Ticket.findByPk(ticketId);
    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    // Find coordinator
    const coordinator = await User.findOne({ where: { role: 'coordinator' } });
    if (!coordinator) {
      return res.status(404).json({ message: "Coordinator not found" });
    }

    // Update ticket to assign to coordinator
    await ticket.update({
      assigned_to_id: coordinator.id,
      assigned_to_role: 'coordinator',
      status: 'Assigned',
      dg_notes: approval_notes
    });

    // Create assignment record for DG approval
    await TicketAssignment.create({
      ticket_id: ticketId,
      assigned_by_id: dgId,
      assigned_to_id: dgId,
      assigned_to_role: 'director-general',
      action: 'Approved and Forwarded',
      reason: approval_notes,
      created_at: new Date()
    });

    // Create assignment record for coordinator
    await TicketAssignment.create({
      ticket_id: ticketId,
      assigned_by_id: dgId,
      assigned_to_id: coordinator.id,
      assigned_to_role: 'coordinator',
      action: 'Assigned',
      reason: `Forwarded by Director General: ${approval_notes}`,
      created_at: new Date()
    });

    res.status(200).json({
      success: true,
      message: "Ticket approved and forwarded to coordinator successfully",
      data: {
        ticket,
        forwardedTo: coordinator,
        dgNotes: approval_notes
      }
    });
  } catch (error) {
    console.error("Error approving and forwarding:", error);
    res.status(500).json({ 
      success: false,
      message: "Server error", 
      error: error.message 
    });
  }
};

/**
 * Reverse Actions (for all roles)
 */

// Reverse ticket to previous step
const reverseTicket = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { reversal_reason } = req.body;
    const userId = req.user.userId;

    const ticket = await Ticket.findByPk(ticketId);
    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    const workflowStatus = await getWorkflowStatus(ticketId);
    const currentStepIndex = workflowStatus.currentStep - 1;
    
    if (currentStepIndex <= 0) {
      return res.status(400).json({ message: "Cannot reverse further" });
    }

    const workflow = WORKFLOW_PATHS[workflowStatus.workflowPath];
    const previousRole = workflow.roles[currentStepIndex - 1];

    // Find previous assignee
    const previousAssignment = await TicketAssignment.findOne({
      where: {
        ticket_id: ticketId,
        assigned_to_role: previousRole
      },
      order: [['created_at', 'DESC']]
    });

    if (!previousAssignment) {
      return res.status(400).json({ message: "No previous assignment found" });
    }

    // Update ticket
    await ticket.update({
      assigned_to_id: previousAssignment.assigned_to_id,
      assigned_to_role: previousRole,
      status: 'Assigned'
    });

    // Create assignment record
    await TicketAssignment.create({
      ticket_id: ticketId,
      assigned_by_id: userId,
      assigned_to_id: previousAssignment.assigned_to_id,
      assigned_to_role: previousRole,
      action: 'Reversed',
      reason: reversal_reason || 'Ticket reversed',
      created_at: new Date()
    });

    res.status(200).json({
      success: true,
      message: "Ticket reversed successfully",
      data: {
        ticket,
        previousRole,
        previousAssignee: previousAssignment.assigned_to_id,
        reversedBy: userId,
        reversalReason: reversal_reason || 'Ticket reversed'
      }
    });
  } catch (error) {
    console.error("Error reversing ticket:", error);
    res.status(500).json({ 
      success: false,
      message: "Server error", 
      error: error.message 
    });
  }
};

/**
 * Review Actions
 */

// Review and recommend (for Head of Unit/Manager)
const reviewAndRecommend = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { review_notes, recommendation } = req.body;
    const userId = req.user.userId;

    const ticket = await Ticket.findByPk(ticketId);
    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found" });
    }

    // Update ticket
    await ticket.update({
      review_notes,
      resolution_details: recommendation,
      status: 'Pending Approval'
    });

    // Create assignment record
    await TicketAssignment.create({
      ticket_id: ticketId,
      assigned_by_id: userId,
      assigned_to_id: userId,
      assigned_to_role: ticket.assigned_to_role,
      action: 'Reviewed and Recommended',
      reason: review_notes,
      created_at: new Date()
    });

    res.status(200).json({
      success: true,
      message: "Review completed successfully",
      data: {
        ticket,
        reviewedBy: userId,
        reviewNotes: review_notes,
        recommendation: recommendation
      }
    });
  } catch (error) {
    console.error("Error reviewing:", error);
    res.status(500).json({ 
      success: false,
      message: "Server error", 
      error: error.message 
    });
  }
};

module.exports = {
  // Head of Unit actions
  assignToAttendee,
  attendAndClose,
  
  // Attendee actions
  attendAndRecommend,
  uploadEvidence,
  
  // DG actions
  approveAndClose,
  approveAndForward,
  
  // General actions
  reverseTicket,
  reviewAndRecommend
}; 