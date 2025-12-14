/**
 * Permissions Configuration
 * Maps to exact workflow requirements specified by the user
 */

// Workflow Paths
const WORKFLOW_PATHS = {
  MINOR_UNIT: 'MINOR_UNIT',
  MINOR_DIRECTORATE: 'MINOR_DIRECTORATE', 
  MAJOR_UNIT: 'MAJOR_UNIT',
  MAJOR_DIRECTORATE: 'MAJOR_DIRECTORATE'
};

// Workflow Stages
const WORKFLOW_STAGES = {
  // Minor Unit Workflow
  MINOR_UNIT: {
    INITIAL: 'initial',
    COORDINATOR_REVIEW: 'coordinator_review',
    HEAD_OF_UNIT_REVIEW: 'head_of_unit_review',
    ATTENDEE_PROCESSING: 'attendee_processing',
    HEAD_OF_UNIT_FINAL: 'head_of_unit_final',
    CLOSED: 'closed'
  },
  
  // Minor Directorate Workflow
  MINOR_DIRECTORATE: {
    INITIAL: 'initial',
    COORDINATOR_REVIEW: 'coordinator_review',
    DIRECTOR_REVIEW: 'director_review',
    MANAGER_REVIEW: 'manager_review',
    ATTENDEE_PROCESSING: 'attendee_processing',
    MANAGER_FINAL: 'manager_final',
    DIRECTOR_FINAL: 'director_final',
    CLOSED: 'closed'
  },
  
  // Major Unit Workflow
  MAJOR_UNIT: {
    INITIAL: 'initial',
    COORDINATOR_REVIEW: 'coordinator_review',
    HEAD_OF_UNIT_REVIEW: 'head_of_unit_review',
    ATTENDEE_PROCESSING: 'attendee_processing',
    HEAD_OF_UNIT_FINAL: 'head_of_unit_final',
    DG_APPROVAL: 'dg_approval',
    CLOSED: 'closed'
  },
  
  // Major Directorate Workflow
  MAJOR_DIRECTORATE: {
    INITIAL: 'initial',
    COORDINATOR_REVIEW: 'coordinator_review',
    DIRECTOR_REVIEW: 'director_review',
    MANAGER_REVIEW: 'manager_review',
    ATTENDEE_PROCESSING: 'attendee_processing',
    MANAGER_FINAL: 'manager_final',
    DIRECTOR_FINAL: 'director_final',
    DG_APPROVAL: 'dg_approval',
    CLOSED: 'closed'
  }
};

// Role Hierarchy and Permissions
const ROLE_PERMISSIONS = {
  // 1. Agent - Entry point for all tickets
  'agent': {
    description: 'Creates tickets and assigns to Coordinator',
    allowed_actions: ['create_ticket', 'view_ticket', 'view_dashboard'],
    workflow_access: ['initial'],
    can_assign_to: ['coordinator'],
    can_create: ['Complaint', 'Suggestion', 'Compliment', 'Inquiry'],
    restrictions: {
      cannot_rate: true,
      cannot_change_type: true,
      cannot_assign_beyond: 'coordinator'
    }
  },

  // 2. Coordinator - Rates complaints and determines workflow path
  'coordinator': {
    description: 'Rates complaints (minor/major) and assigns to appropriate workflow path',
    allowed_actions: [
      'view_ticket', 'rate_complaint', 'change_type', 'assign_ticket',
      'view_dashboard', 'view_reports', 'convert_to_inquiry'
    ],
    workflow_access: ['coordinator_review'],
    can_assign_to: ['head-of-unit', 'director'],
    can_rate: ['minor', 'major'],
    can_change_type: ['Complaint', 'Suggestion', 'Compliment', 'Inquiry'],
    workflow_paths: {
      'minor': ['MINOR_UNIT', 'MINOR_DIRECTORATE'],
      'major': ['MAJOR_UNIT', 'MAJOR_DIRECTORATE']
    },
    restrictions: {
      cannot_attend: true,
      cannot_close: true,
      cannot_reverse_beyond: 'agent'
    }
  },

  // 3. Head of Unit - Handles Minor Unit workflow
  'head-of-unit': {
    description: 'Handles Minor Unit workflow - assign, reverse, attend, close',
    allowed_actions: [
      'view_ticket', 'assign_ticket', 'reverse_ticket', 'attend_ticket',
      'close_ticket', 'view_dashboard', 'view_reports'
    ],
    workflow_access: ['head_of_unit_review', 'head_of_unit_final'],
    can_assign_to: ['attendee'],
    can_reverse_to: ['coordinator'],
    can_close: ['MINOR_UNIT'],
    workflow_paths: ['MINOR_UNIT'],
    restrictions: {
      cannot_rate: true,
      cannot_change_type: true,
      cannot_upload_evidence: true
    }
  },

  // 4. Director - Handles Minor Directorate workflow
  'director': {
    description: 'Handles Minor Directorate workflow - assign, reverse, review, recommend to DG',
    allowed_actions: [
      'view_ticket', 'assign_ticket', 'reverse_ticket', 'review',
      'upload_evidence', 'recommend', 'view_dashboard', 'view_reports'
    ],
    workflow_access: ['director_review', 'director_final'],
    can_assign_to: ['manager'],
    can_reverse_to: ['coordinator', 'manager'],
    can_recommend_to: ['director-general'],
    workflow_paths: ['MINOR_DIRECTORATE'],
    restrictions: {
      cannot_attend: true,
      cannot_close: true
    }
  },

  // 5. Manager - Intermediate in Directorate workflow
  'manager': {
    description: 'Handles intermediate Directorate workflow - assign, reverse, attend, recommend',
    allowed_actions: [
      'view_ticket', 'assign_ticket', 'reverse_ticket', 'attend_ticket',
      'upload_evidence', 'recommend', 'view_dashboard'
    ],
    workflow_access: ['manager_review', 'manager_final'],
    can_assign_to: ['attendee'],
    can_reverse_to: ['director', 'attendee'],
    can_recommend_to: ['director'],
    workflow_paths: ['MINOR_DIRECTORATE', 'MAJOR_DIRECTORATE'],
    restrictions: {
      cannot_rate: true,
      cannot_change_type: true,
      cannot_close: true
    }
  },

  // 6. Attendee - Handles ticket processing
  'attendee': {
    description: 'Attends tickets, uploads evidence, and recommends to next level',
    allowed_actions: [
      'view_ticket', 'attend_ticket', 'upload_evidence', 'recommend',
      'view_dashboard'
    ],
    workflow_access: ['attendee_processing'],
    can_recommend_to: ['head-of-unit', 'manager'],
    can_reverse_to: ['manager'],
    workflow_paths: ['MINOR_UNIT', 'MINOR_DIRECTORATE', 'MAJOR_UNIT', 'MAJOR_DIRECTORATE'],
    restrictions: {
      cannot_rate: true,
      cannot_change_type: true,
      cannot_assign: true,
      cannot_close: true
    }
  },

  // 7. Director General - Final approval for Major complaints
  'director-general': {
    description: 'Final approval authority - can approve, close, or reverse to previous levels',
    allowed_actions: [
      'view_ticket', 'review', 'approve', 'close_ticket', 'reverse_ticket',
      'view_dashboard', 'view_reports'
    ],
    workflow_access: ['dg_approval'],
    can_reverse_to: ['head-of-unit', 'director'],
    can_close: ['MINOR_UNIT', 'MINOR_DIRECTORATE', 'MAJOR_UNIT', 'MAJOR_DIRECTORATE'],
    workflow_paths: ['MINOR_UNIT', 'MINOR_DIRECTORATE', 'MAJOR_UNIT', 'MAJOR_DIRECTORATE'],
    restrictions: {
      cannot_rate: true,
      cannot_change_type: true,
      cannot_assign: true,
      cannot_attend: true
    }
  },

  // 8. Focal Person - Specialized handling
  'focal-person': {
    description: 'Specialized ticket handling for specific sections',
    allowed_actions: [
      'view_ticket', 'assign_ticket', 'attend_ticket', 'view_dashboard'
    ],
    workflow_access: ['focal_person_review'],
    can_assign_to: ['attendee'],
    workflow_paths: ['MINOR_UNIT', 'MINOR_DIRECTORATE'],
    restrictions: {
      cannot_rate: true,
      cannot_change_type: true,
      cannot_close: true
    }
  },

  // 9. Supervisor - Oversight role
  'supervisor': {
    description: 'Oversight and assignment capabilities',
    allowed_actions: [
      'view_ticket', 'view_dashboard', 'view_reports', 'assign_ticket'
    ],
    workflow_access: ['supervisor_oversight'],
    can_assign_to: ['agent', 'attendee'],
    workflow_paths: ['MINOR_UNIT', 'MINOR_DIRECTORATE', 'MAJOR_UNIT', 'MAJOR_DIRECTORATE'],
    restrictions: {
      cannot_rate: true,
      cannot_change_type: true,
      cannot_attend: true,
      cannot_close: true
    }
  },

  // 10. Admin - System management
  'admin': {
    description: 'System administration capabilities',
    allowed_actions: [
      'view_ticket', 'edit_ticket', 'view_dashboard', 'view_reports',
      'manage_users', 'manage_system'
    ],
    workflow_access: ['all'],
    can_assign_to: ['agent', 'attendee', 'coordinator'],
    workflow_paths: ['MINOR_UNIT', 'MINOR_DIRECTORATE', 'MAJOR_UNIT', 'MAJOR_DIRECTORATE'],
    restrictions: {
      cannot_rate: true,
      cannot_change_type: true,
      cannot_attend: true,
      cannot_close: true
    }
  },

  // 11. Super Admin - Full system access
  'super-admin': {
    description: 'Full system access and control',
    allowed_actions: [
      'create_ticket', 'view_ticket', 'edit_ticket', 'delete_ticket',
      'rate_complaint', 'change_type', 'assign_ticket', 'reverse_ticket',
      'attend_ticket', 'recommend', 'review', 'upload_evidence',
      'approve', 'close_ticket', 'manage_users', 'view_dashboard',
      'view_reports', 'manage_system'
    ],
    workflow_access: ['all'],
    can_assign_to: ['agent', 'attendee', 'coordinator', 'head-of-unit', 'director', 'manager', 'focal-person'],
    can_rate: ['minor', 'major'],
    can_change_type: ['Complaint', 'Suggestion', 'Compliment', 'Inquiry'],
    can_reverse_to: ['agent', 'coordinator', 'head-of-unit', 'director', 'manager'],
    can_recommend_to: ['head-of-unit', 'manager', 'director', 'director-general'],
    can_close: ['MINOR_UNIT', 'MINOR_DIRECTORATE', 'MAJOR_UNIT', 'MAJOR_DIRECTORATE'],
    workflow_paths: ['MINOR_UNIT', 'MINOR_DIRECTORATE', 'MAJOR_UNIT', 'MAJOR_DIRECTORATE'],
    restrictions: {
      none: true
    }
  }
};

// Workflow Rules and Transitions
const WORKFLOW_RULES = {
  // Minor Unit Workflow
  MINOR_UNIT: {
    flow: [
      { from: 'agent', to: 'coordinator', action: 'create_ticket' },
      { from: 'coordinator', to: 'head-of-unit', action: 'assign_ticket', condition: 'minor_complaint' },
      { from: 'head-of-unit', to: 'attendee', action: 'assign_ticket' },
      { from: 'attendee', to: 'head-of-unit', action: 'recommend' },
      { from: 'head-of-unit', to: 'closed', action: 'close_ticket' }
    ],
    reverse_rules: [
      { from: 'head-of-unit', to: 'coordinator', allowed: true },
      { from: 'attendee', to: 'head-of-unit', allowed: true }
    ]
  },

  // Minor Directorate Workflow
  MINOR_DIRECTORATE: {
    flow: [
      { from: 'agent', to: 'coordinator', action: 'create_ticket' },
      { from: 'coordinator', to: 'director', action: 'assign_ticket', condition: 'minor_complaint' },
      { from: 'director', to: 'manager', action: 'assign_ticket' },
      { from: 'manager', to: 'attendee', action: 'assign_ticket' },
      { from: 'attendee', to: 'manager', action: 'recommend' },
      { from: 'manager', to: 'director', action: 'recommend' },
      { from: 'director', to: 'director-general', action: 'recommend' },
      { from: 'director-general', to: 'closed', action: 'close_ticket' }
    ],
    reverse_rules: [
      { from: 'director', to: 'coordinator', allowed: true },
      { from: 'manager', to: 'director', allowed: true },
      { from: 'attendee', to: 'manager', allowed: true }
    ]
  },

  // Major Unit Workflow
  MAJOR_UNIT: {
    flow: [
      { from: 'agent', to: 'coordinator', action: 'create_ticket' },
      { from: 'coordinator', to: 'head-of-unit', action: 'assign_ticket', condition: 'major_complaint' },
      { from: 'head-of-unit', to: 'attendee', action: 'assign_ticket' },
      { from: 'attendee', to: 'head-of-unit', action: 'recommend' },
      { from: 'head-of-unit', to: 'director-general', action: 'recommend' },
      { from: 'director-general', to: 'closed', action: 'close_ticket' }
    ],
    reverse_rules: [
      { from: 'head-of-unit', to: 'coordinator', allowed: true },
      { from: 'attendee', to: 'head-of-unit', allowed: true },
      { from: 'director-general', to: 'head-of-unit', allowed: true }
    ]
  },

  // Major Directorate Workflow
  MAJOR_DIRECTORATE: {
    flow: [
      { from: 'agent', to: 'coordinator', action: 'create_ticket' },
      { from: 'coordinator', to: 'director', action: 'assign_ticket', condition: 'major_complaint' },
      { from: 'director', to: 'manager', action: 'assign_ticket' },
      { from: 'manager', to: 'attendee', action: 'assign_ticket' },
      { from: 'attendee', to: 'manager', action: 'recommend' },
      { from: 'manager', to: 'director', action: 'recommend' },
      { from: 'director', to: 'director-general', action: 'recommend' },
      { from: 'director-general', to: 'closed', action: 'close_ticket' }
    ],
    reverse_rules: [
      { from: 'director', to: 'coordinator', allowed: true },
      { from: 'manager', to: 'director', allowed: true },
      { from: 'attendee', to: 'manager', allowed: true },
      { from: 'director-general', to: 'director', allowed: true }
    ]
  }
};

// Validation Rules
const VALIDATION_RULES = {
  // Complaint Rating Rules
  complaint_rating: {
    coordinator_only: true,
    allowed_ratings: ['minor', 'major'],
    required_fields: ['rating_type', 'justification']
  },

  // Workflow Assignment Rules
  workflow_assignment: {
    coordinator: {
      minor_complaint: ['MINOR_UNIT', 'MINOR_DIRECTORATE'],
      major_complaint: ['MAJOR_UNIT', 'MAJOR_DIRECTORATE']
    }
  },

  // Evidence Upload Rules
  evidence_upload: {
    required_for: ['MAJOR_UNIT', 'MAJOR_DIRECTORATE'],
    allowed_roles: ['head-of-unit', 'attendee', 'manager', 'director'],
    file_types: ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png'],
    max_size: '10MB'
  },

  // Closing Rules
  closing_rules: {
    MINOR_UNIT: ['head-of-unit'],
    MINOR_DIRECTORATE: ['director-general'],
    MAJOR_UNIT: ['director-general'],
    MAJOR_DIRECTORATE: ['director-general']
  }
};

module.exports = {
  WORKFLOW_PATHS,
  WORKFLOW_STAGES,
  ROLE_PERMISSIONS,
  WORKFLOW_RULES,
  VALIDATION_RULES
}; 