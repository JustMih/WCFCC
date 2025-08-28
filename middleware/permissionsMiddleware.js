const { Op } = require('sequelize');
const Ticket = require('../models/Ticket');
const User = require('../models/User');

/**
 * Comprehensive Role-Based Permissions Middleware
 * Enforces workflow rules and actions based on user roles
 */

// Define all available actions in the system
const ACTIONS = {
  // Ticket Management
  CREATE_TICKET: 'create_ticket',
  VIEW_TICKET: 'view_ticket',
  EDIT_TICKET: 'edit_ticket',
  DELETE_TICKET: 'delete_ticket',
  
  // Workflow Actions
  RATE_COMPLAINT: 'rate_complaint',
  CHANGE_TYPE: 'change_type',
  ASSIGN_TICKET: 'assign_ticket',
  REVERSE_TICKET: 'reverse_ticket',
  ATTEND_TICKET: 'attend_ticket',
  RECOMMEND: 'recommend',
  REVIEW: 'review',
  UPLOAD_EVIDENCE: 'upload_evidence',
  APPROVE: 'approve',
  CLOSE_TICKET: 'close_ticket',
  
  // Administrative Actions
  MANAGE_USERS: 'manage_users',
  VIEW_DASHBOARD: 'view_dashboard',
  VIEW_REPORTS: 'view_reports',
  MANAGE_SYSTEM: 'manage_system'
};

// Define role permissions based on workflow requirements
const ROLE_PERMISSIONS = {
  // Agent - Entry point for all tickets
  'agent': {
    actions: [
      ACTIONS.CREATE_TICKET,
      ACTIONS.VIEW_TICKET,
      ACTIONS.VIEW_DASHBOARD
    ],
    workflow_stages: ['initial'],
    can_assign_to: ['reviewer'],
    description: 'Can create tickets and assign to reviewer'
  },

      // Reviewer - Rates complaints and determines workflow path
    'reviewer': {
    actions: [
      ACTIONS.VIEW_TICKET,
      ACTIONS.RATE_COMPLAINT,
      ACTIONS.CHANGE_TYPE,
      ACTIONS.ASSIGN_TICKET,
      ACTIONS.VIEW_DASHBOARD,
      ACTIONS.VIEW_REPORTS
    ],
          workflow_stages: ['reviewer_review'],
    can_assign_to: ['head-of-unit', 'director'],
    can_rate: ['minor', 'major'],
    description: 'Can rate complaints and assign to appropriate workflow path'
  },

  // Head of Unit - Handles Minor Unit workflow
  'head-of-unit': {
    actions: [
      ACTIONS.VIEW_TICKET,
      ACTIONS.ASSIGN_TICKET,
      ACTIONS.REVERSE_TICKET,
      ACTIONS.ATTEND_TICKET,
      ACTIONS.CLOSE_TICKET,
      ACTIONS.VIEW_DASHBOARD,
      ACTIONS.VIEW_REPORTS
    ],
    workflow_stages: ['head_of_unit_review', 'head_of_unit_final'],
    can_assign_to: ['attendee'],
          can_reverse_to: ['reviewer'],
    can_close: ['MINOR_UNIT'],
    description: 'Can handle Minor Unit workflow - assign, reverse, attend, close'
  },

  // Director - Handles Minor Directorate workflow
  'director': {
    actions: [
      ACTIONS.VIEW_TICKET,
      ACTIONS.ASSIGN_TICKET,
      ACTIONS.REVERSE_TICKET,
      ACTIONS.REVIEW,
      ACTIONS.UPLOAD_EVIDENCE,
      ACTIONS.RECOMMEND,
      ACTIONS.VIEW_DASHBOARD,
      ACTIONS.VIEW_REPORTS
    ],
    workflow_stages: ['director_review', 'director_final'],
    can_assign_to: ['manager'],
          can_reverse_to: ['reviewer', 'manager'],
    can_recommend_to: ['director-general'],
    description: 'Can handle Minor Directorate workflow - assign, reverse, review, recommend to DG'
  },

  // Manager - Intermediate in Directorate workflow
  'manager': {
    actions: [
      ACTIONS.VIEW_TICKET,
      ACTIONS.ASSIGN_TICKET,
      ACTIONS.REVERSE_TICKET,
      ACTIONS.ATTEND_TICKET,
      ACTIONS.UPLOAD_EVIDENCE,
      ACTIONS.RECOMMEND,
      ACTIONS.VIEW_DASHBOARD
    ],
    workflow_stages: ['manager_review', 'manager_final'],
    can_assign_to: ['attendee'],
    can_reverse_to: ['director', 'attendee'],
    can_recommend_to: ['director'],
    description: 'Can handle intermediate Directorate workflow - assign, reverse, attend, recommend'
  },

  // Attendee - Handles ticket processing
  'attendee': {
    actions: [
      ACTIONS.VIEW_TICKET,
      ACTIONS.ATTEND_TICKET,
      ACTIONS.UPLOAD_EVIDENCE,
      ACTIONS.RECOMMEND,
      ACTIONS.VIEW_DASHBOARD
    ],
    workflow_stages: ['attendee_processing'],
    can_recommend_to: ['head-of-unit', 'manager'],
    can_reverse_to: ['manager'],
    description: 'Can attend tickets, upload evidence, and recommend to next level'
  },

  // Director General - Final approval for Major complaints
  'director-general': {
    actions: [
      ACTIONS.VIEW_TICKET,
      ACTIONS.REVIEW,
      ACTIONS.APPROVE,
      ACTIONS.CLOSE_TICKET,
      ACTIONS.REVERSE_TICKET,
      ACTIONS.VIEW_DASHBOARD,
      ACTIONS.VIEW_REPORTS
    ],
    workflow_stages: ['dg_approval'],
    can_reverse_to: ['head-of-unit', 'director'],
    can_close: ['MINOR_UNIT', 'MINOR_DIRECTORATE', 'MAJOR_UNIT', 'MAJOR_DIRECTORATE'],
    description: 'Final approval authority - can approve, close, or reverse to previous levels'
  },

  // Focal Person - Specialized handling
  'focal-person': {
    actions: [
      ACTIONS.VIEW_TICKET,
      ACTIONS.ASSIGN_TICKET,
      ACTIONS.ATTEND_TICKET,
      ACTIONS.VIEW_DASHBOARD
    ],
    workflow_stages: ['focal_person_review'],
    can_assign_to: ['attendee'],
    description: 'Specialized ticket handling for specific sections'
  },

  // Supervisor - Oversight role
  'supervisor': {
    actions: [
      ACTIONS.VIEW_TICKET,
      ACTIONS.VIEW_DASHBOARD,
      ACTIONS.VIEW_REPORTS,
      ACTIONS.ASSIGN_TICKET
    ],
    workflow_stages: ['supervisor_oversight'],
    can_assign_to: ['agent', 'attendee'],
    description: 'Oversight and assignment capabilities'
  },

  // Admin - System management
  'admin': {
    actions: [
      ACTIONS.VIEW_TICKET,
      ACTIONS.EDIT_TICKET,
      ACTIONS.VIEW_DASHBOARD,
      ACTIONS.VIEW_REPORTS,
      ACTIONS.MANAGE_USERS
    ],
    workflow_stages: ['all'],
    description: 'System administration capabilities'
  },

  // Super Admin - Full system access
  'super-admin': {
    actions: Object.values(ACTIONS),
    workflow_stages: ['all'],
    description: 'Full system access and control'
  }
};

/**
 * Check if user can perform specific action
 */
const canPerformAction = (userRole, action) => {
  const rolePerms = ROLE_PERMISSIONS[userRole];
  if (!rolePerms) return false;
  return rolePerms.actions.includes(action);
};

/**
 * Check if user can assign to specific role
 */
const canAssignToRole = (userRole, targetRole) => {
  const rolePerms = ROLE_PERMISSIONS[userRole];
  if (!rolePerms || !rolePerms.can_assign_to) return false;
  return rolePerms.can_assign_to.includes(targetRole);
};

/**
 * Check if user can reverse to specific role
 */
const canReverseToRole = (userRole, targetRole) => {
  const rolePerms = ROLE_PERMISSIONS[userRole];
  if (!rolePerms || !rolePerms.can_reverse_to) return false;
  return rolePerms.can_reverse_to.includes(targetRole);
};

/**
 * Check if user can recommend to specific role
 */
const canRecommendToRole = (userRole, targetRole) => {
  const rolePerms = ROLE_PERMISSIONS[userRole];
  if (!rolePerms || !rolePerms.can_recommend_to) return false;
  return rolePerms.can_recommend_to.includes(targetRole);
};

/**
 * Check if user can close specific workflow types
 */
const canCloseWorkflow = (userRole, workflowPath) => {
  const rolePerms = ROLE_PERMISSIONS[userRole];
  if (!rolePerms || !rolePerms.can_close) return false;
  return rolePerms.can_close.includes(workflowPath);
};

/**
 * Check if user can rate complaints
 */
const canRateComplaint = (userRole) => {
  const rolePerms = ROLE_PERMISSIONS[userRole];
  if (!rolePerms || !rolePerms.can_rate) return false;
  return true;
};

/**
 * Check if user can access specific workflow stage
 */
const canAccessWorkflowStage = (userRole, workflowStage) => {
  const rolePerms = ROLE_PERMISSIONS[userRole];
  if (!rolePerms) return false;
  if (rolePerms.workflow_stages.includes('all')) return true;
  return rolePerms.workflow_stages.includes(workflowStage);
};

/**
 * Main permissions middleware
 */
const permissionsMiddleware = (requiredAction) => {
  return async (req, res, next) => {
    try {
      const userRole = req.user.role;
      
      // Check if user can perform the required action
      if (!canPerformAction(userRole, requiredAction)) {
        return res.status(403).json({
          success: false,
          message: `Permission denied. Role '${userRole}' cannot perform action '${requiredAction}'`,
          requiredAction,
          userRole,
          allowedActions: ROLE_PERMISSIONS[userRole]?.actions || []
        });
      }

      // Add permissions helper to request object
      req.permissions = {
        canPerformAction: (action) => canPerformAction(userRole, action),
        canAssignToRole: (targetRole) => canAssignToRole(userRole, targetRole),
        canReverseToRole: (targetRole) => canReverseToRole(userRole, targetRole),
        canRecommendToRole: (targetRole) => canRecommendToRole(userRole, targetRole),
        canCloseWorkflow: (workflowPath) => canCloseWorkflow(userRole, workflowPath),
        canRateComplaint: () => canRateComplaint(userRole),
        canAccessWorkflowStage: (stage) => canAccessWorkflowStage(userRole, stage),
        userRole,
        availableActions: ROLE_PERMISSIONS[userRole]?.actions || [],
        description: ROLE_PERMISSIONS[userRole]?.description || 'No description available'
      };

      next();
    } catch (error) {
      console.error('Permissions middleware error:', error);
      return res.status(500).json({
        success: false,
        message: 'Error checking permissions',
        error: error.message
      });
    }
  };
};

/**
 * Workflow-specific permissions middleware
 */
const workflowPermissionsMiddleware = (requiredWorkflowStage) => {
  return async (req, res, next) => {
    try {
      const userRole = req.user.role;
      
      if (!canAccessWorkflowStage(userRole, requiredWorkflowStage)) {
        return res.status(403).json({
          success: false,
          message: `Access denied to workflow stage '${requiredWorkflowStage}' for role '${userRole}'`,
          requiredStage: requiredWorkflowStage,
          userRole,
          allowedStages: ROLE_PERMISSIONS[userRole]?.workflow_stages || []
        });
      }

      next();
    } catch (error) {
      console.error('Workflow permissions middleware error:', error);
      return res.status(500).json({
        success: false,
        message: 'Error checking workflow permissions',
        error: error.message
      });
    }
  };
};

/**
 * Role assignment validation middleware
 */
const roleAssignmentMiddleware = (targetRoleField = 'assignedToRole') => {
  return async (req, res, next) => {
    try {
      const userRole = req.user.role;
      const targetRole = req.body[targetRoleField];
      
      if (!targetRole) {
        return res.status(400).json({
          success: false,
          message: `Missing required field: ${targetRoleField}`
        });
      }

      if (!canAssignToRole(userRole, targetRole)) {
        return res.status(403).json({
          success: false,
          message: `Role '${userRole}' cannot assign tickets to role '${targetRole}'`,
          userRole,
          targetRole,
          allowedAssignments: ROLE_PERMISSIONS[userRole]?.can_assign_to || []
        });
      }

      next();
    } catch (error) {
      console.error('Role assignment middleware error:', error);
      return res.status(500).json({
        success: false,
        message: 'Error validating role assignment',
        error: error.message
      });
    }
  };
};

/**
 * Workflow action validation middleware
 */
const workflowActionMiddleware = (requiredAction, workflowPathField = 'workflow_path') => {
  return async (req, res, next) => {
    try {
      const userRole = req.user.role;
      const workflowPath = req.body[workflowPathField] || req.params[workflowPathField];
      
      // Check if user can perform the action
      if (!canPerformAction(userRole, requiredAction)) {
        return res.status(403).json({
          success: false,
          message: `Role '${userRole}' cannot perform action '${requiredAction}'`,
          userRole,
          requiredAction,
          allowedActions: ROLE_PERMISSIONS[userRole]?.actions || []
        });
      }

      // For specific actions, check workflow path restrictions
      if (requiredAction === ACTIONS.CLOSE_TICKET && workflowPath) {
        if (!canCloseWorkflow(userRole, workflowPath)) {
          return res.status(403).json({
            success: false,
            message: `Role '${userRole}' cannot close workflow type '${workflowPath}'`,
            userRole,
            workflowPath,
            allowedWorkflows: ROLE_PERMISSIONS[userRole]?.can_close || []
          });
        }
      }

      next();
    } catch (error) {
      console.error('Workflow action middleware error:', error);
      return res.status(500).json({
        success: false,
        message: 'Error validating workflow action',
        error: error.message
      });
    }
  };
};

module.exports = {
  permissionsMiddleware,
  workflowPermissionsMiddleware,
  roleAssignmentMiddleware,
  workflowActionMiddleware,
  ACTIONS,
  ROLE_PERMISSIONS,
  canPerformAction,
  canAssignToRole,
  canReverseToRole,
  canRecommendToRole,
  canCloseWorkflow,
  canRateComplaint,
  canAccessWorkflowStage
}; 