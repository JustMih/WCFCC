const Ticket = require('../models/Ticket');
const TicketAssignment = require('../models/TicketAssignment');
const User = require('../models/User');
const { Op } = require('sequelize');

/**
 * Workflow Communication Service
 * Connects coordinator controller with ticket controller for complete workflow tracking
 */

// Workflow paths and their step definitions
const WORKFLOW_PATHS = {
  MINOR_UNIT: {
    steps: ['agent', 'coordinator', 'head-of-unit', 'attendee', 'head-of-unit'],
    totalSteps: 5,
    sla: {
      coordinator: 2,
      'head-of-unit': 1,
      attendee: 3
    }
  },
  MINOR_DIRECTORATE: {
    steps: ['agent', 'coordinator', 'director', 'manager', 'attendee', 'manager', 'director'],
    totalSteps: 7,
    sla: {
      coordinator: 2,
      director: 1,
      manager: 1,
      attendee: 3
    }
  },
  MAJOR_UNIT: {
    steps: ['agent', 'coordinator', 'head-of-unit', 'attendee', 'head-of-unit', 'director-general'],
    totalSteps: 6,
    sla: {
      coordinator: 2,
      'head-of-unit': 1,
      attendee: 10,
      'director-general': 1
    }
  },
  MAJOR_DIRECTORATE: {
    steps: ['agent', 'coordinator', 'director', 'manager', 'attendee', 'manager', 'director', 'director-general'],
    totalSteps: 8,
    sla: {
      coordinator: 2,
      director: 1,
      manager: 1,
      attendee: 10,
      'director-general': 1
    }
  }
};

/**
 * Get workflow information for a ticket
 */
function getWorkflowInfo(ticket) {
  if (!ticket.workflow_path) return null;
  
  const workflow = WORKFLOW_PATHS[ticket.workflow_path];
  if (!workflow) return null;
  
  return {
    path: ticket.workflow_path,
    currentStep: ticket.current_workflow_step || 1,
    totalSteps: workflow.totalSteps,
    currentRole: ticket.workflow_current_role,
    nextRole: getNextRoleInWorkflow(ticket.workflow_path, ticket.current_workflow_step || 1),
    steps: workflow.steps,
    sla: workflow.sla
  };
}

/**
 * Get next role in workflow based on current step
 */
function getNextRoleInWorkflow(workflowPath, currentStep) {
  const workflow = WORKFLOW_PATHS[workflowPath];
  if (!workflow || currentStep >= workflow.totalSteps) return null;
  
  return workflow.steps[currentStep]; // 0-based index
}

/**
 * Calculate estimated completion date based on SLA
 */
function calculateEstimatedCompletion(ticket) {
  const workflow = getWorkflowInfo(ticket);
  if (!workflow) return null;
  
  const startDate = new Date(ticket.workflow_started_at || ticket.created_at);
  let totalWorkingDays = 0;
  
  // Calculate total working days from current step to end
  for (let i = workflow.currentStep - 1; i < workflow.totalSteps; i++) {
    const role = workflow.steps[i];
    totalWorkingDays += workflow.sla[role] || 1;
  }
  
  // Add working days to start date (excluding weekends)
  let currentDate = new Date(startDate);
  let workingDaysAdded = 0;
  
  while (workingDaysAdded < totalWorkingDays) {
    currentDate.setDate(currentDate.getDate() + 1);
    if (currentDate.getDay() !== 0 && currentDate.getDay() !== 6) {
      workingDaysAdded++;
    }
  }
  
  return currentDate;
}

/**
 * Update ticket workflow state
 */
async function updateTicketWorkflowState(ticketId, updates, transaction = null) {
  try {
    const updateData = {
      ...updates,
      updated_at: new Date()
    };
    
    if (transaction) {
      await Ticket.update(updateData, { 
        where: { id: ticketId }, 
        transaction 
      });
    } else {
      await Ticket.update(updateData, { where: { id: ticketId } });
    }
    
    return true;
  } catch (error) {
    console.error('Error updating ticket workflow state:', error);
    return false;
  }
}

/**
 * Create comprehensive workflow assignment record
 */
async function createWorkflowAssignmentRecord(ticket, action, assignedBy, assignedTo, currentStep, nextStep, reason, transaction = null) {
  try {
    const workflow = getWorkflowInfo(ticket);
    if (!workflow) return null;
    
    const slaInfo = workflow.sla[workflow.currentRole] || 0;
    const estimatedCompletion = calculateEstimatedCompletion(ticket);
    
    const assignmentData = {
      ticket_id: ticket.id,
      assigned_by_id: assignedBy.id,
      assigned_to_id: assignedTo ? assignedTo.id : null,
      assigned_to_role: assignedTo ? assignedTo.role : null,
      action: action,
      reason: reason || `Workflow action: ${action}`,
      workflow_path: ticket.workflow_path,
      workflow_step: currentStep,
      workflow_current_role: workflow.currentRole,
      workflow_next_role: nextStep,
      workflow_total_steps: workflow.totalSteps,
      sla_total_days: Object.values(workflow.sla).reduce((sum, days) => sum + days, 0),
      sla_current_step_days: `${slaInfo} working days`,
      sla_remaining_days: calculateRemainingSLADays(ticket, currentStep, workflow),
      backup_type: 'workflow_action',
      action_details: JSON.stringify({
        workflow_path: ticket.workflow_path,
        current_step: currentStep,
        total_steps: workflow.totalSteps,
        estimated_completion: estimatedCompletion,
        sla_info: workflow.sla
      }),
      created_at: new Date()
    };
    
    if (transaction) {
      return await TicketAssignment.create(assignmentData, { transaction });
    } else {
      return await TicketAssignment.create(assignmentData);
    }
  } catch (error) {
    console.error('Error creating workflow assignment record:', error);
    return null;
  }
}

/**
 * Calculate remaining SLA days for current step
 */
function calculateRemainingSLADays(ticket, currentStep, workflow) {
  if (!ticket.workflow_started_at) return null;
  
  const startDate = new Date(ticket.workflow_started_at);
  const currentDate = new Date();
  const currentRole = workflow.steps[currentStep - 1];
  const allowedDays = workflow.sla[currentRole] || 0;
  
  // Calculate working days elapsed
  let workingDaysElapsed = 0;
  let current = new Date(startDate);
  
  while (current <= currentDate) {
    if (current.getDay() !== 0 && current.getDay() !== 6) {
      workingDaysElapsed++;
    }
    current.setDate(current.getDate() + 1);
  }
  
  return Math.max(0, allowedDays - workingDaysElapsed);
}

/**
 * Process workflow step transition
 */
async function processWorkflowStepTransition(ticketId, action, assignedBy, assignedTo, reason, transaction = null) {
  try {
    const ticket = await Ticket.findByPk(ticketId);
    if (!ticket || !ticket.workflow_path) {
      throw new Error('Ticket not found or no workflow path set');
    }
    
    const workflow = getWorkflowInfo(ticket);
    if (!workflow) {
      throw new Error('Invalid workflow path');
    }
    
    // Determine next step and role
    let nextStep = workflow.currentStep;
    let nextRole = workflow.currentRole;
    
    switch (action) {
      case 'Forwarded':
      case 'Assigned':
        nextStep = workflow.currentStep + 1;
        nextRole = getNextRoleInWorkflow(ticket.workflow_path, nextStep);
        break;
      case 'Reversed':
        nextStep = Math.max(1, workflow.currentStep - 1);
        nextRole = getNextRoleInWorkflow(ticket.workflow_path, nextStep);
        break;
      case 'Closed':
        nextStep = workflow.totalSteps;
        nextRole = workflow.currentRole;
        break;
    }
    
    // Update ticket workflow state
    const workflowUpdates = {
      current_workflow_step: nextStep,
      workflow_current_role: nextRole,
      workflow_completed: nextStep >= workflow.totalSteps
    };
    
    if (nextStep >= workflow.totalSteps) {
      workflowUpdates.workflow_completed = true;
    }
    
    await updateTicketWorkflowState(ticketId, workflowUpdates, transaction);
    
    // Create comprehensive assignment record
    const assignment = await createWorkflowAssignmentRecord(
      ticket,
      action,
      assignedBy,
      assignedTo,
      workflow.currentStep,
      nextRole,
      reason,
      transaction
    );
    
    return {
      success: true,
      ticket: await Ticket.findByPk(ticketId),
      assignment,
      workflow: getWorkflowInfo(await Ticket.findByPk(ticketId))
    };
    
  } catch (error) {
    console.error('Error processing workflow step transition:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get workflow audit trail for a ticket
 */
async function getWorkflowAuditTrail(ticketId) {
  try {
    const ticket = await Ticket.findByPk(ticketId);
    if (!ticket) return null;
    
    const assignments = await TicketAssignment.findAll({
      where: { ticket_id: ticketId },
      order: [['workflow_step', 'ASC'], ['created_at', 'ASC']],
      include: [
        { model: User, as: 'assignedBy', attributes: ['id', 'name', 'role'] },
        { model: User, as: 'assignedTo', attributes: ['id', 'name', 'role'] }
      ]
    });
    
    const workflow = getWorkflowInfo(ticket);
    
    return {
      ticket: {
        id: ticket.id,
        ticket_id: ticket.ticket_id,
        subject: ticket.subject,
        category: ticket.category,
        complaint_type: ticket.complaint_type,
        workflow_path: ticket.workflow_path,
        current_workflow_step: ticket.current_workflow_step,
        workflow_total_steps: ticket.workflow_total_steps,
        workflow_current_role: ticket.workflow_current_role,
        workflow_started_at: ticket.workflow_started_at,
        workflow_completed: ticket.workflow_completed
      },
      workflow,
      assignments: assignments.map(assignment => ({
        id: assignment.id,
        step: assignment.workflow_step,
        action: assignment.action,
        reason: assignment.reason,
        assigned_by: assignment.assignedBy ? {
          id: assignment.assignedBy.id,
          name: assignment.assignedBy.name,
          role: assignment.assignedBy.role
        } : null,
        assigned_to: assignment.assignedTo ? {
          id: assignment.assignedTo.id,
          name: assignment.assignedTo.name,
          role: assignment.assignedTo.role
        } : null,
        workflow_context: {
          path: assignment.workflow_path,
          current_role: assignment.workflow_current_role,
          next_role: assignment.workflow_next_role,
          total_steps: assignment.workflow_total_steps,
          sla_total_days: assignment.sla_total_days,
          sla_current_step_days: assignment.sla_current_step_days,
          sla_remaining_days: assignment.sla_remaining_days
        },
        created_at: assignment.created_at
      }))
    };
    
  } catch (error) {
    console.error('Error getting workflow audit trail:', error);
    return null;
  }
}

/**
 * Check SLA compliance for a ticket
 */
function checkSLACompliance(ticket) {
  const workflow = getWorkflowInfo(ticket);
  if (!workflow) return { status: 'Unknown', details: 'No workflow path set' };
  
  const currentRole = workflow.currentRole;
  const slaDays = workflow.sla[currentRole] || 0;
  
  if (slaDays === 0) return { status: 'No SLA', details: 'No SLA defined for current role' };
  
  const remainingDays = calculateRemainingSLADays(ticket, workflow.currentStep, workflow);
  
  if (remainingDays === null) return { status: 'Unknown', details: 'Cannot calculate remaining days' };
  
  if (remainingDays < 0) {
    return { 
      status: 'Overdue', 
      details: `${Math.abs(remainingDays)} days overdue`,
      severity: 'high'
    };
  } else if (remainingDays <= 1) {
    return { 
      status: 'Approaching Deadline', 
      details: `${remainingDays} day(s) remaining`,
      severity: 'medium'
    };
  } else {
    return { 
      status: 'On Time', 
      details: `${remainingDays} day(s) remaining`,
      severity: 'low'
    };
  }
}

/**
 * Get deadline for the next step in workflow
 */
function getNextStepDeadline(ticket, slaInfo) {
  if (!ticket.workflow_started_at) return null;
  
  const startDate = new Date(ticket.workflow_started_at);
  const currentDate = new Date();
  const currentRole = ticket.workflow_current_role;
  const allowedDays = slaInfo[currentRole] || 0;
  
  if (allowedDays === 0) return null;
  
  // Calculate deadline by adding working days to start date
  let deadline = new Date(startDate);
  let workingDaysAdded = 0;
  
  while (workingDaysAdded < allowedDays) {
    deadline.setDate(deadline.getDate() + 1);
    if (deadline.getDay() !== 0 && deadline.getDay() !== 6) {
      workingDaysAdded++;
    }
  }
  
  return deadline;
}

module.exports = {
  getWorkflowInfo,
  getNextRoleInWorkflow,
  calculateEstimatedCompletion,
  updateTicketWorkflowState,
  createWorkflowAssignmentRecord,
  calculateRemainingSLADays,
  processWorkflowStepTransition,
  getWorkflowAuditTrail,
  checkSLACompliance,
  getNextStepDeadline,
  WORKFLOW_PATHS
}; 