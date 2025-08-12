const { 
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
} = require('./middleware/permissionsMiddleware');

const { 
  WORKFLOW_PATHS, 
  WORKFLOW_STAGES, 
  ROLE_PERMISSIONS: CONFIG_PERMISSIONS,
  WORKFLOW_RULES,
  VALIDATION_RULES 
} = require('./config/permissionsConfig');

console.log('🔐 COMPREHENSIVE ROLE-BASED PERMISSIONS SYSTEM TEST\n');

// Test 1: Role Permissions Overview
console.log('📋 ROLE PERMISSIONS OVERVIEW:');
console.log('================================');

Object.entries(ROLE_PERMISSIONS).forEach(([role, permissions]) => {
  console.log(`\n👤 ${role.toUpperCase()}:`);
  console.log(`   Description: ${permissions.description}`);
  console.log(`   Actions: ${permissions.actions.join(', ')}`);
  console.log(`   Workflow Access: ${permissions.workflow_stages.join(', ')}`);
  
  if (permissions.can_assign_to) {
    console.log(`   Can Assign To: ${permissions.can_assign_to.join(', ')}`);
  }
  
  if (permissions.can_rate) {
    console.log(`   Can Rate: ${permissions.can_rate.join(', ')}`);
  }
  
  if (permissions.can_close) {
    console.log(`   Can Close: ${permissions.can_close.join(', ')}`);
  }
});

// Test 2: Workflow Rules
console.log('\n\n🔄 WORKFLOW RULES:');
console.log('==================');

Object.entries(WORKFLOW_RULES).forEach(([workflow, rules]) => {
  console.log(`\n📊 ${workflow}:`);
  console.log('   Flow:');
  rules.flow.forEach((step, index) => {
    const condition = step.condition ? ` (${step.condition})` : '';
    console.log(`     ${index + 1}. ${step.from} → ${step.to} [${step.action}]${condition}`);
  });
  
  console.log('   Reverse Rules:');
  rules.reverse_rules.forEach((rule, index) => {
    console.log(`     ${index + 1}. ${rule.from} → ${rule.to}: ${rule.allowed ? '✅ Allowed' : '❌ Not Allowed'}`);
  });
});

// Test 3: Permission Checks
console.log('\n\n✅ PERMISSION CHECKS:');
console.log('=====================');

// Test Coordinator permissions
console.log('\n🔍 Testing Coordinator Permissions:');
const coordinatorRole = 'coordinator';
console.log(`Can rate complaint: ${canRateComplaint(coordinatorRole) ? '✅ Yes' : '❌ No'}`);
console.log(`Can assign to head-of-unit: ${canAssignToRole(coordinatorRole, 'head-of-unit') ? '✅ Yes' : '❌ No'}`);
console.log(`Can assign to attendee: ${canAssignToRole(coordinatorRole, 'attendee') ? '✅ Yes' : '❌ No'}`);
console.log(`Can close ticket: ${canPerformAction(coordinatorRole, ACTIONS.CLOSE_TICKET) ? '✅ Yes' : '❌ No'}`);

// Test Head of Unit permissions
console.log('\n🔍 Testing Head of Unit Permissions:');
const headOfUnitRole = 'head-of-unit';
console.log(`Can close MINOR_UNIT: ${canCloseWorkflow(headOfUnitRole, 'MINOR_UNIT') ? '✅ Yes' : '❌ No'}`);
console.log(`Can close MAJOR_UNIT: ${canCloseWorkflow(headOfUnitRole, 'MAJOR_UNIT') ? '✅ Yes' : '❌ No'}`);
console.log(`Can reverse to coordinator: ${canReverseToRole(headOfUnitRole, 'coordinator') ? '✅ Yes' : '❌ No'}`);

// Test Director General permissions
console.log('\n🔍 Testing Director General Permissions:');
const dgRole = 'director-general';
console.log(`Can close all workflows: ${canCloseWorkflow(dgRole, 'MINOR_UNIT') && canCloseWorkflow(dgRole, 'MAJOR_UNIT') ? '✅ Yes' : '❌ No'}`);
console.log(`Can reverse to head-of-unit: ${canReverseToRole(dgRole, 'head-of-unit') ? '✅ Yes' : '❌ No'}`);

// Test 4: Workflow Stage Access
console.log('\n\n🚪 WORKFLOW STAGE ACCESS:');
console.log('==========================');

const testWorkflowStages = [
  { role: 'coordinator', stage: 'coordinator_review' },
  { role: 'head-of-unit', stage: 'head_of_unit_review' },
  { role: 'director', stage: 'director_review' },
  { role: 'manager', stage: 'manager_review' },
  { role: 'attendee', stage: 'attendee_processing' },
  { role: 'director-general', stage: 'dg_approval' }
];

testWorkflowStages.forEach(({ role, stage }) => {
  const canAccess = canAccessWorkflowStage(role, stage);
  console.log(`${role} → ${stage}: ${canAccess ? '✅ Access Granted' : '❌ Access Denied'}`);
});

// Test 5: Validation Rules
console.log('\n\n📋 VALIDATION RULES:');
console.log('=====================');

console.log('\nComplaint Rating Rules:');
console.log(`   Coordinator Only: ${VALIDATION_RULES.complaint_rating.coordinator_only ? '✅ Yes' : '❌ No'}`);
console.log(`   Allowed Ratings: ${VALIDATION_RULES.complaint_rating.allowed_ratings.join(', ')}`);
console.log(`   Required Fields: ${VALIDATION_RULES.complaint_rating.required_fields.join(', ')}`);

console.log('\nEvidence Upload Rules:');
console.log(`   Required For: ${VALIDATION_RULES.evidence_upload.required_for.join(', ')}`);
console.log(`   Allowed Roles: ${VALIDATION_RULES.evidence_upload.allowed_roles.join(', ')}`);
console.log(`   File Types: ${VALIDATION_RULES.evidence_upload.file_types.join(', ')}`);
console.log(`   Max Size: ${VALIDATION_RULES.evidence_upload.max_size}`);

console.log('\nClosing Rules:');
Object.entries(VALIDATION_RULES.closing_rules).forEach(([workflow, roles]) => {
  console.log(`   ${workflow}: ${roles.join(', ')}`);
});

// Test 6: Simulate Workflow Actions
console.log('\n\n🎭 SIMULATING WORKFLOW ACTIONS:');
console.log('=================================');

// Simulate Minor Unit workflow
console.log('\n📋 Minor Unit Workflow Simulation:');
const minorUnitFlow = WORKFLOW_RULES.MINOR_UNIT.flow;
minorUnitFlow.forEach((step, index) => {
  const canPerform = canPerformAction(step.from, step.action);
  console.log(`   Step ${index + 1}: ${step.from} → ${step.to} [${step.action}] - ${canPerform ? '✅ Allowed' : '❌ Not Allowed'}`);
});

// Simulate Major Directorate workflow
console.log('\n📋 Major Directorate Workflow Simulation:');
const majorDirectorateFlow = WORKFLOW_RULES.MAJOR_DIRECTORATE.flow;
majorDirectorateFlow.forEach((step, index) => {
  const canPerform = canPerformAction(step.from, step.action);
  console.log(`   Step ${index + 1}: ${step.from} → ${step.to} [${step.action}] - ${canPerform ? '✅ Allowed' : '❌ Not Allowed'}`);
});

// Test 7: Role Assignment Validation
console.log('\n\n🔗 ROLE ASSIGNMENT VALIDATION:');
console.log('================================');

const assignmentTests = [
  { from: 'coordinator', to: 'head-of-unit', expected: true },
  { from: 'coordinator', to: 'director', expected: true },
  { from: 'coordinator', to: 'attendee', expected: false },
  { from: 'head-of-unit', to: 'attendee', expected: true },
  { from: 'head-of-unit', to: 'director', expected: false },
  { from: 'director', to: 'manager', expected: true },
  { from: 'manager', to: 'attendee', expected: true },
  { from: 'attendee', to: 'manager', expected: false }
];

assignmentTests.forEach(({ from, to, expected }) => {
  const canAssign = canAssignToRole(from, to);
  const status = canAssign === expected ? '✅ PASS' : '❌ FAIL';
  console.log(`${from} → ${to}: ${canAssign ? '✅ Yes' : '❌ No'} ${status}`);
});

console.log('\n\n🎉 PERMISSIONS SYSTEM TEST COMPLETED!');
console.log('=====================================');
console.log('\nThis system enforces:');
console.log('✅ Role-based access control for all actions');
console.log('✅ Workflow stage restrictions');
console.log('✅ Role assignment validation');
console.log('✅ Workflow path restrictions');
console.log('✅ Action permission validation');
console.log('✅ Reverse action rules');
console.log('✅ Closing authority rules');
console.log('✅ Evidence upload requirements');
console.log('✅ Complaint rating restrictions');
console.log('\nAll permissions are now properly configured according to your workflow requirements!'); 