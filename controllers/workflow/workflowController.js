const { Ticket, User, TicketAssignment, Section, Notification } = require('../../models');
const { Op } = require('sequelize');
const { deactivateUserUpdates } = require('../ticket/ticketUpdateController');

// Helper function for safe transaction rollback
const safeRollback = async (transaction) => {
  try {
    if (transaction && !transaction.finished) {
      await transaction.rollback();
    }
  } catch (rollbackError) {
    console.error('Rollback error:', rollbackError);
  }
};

// Get workflow details for a ticket
const getWorkflowDetails = async (req, res) => {
  try {
    const { ticketId } = req.params;
    
    const ticket = await Ticket.findByPk(ticketId, {
      include: [
        {
          model: User,
          as: 'assignee',
          attributes: ['id', 'first_name', 'last_name', 'role', 'unit_section']
        },
        {
          model: User,
          as: 'ratedBy',
          attributes: ['id', 'first_name', 'last_name']
        },
        {
          model: User,
          as: 'forwardedBy',
          attributes: ['id', 'first_name', 'last_name']
        }
      ]
    });

    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    if (!ticket.workflow_path) {
      return res.status(400).json({ message: 'This ticket is not assigned to a workflow' });
    }

    const workflowInfo = getWorkflowInfo(ticket.workflow_path, ticket.current_workflow_step);
    
    return res.json({
      success: true,
      data: {
        ticket,
        workflow: workflowInfo
      }
    });
  } catch (error) {
    console.error('Get workflow details error:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Attend to a ticket (mark as in progress)
const attendTicket = async (req, res) => {
  const transaction = await Ticket.sequelize.transaction();
  
  try {
    const { ticketId } = req.params;
    const { notes } = req.body;
    const userId = req.user.userId;

    const ticket = await Ticket.findByPk(ticketId, { transaction });
    if (!ticket) {
      await safeRollback(transaction);
      return res.status(404).json({ message: 'Ticket not found' });
    }

    // Check if user can attend this ticket
    if (!canUserPerformAction(ticket, req.user, 'attend')) {
      await safeRollback(transaction);
      return res.status(403).json({ message: 'You are not authorized to attend this ticket' });
    }

    // Update ticket status
    ticket.status = 'In Progress';
    ticket.attended_by_id = userId;
    ticket.workflow_notes = notes || ticket.workflow_notes;
    
    // Handle attachment if provided
    let attachmentPath = null;
    if (req.file) {
      attachmentPath = req.file.path;
    }

    // Create assignment record
    await TicketAssignment.create({
      ticket_id: ticket.id,
      assigned_by_id: userId,
      assigned_to_id: userId,
      assigned_to_role: req.user.role,
      action: 'Attended',
      reason: notes || 'Ticket attended to',
      attachment_path: attachmentPath,
      created_at: new Date()
    }, { transaction });

    await ticket.save({ transaction });
    
    // Deactivate all updates for this user on this ticket
    await deactivateUserUpdates(ticket.id, userId);
    
    await transaction.commit();

    return res.json({
      success: true,
      message: 'Ticket attended successfully',
      data: ticket
    });
  } catch (error) {
    await safeRollback(transaction);
    console.error('Attend ticket error:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Recommend ticket to next step
const recommendTicket = async (req, res) => {
  const transaction = await Ticket.sequelize.transaction();
  
  try {
    const { ticketId } = req.params;
    // Handle both FormData and JSON body
    const recommendation_notes = req.body.recommendation_notes || req.body.recommendationNotes || req.body.notes;
    const evidence_url = req.body.evidence_url || req.body.evidenceUrl;
    const userId = req.user.userId;
    
    console.log(`🔍 Workflow recommend - received recommendation_notes: "${recommendation_notes}", req.body keys:`, Object.keys(req.body || {}));

    const ticket = await Ticket.findByPk(ticketId, { transaction });
    if (!ticket) {
      await safeRollback(transaction);
      return res.status(404).json({ message: 'Ticket not found' });
    }

    // Check if user can recommend this ticket
    if (!canUserPerformAction(ticket, req.user, 'recommend')) {
      await safeRollback(transaction);
      return res.status(403).json({ message: 'You are not authorized to recommend this ticket' });
    }

    // Check if evidence is required for major complaints
    if (ticket.complaint_type === 'Major' && !evidence_url) {
      await safeRollback(transaction);
      return res.status(400).json({ message: 'Evidence upload is required for major complaints' });
    }

    // Update ticket
    ticket.current_workflow_step += 1;
    ticket.workflow_notes = recommendation_notes || ticket.workflow_notes;
    if (evidence_url) {
      ticket.evidence_url = evidence_url;
    }

    // Check if workflow is completed
    const totalSteps = getWorkflowTotalSteps(ticket.workflow_path);
    if (ticket.current_workflow_step >= totalSteps) {
      ticket.workflow_completed = true;
      ticket.workflow_completed_at = new Date();
      ticket.status = 'Pending Approval';
    }

    // Find next user in workflow
    const nextRole = getNextRoleInWorkflow(ticket.workflow_path, ticket.current_workflow_step);
    if (nextRole) {
      const nextUser = await User.findOne({
        where: { role: nextRole, unit_section: ticket.responsible_unit_name },
        transaction
      });
      
      if (nextUser) {
        ticket.assigned_to_id = nextUser.id;
        ticket.assigned_to_role = nextUser.role;
        ticket.current_workflow_role = nextUser.role;
      }
    }

    // Handle attachment if provided
    let attachmentPath = null;
    if (req.file) {
      attachmentPath = req.file.path;
    }

    // Create assignment record
    await TicketAssignment.create({
      ticket_id: ticket.id,
      assigned_by_id: userId,
      assigned_to_id: ticket.assigned_to_id,
      assigned_to_role: ticket.assigned_to_role,
      action: 'Recommended',
      reason: recommendation_notes || 'Ticket recommended to next step',
      attachment_path: attachmentPath,
      created_at: new Date()
    }, { transaction });

    await ticket.save({ transaction });
    
    // Deactivate all updates for this user on this ticket
    await deactivateUserUpdates(ticket.id, userId);
    
    await transaction.commit();

    return res.json({
      success: true,
      message: 'Ticket recommended successfully',
      data: {
        ticket,
        nextStep: ticket.current_workflow_step,
        nextRole: nextRole,
        workflowCompleted: ticket.workflow_completed
      }
    });
  } catch (error) {
    await safeRollback(transaction);
    console.error('Recommend ticket error:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Attend and recommend in one action (for attendee with Minor/Major complaints from head of unit)
const attendAndRecommend = async (req, res) => {
  const transaction = await Ticket.sequelize.transaction();
  
  try {
    const { ticketId } = req.params;
    const { recommendation, evidence_url } = req.body;
    const userId = req.user.userId;

    if (!recommendation) {
      await safeRollback(transaction);
      return res.status(400).json({ message: 'Recommendation is required' });
    }

    const ticket = await Ticket.findByPk(ticketId, { transaction });
    if (!ticket) {
      await safeRollback(transaction);
      return res.status(404).json({ message: 'Ticket not found' });
    }

    // Check if user is attendee and ticket is Minor/Major complaint
    if (req.user.role !== 'attendee') {
      await safeRollback(transaction);
      return res.status(403).json({ message: 'Only attendees can use this endpoint' });
    }

    if (ticket.category !== 'Complaint' || !['Minor', 'Major'].includes(ticket.complaint_type)) {
      await safeRollback(transaction);
      return res.status(400).json({ message: 'This endpoint is only for Minor/Major complaints' });
    }

    // Find previous assigner from assignment history (head-of-unit or manager)
    const allAssignments = await TicketAssignment.findAll({
      where: { ticket_id: ticketId },
      order: [['created_at', 'DESC']],
      transaction
    });

    let currentUserAssignment = null;
    for (const assignment of allAssignments) {
      if (assignment.assigned_to_id === userId) {
        currentUserAssignment = assignment;
        break;
      }
    }

    let previousAssigner = null;
    
    // If current user was reassigned, return to the reassigned_by (assigned_by_id of current assignment)
    if (currentUserAssignment && currentUserAssignment.action === 'Reassigned') {
      previousAssigner = await User.findByPk(currentUserAssignment.assigned_by_id, { transaction });
    } else if (currentUserAssignment && currentUserAssignment.assigned_by_id) {
      // If not reassigned, find the previous assigner from assignment history
      for (const assignment of allAssignments) {
        if (assignment.assigned_to_id === currentUserAssignment.assigned_by_id &&
            assignment.created_at < currentUserAssignment.created_at) {
          previousAssigner = await User.findByPk(assignment.assigned_to_id, { transaction });
          break;
        }
      }
    }

    // If previous assigner not found in history, try to find head-of-unit or manager
    if (!previousAssigner) {
      const headOfUnit = await User.findOne({
        where: {
          role: 'head-of-unit',
          unit_section: ticket.responsible_unit_name || ticket.section
        },
        transaction
      });

      if (headOfUnit) {
        previousAssigner = headOfUnit;
      } else {
        const manager = await User.findOne({
          where: {
            role: 'manager',
            unit_section: ticket.responsible_unit_name || ticket.section
          },
          transaction
        });

        if (manager) {
          previousAssigner = manager;
        }
      }
    }

    if (!previousAssigner) {
      await safeRollback(transaction);
      return res.status(404).json({ message: 'Previous assigner (head-of-unit or manager) not found' });
    }

    await ticket.update({
      recommendation: recommendation,
      recommendation_details: recommendation,
      recommended_by_id: userId,
      recommended_at: new Date(),
      assigned_to_id: previousAssigner.id,
      assigned_to_role: previousAssigner.role,
      status: 'Reversed', // Use Reversed status to indicate reverse mechanism
      evidence_url: evidence_url || ticket.evidence_url
    }, { transaction });

    await TicketAssignment.create({
      ticket_id: ticketId,
      assigned_by_id: userId,
      assigned_to_id: previousAssigner.id,
      assigned_to_role: previousAssigner.role,
      action: 'Reversed', // Use Reversed action instead of "Attended and Recommended"
      reason: `Recommendation: ${recommendation}`,
      created_at: new Date()
    }, { transaction });

    // Create notification for previous assigner
    await Notification.create({
      ticket_id: ticketId,
      sender_id: userId,
      recipient_id: previousAssigner.id,
      message: `Ticket reversed to you with recommendation: ${ticket.subject || ticket.ticket_id}`,
      channel: "In-System",
      status: "unread",
      category: ticket.category || "General",
      comment: recommendation // Include recommendation in comment
    }, { transaction });

    await deactivateUserUpdates(ticket.id, userId);
    await transaction.commit();

    return res.json({
      success: true,
      message: `Recommendation submitted! Ticket reversed to ${previousAssigner.role} for review.`,
      data: {
        ticket,
        assignedTo: {
          id: previousAssigner.id,
          name: previousAssigner.full_name || previousAssigner.first_name + ' ' + previousAssigner.last_name,
          role: previousAssigner.role
        }
      }
    });
  } catch (error) {
    await safeRollback(transaction);
    console.error('Attend and recommend error:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Reverse ticket to previous step
const reverseTicket = async (req, res) => {
  const transaction = await Ticket.sequelize.transaction();
  
  try {
    const { ticketId } = req.params;
    // Handle both FormData and JSON body
    // FormData sends as 'reason' or 'reversal_reason', JSON sends as 'reversal_reason'
    // IMPORTANT: Always use reason from frontend (director/head-of-unit's own reason)
    // Do NOT use reason from previous assignment or reviewer
    const reversal_reason = req.body.reason || req.body.reversalReason;
    const userId = req.user.userId;
    
    console.log(`🔍 Workflow reverse - received reversal_reason from frontend: "${reversal_reason}"`);
    console.log(`🔍 Workflow reverse - req.body keys:`, Object.keys(req.body || {}));
    console.log(`🔍 Workflow reverse - Using reason from frontend, NOT from previous assignment`);

    const ticket = await Ticket.findByPk(ticketId, { transaction });
    if (!ticket) {
      await safeRollback(transaction);
      return res.status(404).json({ message: 'Ticket not found' });
    }

    // Check if user can reverse this ticket
    if (!canUserPerformAction(ticket, req.user, 'reverse')) {
      await safeRollback(transaction);
      return res.status(403).json({ message: 'You are not authorized to reverse this ticket' });
    }

    // Can only reverse to previous step
    if (ticket.current_workflow_step <= 1) {
      await safeRollback(transaction);
      return res.status(400).json({ message: 'Cannot reverse ticket further' });
    }

    // Go back one step
    ticket.current_workflow_step -= 1;

    // Always store latest reversal reason in workflow_notes
    // so workflow history shows what the *current* user wrote
    if (reversal_reason && reversal_reason.trim()) {
      ticket.workflow_notes = reversal_reason.trim();
    }

    // Also update main description so ticket details view shows
    // the text entered by the reversing user, not an older comment.
    // We don't append here – we replace, because this is specifically
    // the reversal explanation from the current step.
    if (reversal_reason && reversal_reason.trim()) {
      ticket.description = reversal_reason.trim();
    }

    ticket.status = 'Reversed';

    // Find previous user in workflow
    const previousRole = getNextRoleInWorkflow(ticket.workflow_path, ticket.current_workflow_step);
    if (previousRole) {
      const previousUser = await User.findOne({
        where: { role: previousRole, unit_section: ticket.responsible_unit_name },
        transaction
      });
      
      if (previousUser) {
        ticket.assigned_to_id = previousUser.id;
        ticket.assigned_to_role = previousUser.role;
        ticket.current_workflow_role = previousUser.role;
      }
    }

    // Handle attachment if provided
    let attachmentPath = null;
    if (req.file) {
      attachmentPath = req.file.path;
    }

    // Create assignment record
    // IMPORTANT: Always use reason from frontend (director/head-of-unit's own reason)
    // Do NOT use reason from previous assignment or reviewer
    const assignmentReason = reversal_reason && String(reversal_reason).trim() 
      ? String(reversal_reason).trim() 
      : 'Ticket reversed to previous step';
    
    console.log(`🔍 Workflow reverse - Creating assignment with reason from frontend: "${assignmentReason}"`);
    
    await TicketAssignment.create({
      ticket_id: ticket.id,
      assigned_by_id: userId,
      assigned_to_id: ticket.assigned_to_id,
      assigned_to_role: ticket.assigned_to_role,
      action: 'Reversed',
      reason: assignmentReason, // Use reason from frontend, NOT from previous assignment
      attachment_path: attachmentPath,
      created_at: new Date()
    }, { transaction });

    await ticket.save({ transaction });
    await transaction.commit();

    return res.json({
      success: true,
      message: 'Ticket reversed successfully',
      data: {
        ticket,
        currentStep: ticket.current_workflow_step,
        currentRole: ticket.current_workflow_role
      }
    });
  } catch (error) {
    await safeRollback(transaction);
    console.error('Reverse ticket error:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Close ticket (final approval)
const closeTicket = async (req, res) => {
  const transaction = await Ticket.sequelize.transaction();
  
  try {
    const { ticketId } = req.params;
    const { closure_notes } = req.body;
    const userId = req.user.userId;

    const ticket = await Ticket.findByPk(ticketId, { transaction });
    if (!ticket) {
      await safeRollback(transaction);
      return res.status(404).json({ message: 'Ticket not found' });
    }

    // Check if user can close this ticket
    if (!canUserPerformAction(ticket, req.user, 'close')) {
      await safeRollback(transaction);
      return res.status(403).json({ message: 'You are not authorized to close this ticket' });
    }

    // Update ticket
    ticket.status = 'Closed';
    ticket.workflow_completed = true;
    ticket.workflow_completed_at = new Date();
    ticket.date_of_resolution = new Date();
    ticket.resolution_details = closure_notes || 'Ticket closed by workflow completion';
    ticket.workflow_notes = closure_notes || ticket.workflow_notes;

    // Handle attachment if provided
    let attachmentPath = null;
    if (req.file) {
      attachmentPath = req.file.path;
    }

    // Create assignment record
    await TicketAssignment.create({
      ticket_id: ticket.id,
      assigned_by_id: userId,
      assigned_to_id: userId,
      assigned_to_role: req.user.role,
      action: 'Closed',
      reason: closure_notes || 'Ticket closed by workflow completion',
      attachment_path: attachmentPath,
      created_at: new Date()
    }, { transaction });

    await ticket.save({ transaction });
    
    // Deactivate all updates for this user on this ticket
    await deactivateUserUpdates(ticket.id, userId);
    
    await transaction.commit();

    return res.json({
      success: true,
      message: 'Ticket closed successfully',
      data: ticket
    });
  } catch (error) {
    await safeRollback(transaction);
    console.error('Close ticket error:', error);
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Helper function to check if user can perform action
const canUserPerformAction = (ticket, user, action) => {
  const userRole = user.role;
  const ticketStep = ticket.current_workflow_step;
  const workflowPath = ticket.workflow_path;

  // Define role permissions for each action
  const rolePermissions = {
    'attend': {
      'head-of-unit': ['MINOR_UNIT', 'MAJOR_UNIT'],
      'director': ['MINOR_UNIT', 'MAJOR_UNIT'],
      'supervisor': ['MINOR_DIRECTORATE', 'MAJOR_DIRECTORATE'],
      'attendee': ['MINOR_UNIT', 'MINOR_DIRECTORATE', 'MAJOR_UNIT', 'MAJOR_DIRECTORATE']
    },
    'recommend': {
      'head-of-unit': ['MINOR_UNIT', 'MAJOR_UNIT'],
      'director': ['MINOR_UNIT', 'MAJOR_UNIT'],
      'supervisor': ['MINOR_DIRECTORATE', 'MAJOR_DIRECTORATE'],
      'attendee': ['MINOR_UNIT', 'MINOR_DIRECTORATE', 'MAJOR_UNIT', 'MAJOR_DIRECTORATE']
    },
    'reverse': {
      'head-of-unit': ['MINOR_UNIT', 'MAJOR_UNIT'],
      'director': ['MINOR_UNIT', 'MAJOR_UNIT'],
      // 'supervisor': ['MINOR_DIRECTORATE', 'MAJOR_DIRECTORATE'],
      'director-general': ['MINOR_DIRECTORATE', 'MAJOR_DIRECTORATE']
    },
    'close': {
      'head-of-unit': ['MINOR_UNIT'],
      'director': ['MINOR_UNIT'],
      'director-general': ['MINOR_UNIT', 'MINOR_DIRECTORATE', 'MAJOR_UNIT', 'MAJOR_DIRECTORATE']
    }
  };

  const allowedWorkflows = rolePermissions[action]?.[userRole] || [];
  return allowedWorkflows.includes(workflowPath);
};

    // Helper functions (same as in reviewerController)
const getWorkflowTotalSteps = (workflowPath) => {
  const workflowSteps = {
    'MINOR_UNIT': 4,
    'MINOR_DIRECTORATE': 5,
    'MAJOR_UNIT': 5,
    'MAJOR_DIRECTORATE': 7
  };
  return workflowSteps[workflowPath] || 0;
};

const getNextRoleInWorkflow = (workflowPath, currentStep) => {
  const workflowRoles = {
          'MINOR_UNIT': ['reviewer', 'head-of-unit', 'attendee', 'head-of-unit'],
      'MINOR_DIRECTORATE': ['reviewer', 'director', 'manager', 'attendee', 'director'],
      'MAJOR_UNIT': ['reviewer', 'head-of-unit', 'attendee', 'head-of-unit', 'director-general'],
      'MAJOR_DIRECTORATE': ['reviewer', 'director-general', 'manager', 'attendee', 'manager', 
         'director', 'director-general' ]
  };
  
  const roles = workflowRoles[workflowPath];
  if (!roles || currentStep >= roles.length) return null;
  return roles[currentStep];
};

const getWorkflowInfo = (workflowPath, currentStep) => {
  const totalSteps = getWorkflowTotalSteps(workflowPath);
  const currentRole = getNextRoleInWorkflow(workflowPath, currentStep);
  const nextRole = getNextRoleInWorkflow(workflowPath, currentStep + 1);
  
  return {
    path: workflowPath,
    currentStep,
    totalSteps,
    currentRole,
    nextRole,
    progress: Math.round((currentStep / totalSteps) * 100),
    isCompleted: currentStep >= totalSteps
  };
};

module.exports = {
  getWorkflowDetails,
  attendTicket,
  recommendTicket,
  attendAndRecommend,
  reverseTicket,
  closeTicket
}; 