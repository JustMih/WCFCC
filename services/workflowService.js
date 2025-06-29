const User = require('../models/User');
const Ticket = require('../models/Ticket');
const TicketAssignment = require('../models/TicketAssignment');
const Section = require('../models/Section');

/**
 * Workflow Service for handling complaint routing and assignments
 */

// Define workflow paths
const WORKFLOW_PATHS = {
  MINOR_UNIT: {
    name: 'Minor Complaint - Unit',
    steps: ['Coordinator', 'Head of Unit', 'Attendee', 'Head of Unit'],
    roles: ['coordinator', 'supervisor', 'attendee', 'supervisor']
  },
  MINOR_DIRECTORATE: {
    name: 'Minor Complaint - Directorate',
    steps: ['Coordinator', 'Director', 'Manager', 'Attendee', 'Manager'],
    roles: ['coordinator', 'director-general', 'supervisor', 'attendee', 'supervisor']
  },
  MAJOR_UNIT: {
    name: 'Major Complaint - Unit',
    steps: ['Coordinator', 'Head of Unit', 'Attendee', 'Head of Unit', 'DG'],
    roles: ['coordinator', 'supervisor', 'attendee', 'supervisor', 'director-general']
  },
  MAJOR_DIRECTORATE: {
    name: 'Major Complaint - Directorate',
    steps: ['Coordinator', 'Director', 'Manager', 'Attendee', 'Manager', 'Director', 'DG'],
    roles: ['coordinator', 'director-general', 'supervisor', 'attendee', 'supervisor', 'director-general', 'director-general']
  }
};

/**
 * Determine the workflow path based on complaint type and unit type
 */
const determineWorkflowPath = (complaintType, unitName) => {
  const isDirectorate = unitName && unitName.toLowerCase().includes('directorate');
  
  if (complaintType === 'Minor') {
    return isDirectorate ? 'MINOR_DIRECTORATE' : 'MINOR_UNIT';
  } else if (complaintType === 'Major') {
    return isDirectorate ? 'MAJOR_DIRECTORATE' : 'MAJOR_UNIT';
  }
  
  return 'MINOR_UNIT'; // Default fallback
};

/**
 * Get the next role in the workflow
 */
const getNextRole = (currentRole, workflowPath) => {
  const workflow = WORKFLOW_PATHS[workflowPath];
  if (!workflow) return null;
  
  const currentIndex = workflow.roles.indexOf(currentRole);
  if (currentIndex === -1 || currentIndex === workflow.roles.length - 1) {
    return null; // No next role
  }
  
  return workflow.roles[currentIndex + 1];
};

/**
 * Get available users for a specific role and unit
 */
const getAvailableUsers = async (role, unitName = null) => {
  console.log(`\n=== DEBUG: Looking for users with role: "${role}" and unit: "${unitName}" ===`);
  
  let whereClause = { role };
  
  // Director General is head of all units, so don't filter by unit_section
  // Other roles can be filtered by unit if specified
  if (unitName && role !== 'director-general') {
    whereClause.unit_section = unitName;
  }
  
  console.log('Where clause:', JSON.stringify(whereClause, null, 2));
  
  let users = await User.findAll({
    where: whereClause,
    attributes: ['id', 'name', 'email', 'role', 'unit_section']
  });
  
  console.log(`Found ${users.length} users with exact role match:`);
  users.forEach(user => {
    console.log(`- ${user.name} (${user.email}) - Role: "${user.role}" - Unit: "${user.unit_section}"`);
  });
  
  // If no users found for the specific role, try fallback roles
  if (users.length === 0) {
    console.log(`\nNo users found for role: "${role}", trying fallback roles...`);
    
    // First, let's see what roles are actually in the database
    const allUsers = await User.findAll({
      attributes: ['id', 'name', 'email', 'role', 'unit_section'],
      where: { isActive: true }
    });
    
    console.log('\nAll active users in database:');
    allUsers.forEach(user => {
      console.log(`- ${user.name} (${user.email}) - Role: "${user.role}" - Unit: "${user.unit_section}"`);
    });
    
    // Define fallback role mappings
    const fallbackRoles = {
      'director-general': ['supervisor', 'coordinator'],
      'supervisor': ['coordinator', 'attendee'],
      'attendee': ['coordinator'],
      'coordinator': ['supervisor', 'attendee']
    };
    
    const fallbackRoleList = fallbackRoles[role] || ['coordinator'];
    console.log(`\nTrying fallback roles: ${fallbackRoleList.join(', ')}`);
    
    for (const fallbackRole of fallbackRoleList) {
      let fallbackWhereClause = { role: fallbackRole };
      // For fallback roles, also don't filter by unit for director-general
      if (unitName && fallbackRole !== 'director-general') {
        fallbackWhereClause.unit_section = unitName;
      }
      
      console.log(`\nTrying fallback role: "${fallbackRole}" with where clause:`, JSON.stringify(fallbackWhereClause, null, 2));
      
      users = await User.findAll({
        where: fallbackWhereClause,
        attributes: ['id', 'name', 'email', 'role', 'unit_section']
      });
      
      console.log(`Found ${users.length} users with fallback role "${fallbackRole}":`);
      users.forEach(user => {
        console.log(`- ${user.name} (${user.email}) - Role: "${user.role}" - Unit: "${user.unit_section}"`);
      });
      
      if (users.length > 0) {
        console.log(`\n✅ Successfully found ${users.length} users with fallback role: "${fallbackRole}"`);
        break;
      }
    }
    
    // If still no users found, get any available user
    if (users.length === 0) {
      console.log('\nNo users found with fallback roles, getting any available user...');
      users = await User.findAll({
        where: { isActive: true },
        attributes: ['id', 'name', 'email', 'role', 'unit_section'],
        limit: 1
      });
      
      console.log(`Found ${users.length} fallback users:`);
      users.forEach(user => {
        console.log(`- ${user.name} (${user.email}) - Role: "${user.role}" - Unit: "${user.unit_section}"`);
      });
    }
  }
  
  console.log(`\n=== END DEBUG: Returning ${users.length} users ===\n`);
  return users;
};

/**
 * Assign ticket to next person in workflow
 */
const assignToNextInWorkflow = async (ticketId, currentUserId, workflowPath, unitName, justification = '') => {
  const ticket = await Ticket.findByPk(ticketId);
  if (!ticket) {
    throw new Error('Ticket not found');
  }
  
  const currentRole = ticket.assigned_to_role;
  const nextRole = getNextRole(currentRole, workflowPath);
  
  if (!nextRole) {
    throw new Error('No next role in workflow');
  }
  
  // Get available users for the next role (with fallback)
  const availableUsers = await getAvailableUsers(nextRole, unitName);
  
  if (availableUsers.length === 0) {
    throw new Error(`No users available for role: ${nextRole} or any fallback roles`);
  }
  
  // For now, assign to the first available user
  // In a real system, you might want more sophisticated assignment logic
  const nextAssignee = availableUsers[0];
  const actualRole = nextAssignee.role; // Use the actual role of the assigned user
  
  // Update ticket
  await ticket.update({
    assigned_to_id: nextAssignee.id,
    assigned_to_role: actualRole, // Use actual role instead of expected role
    status: 'Assigned'
  });
  
  // Create assignment record
  await TicketAssignment.create({
    ticket_id: ticketId,
    assigned_by_id: currentUserId,
    assigned_to_id: nextAssignee.id,
    assigned_to_role: actualRole,
    action: 'Assigned',
    reason: justification || `Assigned to ${actualRole} in workflow`,
    created_at: new Date()
  });
  
  return {
    ticket,
    nextAssignee,
    nextRole: actualRole // Return actual role
  };
};

/**
 * Handle complaint rating and initial assignment
 */
const handleComplaintRating = async (ticketId, complaintType, unitName, coordinatorId, justification) => {
  const ticket = await Ticket.findByPk(ticketId);
  if (!ticket) {
    throw new Error('Ticket not found');
  }
  
  // Update ticket with rating
  await ticket.update({
    complaint_type: complaintType,
    responsible_unit_name: unitName,
    rated_by_id: coordinatorId,
    rated_at: new Date()
  });
  
  // Determine next role based on complaint type and unit
  let nextRole;
  if (complaintType === 'Minor') {
    if (unitName && unitName.toLowerCase().includes('directorate')) {
      nextRole = 'director-general'; // For directorate, go to DG
    } else {
      nextRole = 'supervisor'; // For unit, go to Head of Unit
    }
  } else if (complaintType === 'Major') {
    if (unitName && unitName.toLowerCase().includes('directorate')) {
      nextRole = 'director-general'; // For directorate, go to DG
    } else {
      nextRole = 'supervisor'; // For unit, go to Head of Unit first
    }
  }
  
  // Get available users for the next role (with fallback)
  const availableUsers = await getAvailableUsers(nextRole, unitName);
  
  if (availableUsers.length === 0) {
    throw new Error(`No users available for role: ${nextRole} or any fallback roles`);
  }
  
  const nextAssignee = availableUsers[0];
  const actualRole = nextAssignee.role; // Use the actual role of the assigned user
  
  // Update ticket assignment
  await ticket.update({
    assigned_to_id: nextAssignee.id,
    assigned_to_role: actualRole,
    status: 'Assigned'
  });
  
  // Create assignment record
  await TicketAssignment.create({
    ticket_id: ticketId,
    assigned_by_id: coordinatorId,
    assigned_to_id: nextAssignee.id,
    assigned_to_role: actualRole,
    action: `Rated as ${complaintType} and assigned to ${actualRole}`,
    reason: justification,
    created_at: new Date()
  });
  
  return {
    ticket,
    nextAssignee,
    nextRole: actualRole
  };
};

/**
 * Handle complaint conversion to inquiry
 */
const handleComplaintToInquiry = async (ticketId, coordinatorId, justification) => {
  const ticket = await Ticket.findByPk(ticketId);
  if (!ticket) {
    throw new Error('Ticket not found');
  }
  
  // Update ticket to inquiry
  await ticket.update({
    category: 'Inquiry',
    converted_to: 'Inquiry',
    converted_by_id: coordinatorId,
    converted_at: new Date(),
    status: 'Open'
  });
  
  // Find appropriate focal person or attendee
  const focalPerson = await User.findOne({
    where: {
      role: { [require('sequelize').Op.in]: ['focal-person', 'claim-focal-person', 'compliance-focal-person'] },
      unit_section: ticket.responsible_unit_name
    }
  });
  
  if (!focalPerson) {
    // Fallback to general attendee
    const attendee = await User.findOne({
      where: { role: 'attendee' }
    });
    
    if (!attendee) {
      throw new Error('No appropriate user found to assign inquiry');
    }
    
    await ticket.update({
      assigned_to_id: attendee.id,
      assigned_to_role: 'attendee',
      status: 'Assigned'
    });
  } else {
    await ticket.update({
      assigned_to_id: focalPerson.id,
      assigned_to_role: focalPerson.role,
      status: 'Assigned'
    });
  }
  
  // Create assignment record
  await TicketAssignment.create({
    ticket_id: ticketId,
    assigned_by_id: coordinatorId,
    assigned_to_id: ticket.assigned_to_id,
    assigned_to_role: ticket.assigned_to_role,
    action: 'Converted to Inquiry and assigned',
    reason: justification,
    created_at: new Date()
  });
  
  return {
    ticket,
    assignedTo: focalPerson || attendee
  };
};

/**
 * Get workflow status and next steps
 */
const getWorkflowStatus = async (ticketId) => {
  const ticket = await Ticket.findByPk(ticketId, {
    include: [
      {
        model: TicketAssignment,
        as: 'assignments',
        order: [['created_at', 'DESC']]
      }
    ]
  });
  
  if (!ticket) {
    throw new Error('Ticket not found');
  }
  
  const workflowPath = determineWorkflowPath(ticket.complaint_type, ticket.responsible_unit_name);
  const workflow = WORKFLOW_PATHS[workflowPath];
  
  const currentStepIndex = workflow.roles.indexOf(ticket.assigned_to_role);
  const totalSteps = workflow.roles.length;
  
  return {
    workflowPath,
    workflowName: workflow.name,
    currentStep: currentStepIndex + 1,
    totalSteps,
    currentRole: ticket.assigned_to_role,
    nextRole: currentStepIndex < totalSteps - 1 ? workflow.roles[currentStepIndex + 1] : null,
    isComplete: currentStepIndex === totalSteps - 1
  };
};

/**
 * MINOR COMPLAINT - UNIT WORKFLOW ACTIONS
 * 
 * Workflow: Agent -> Coordinator -> Head of Unit -> Attendee -> Head of Unit
 * Roles: coordinator -> supervisor -> attendee -> supervisor
 */

/**
 * COORDINATOR ACTIONS (Step 1)
 * Actions: rate, change type, assign
 */
const coordinatorActions = {
  // Rate complaint (already implemented in handleComplaintRating)
  rateComplaint: handleComplaintRating,
  
  // Change complaint type (convert to inquiry)
  changeComplaintType: handleComplaintToInquiry,
  
  // Assign to next in workflow (Head of Unit)
  assignToNext: async (ticketId, coordinatorId, justification = '') => {
    const ticket = await Ticket.findByPk(ticketId);
    if (!ticket) {
      throw new Error('Ticket not found');
    }
    
    // For Minor Unit workflow, next role is supervisor (Head of Unit)
    const nextRole = 'supervisor';
    const availableUsers = await getAvailableUsers(nextRole, ticket.responsible_unit_name);
    
    if (availableUsers.length === 0) {
      throw new Error(`No Head of Unit available for unit: ${ticket.responsible_unit_name}`);
    }
    
    const nextAssignee = availableUsers[0];
    
    // Update ticket assignment
    await ticket.update({
      assigned_to_id: nextAssignee.id,
      assigned_to_role: nextAssignee.role,
      status: 'Assigned'
    });
    
    // Create assignment record
    await TicketAssignment.create({
      ticket_id: ticketId,
      assigned_by_id: coordinatorId,
      assigned_to_id: nextAssignee.id,
      assigned_to_role: nextAssignee.role,
      action: 'Assigned to Head of Unit',
      reason: justification || 'Coordinator assigned to Head of Unit',
      created_at: new Date()
    });
    
    return {
      ticket,
      nextAssignee,
      nextRole: nextAssignee.role
    };
  }
};

/**
 * HEAD OF UNIT ACTIONS (Step 2 & 4)
 * Actions: assign, reverse, attend and close
 */
const headOfUnitActions = {
  // Assign to attendee
  assignToAttendee: async (ticketId, headOfUnitId, attendeeId, justification = '') => {
    const ticket = await Ticket.findByPk(ticketId);
    if (!ticket) {
      throw new Error('Ticket not found');
    }
    
    const attendee = await User.findByPk(attendeeId);
    if (!attendee || attendee.role !== 'attendee') {
      throw new Error('Invalid attendee selected');
    }
    
    // Update ticket assignment
    await ticket.update({
      assigned_to_id: attendee.id,
      assigned_to_role: attendee.role,
      status: 'Assigned'
    });
    
    // Create assignment record
    await TicketAssignment.create({
      ticket_id: ticketId,
      assigned_by_id: headOfUnitId,
      assigned_to_id: attendee.id,
      assigned_to_role: attendee.role,
      action: 'Assigned to Attendee',
      reason: justification || 'Head of Unit assigned to Attendee',
      created_at: new Date()
    });
    
    return {
      ticket,
      nextAssignee: attendee,
      nextRole: attendee.role
    };
  },
  
  // Reverse ticket to previous step
  reverseTicket: async (ticketId, headOfUnitId, reason = '') => {
    const ticket = await Ticket.findByPk(ticketId, {
      include: [
        {
          model: TicketAssignment,
          as: 'assignments',
          order: [['created_at', 'DESC']],
          limit: 2
        }
      ]
    });
    
    if (!ticket) {
      throw new Error('Ticket not found');
    }
    
    // Get the previous assignment
    const previousAssignment = ticket.assignments[1]; // Skip current assignment
    if (!previousAssignment) {
      throw new Error('No previous assignment found to reverse to');
    }
    
    // Update ticket to previous assignment
    await ticket.update({
      assigned_to_id: previousAssignment.assigned_to_id,
      assigned_to_role: previousAssignment.assigned_to_role,
      status: 'Assigned'
    });
    
    // Create reverse assignment record
    await TicketAssignment.create({
      ticket_id: ticketId,
      assigned_by_id: headOfUnitId,
      assigned_to_id: previousAssignment.assigned_to_id,
      assigned_to_role: previousAssignment.assigned_to_role,
      action: 'Reversed to Previous Step',
      reason: reason || 'Head of Unit reversed ticket',
      created_at: new Date()
    });
    
    return {
      ticket,
      reversedTo: previousAssignment
    };
  },
  
  // Attend and close ticket (for final step)
  attendAndClose: async (ticketId, headOfUnitId, resolutionType, resolutionDetails, attachment = null) => {
    const ticket = await Ticket.findByPk(ticketId);
    if (!ticket) {
      throw new Error('Ticket not found');
    }
    
    // Update ticket status to closed
    await ticket.update({
      status: 'Closed',
      resolution_type: resolutionType,
      resolution_details: resolutionDetails,
      date_of_resolution: new Date(),
      attended_by_id: headOfUnitId
    });
    
    // Create closure record
    await TicketAssignment.create({
      ticket_id: ticketId,
      assigned_by_id: headOfUnitId,
      assigned_to_id: headOfUnitId,
      assigned_to_role: 'supervisor',
      action: 'Attended and Closed',
      reason: `Resolution: ${resolutionType} - ${resolutionDetails}`,
      created_at: new Date()
    });
    
    return {
      ticket,
      closedBy: headOfUnitId,
      resolutionType,
      resolutionDetails
    };
  }
};

/**
 * ATTENDEE ACTIONS (Step 3)
 * Actions: attend and recommend
 */
const attendeeActions = {
  // Attend and recommend action
  attendAndRecommend: async (ticketId, attendeeId, recommendation, justification = '') => {
    const ticket = await Ticket.findByPk(ticketId);
    if (!ticket) {
      throw new Error('Ticket not found');
    }
    
    // Update ticket with recommendation
    await ticket.update({
      recommendation: recommendation,
      recommendation_details: justification,
      recommended_by_id: attendeeId,
      recommended_at: new Date()
    });
    
    // Create recommendation record
    await TicketAssignment.create({
      ticket_id: ticketId,
      assigned_by_id: attendeeId,
      assigned_to_id: attendeeId,
      assigned_to_role: 'attendee',
      action: 'Attended and Recommended',
      reason: `Recommendation: ${recommendation} - ${justification}`,
      created_at: new Date()
    });
    
    return {
      ticket,
      recommendation,
      justification
    };
  }
};

/**
 * Determine next role based on current role and complaint type
 * This works with the existing ticket assignment system
 */
const getNextRoleByCurrentRole = (currentRole, complaintType, unitName) => {
  console.log(`\n=== Determining next role for current role: "${currentRole}", complaint type: "${complaintType}", unit: "${unitName}" ===`);
  
  let nextRole = null;
  
  switch (currentRole) {
    case 'coordinator':
      // Coordinator rates and assigns to next role
      if (complaintType === 'Minor') {
        if (unitName && unitName.toLowerCase().includes('directorate')) {
          nextRole = 'director-general';
        } else {
          nextRole = 'supervisor'; // Head of Unit
        }
      } else if (complaintType === 'Major') {
        if (unitName && unitName.toLowerCase().includes('directorate')) {
          nextRole = 'director-general';
        } else {
          nextRole = 'supervisor'; // Head of Unit first
        }
      }
      break;
      
    case 'supervisor': // Head of Unit
      // Head of Unit can assign to attendee or close (for minor complaints)
      if (complaintType === 'Minor') {
        // For minor complaints, Head of Unit can assign to attendee or close directly
        nextRole = 'attendee'; // Default to attendee
      } else if (complaintType === 'Major') {
        // For major complaints, Head of Unit assigns to attendee first
        nextRole = 'attendee';
      }
      break;
      
    case 'attendee':
      // Attendee recommends back to Head of Unit or DG
      if (complaintType === 'Minor') {
        nextRole = 'supervisor'; // Back to Head of Unit for closure
      } else if (complaintType === 'Major') {
        if (unitName && unitName.toLowerCase().includes('directorate')) {
          nextRole = 'director-general'; // For directorate, go to DG
        } else {
          nextRole = 'supervisor'; // Back to Head of Unit first
        }
      }
      break;
      
    case 'director-general':
      // DG can close or assign back to supervisor
      if (complaintType === 'Minor') {
        nextRole = 'supervisor'; // Back to Head of Unit
      } else if (complaintType === 'Major') {
        // DG can close major complaints
        nextRole = null; // No next role, can close
      }
      break;
      
    default:
      nextRole = null;
  }
  
  console.log(`Next role determined: "${nextRole}"`);
  return nextRole;
};

/**
 * Assign ticket to next role in the workflow
 * This works with the existing ticket assignment system
 */
const assignToNextRole = async (ticketId, currentUserId, justification = '') => {
  const ticket = await Ticket.findByPk(ticketId);
  if (!ticket) {
    throw new Error('Ticket not found');
  }
  
  const currentRole = ticket.assigned_to_role;
  const nextRole = getNextRoleByCurrentRole(currentRole, ticket.complaint_type, ticket.responsible_unit_name);
  
  if (!nextRole) {
    throw new Error('No next role in workflow or ticket can be closed');
  }
  
  // Get available users for the next role (with fallback)
  const availableUsers = await getAvailableUsers(nextRole, ticket.responsible_unit_name);
  
  if (availableUsers.length === 0) {
    throw new Error(`No users available for role: ${nextRole} or any fallback roles`);
  }
  
  const nextAssignee = availableUsers[0];
  const actualRole = nextAssignee.role;
  
  // Update ticket
  await ticket.update({
    assigned_to_id: nextAssignee.id,
    assigned_to_role: actualRole,
    status: 'Assigned'
  });
  
  // Create assignment record
  await TicketAssignment.create({
    ticket_id: ticketId,
    assigned_by_id: currentUserId,
    assigned_to_id: nextAssignee.id,
    assigned_to_role: actualRole,
    action: 'Assigned to Next Role',
    reason: justification || `Assigned to ${actualRole}`,
    created_at: new Date()
  });
  
  return {
    ticket,
    nextAssignee,
    nextRole: actualRole
  };
};

module.exports = {
  WORKFLOW_PATHS,
  determineWorkflowPath,
  getNextRole,
  getAvailableUsers,
  assignToNextInWorkflow,
  handleComplaintRating,
  handleComplaintToInquiry,
  getWorkflowStatus,
  getNextRoleByCurrentRole,
  assignToNextRole
}; 