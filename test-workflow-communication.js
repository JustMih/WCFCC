const workflowService = require('./services/workflowCommunicationService');

/**
 * Test script to demonstrate workflow communication between controllers
 */

console.log('🚀 Testing Workflow Communication Service\n');

// Test 1: Workflow Paths
console.log('📋 Available Workflow Paths:');
Object.keys(workflowService.WORKFLOW_PATHS).forEach(path => {
  const workflow = workflowService.WORKFLOW_PATHS[path];
  console.log(`  ${path}:`);
  console.log(`    Steps: ${workflow.steps.join(' → ')}`);
  console.log(`    Total Steps: ${workflow.totalSteps}`);
  console.log(`    SLA: ${JSON.stringify(workflow.sla)}`);
  console.log('');
});

// Test 2: Mock Ticket for Testing
const mockTicket = {
  id: 'test-123',
  ticket_id: 'TKT-2025-001',
  subject: 'Test Complaint',
  category: 'Complaint',
  complaint_type: 'Minor',
  workflow_path: 'MINOR_UNIT',
  current_workflow_step: 2,
  workflow_total_steps: 5,
  workflow_current_role: 'coordinator',
  workflow_started_at: new Date('2025-01-15T09:00:00Z'),
  workflow_completed: false,
  unit_section: 'IT Unit'
};

console.log('🎫 Mock Ticket:');
console.log(`  ID: ${mockTicket.ticket_id}`);
console.log(`  Subject: ${mockTicket.subject}`);
console.log(`  Workflow: ${mockTicket.workflow_path}`);
console.log(`  Current Step: ${mockTicket.current_workflow_step}/${mockTicket.workflow_total_steps}`);
console.log(`  Current Role: ${mockTicket.workflow_current_role}`);
console.log('');

// Test 3: Get Workflow Info
console.log('🔍 Workflow Information:');
const workflowInfo = workflowService.getWorkflowInfo(mockTicket);
if (workflowInfo) {
  console.log(`  Path: ${workflowInfo.path}`);
  console.log(`  Current Step: ${workflowInfo.currentStep}`);
  console.log(`  Total Steps: ${workflowInfo.totalSteps}`);
  console.log(`  Current Role: ${workflowInfo.currentRole}`);
  console.log(`  Next Role: ${workflowInfo.nextRole}`);
  console.log(`  Steps: ${workflowInfo.steps.join(' → ')}`);
  console.log(`  SLA: ${JSON.stringify(workflowInfo.sla)}`);
} else {
  console.log('  ❌ No workflow info available');
}
console.log('');

// Test 4: Calculate Estimated Completion
console.log('⏰ Estimated Completion:');
const estimatedCompletion = workflowService.calculateEstimatedCompletion(mockTicket);
if (estimatedCompletion) {
  console.log(`  Estimated Completion: ${estimatedCompletion.toLocaleDateString()}`);
  console.log(`  Days from start: ${Math.ceil((estimatedCompletion - mockTicket.workflow_started_at) / (1000 * 60 * 60 * 24))}`);
} else {
  console.log('  ❌ Cannot calculate estimated completion');
}
console.log('');

// Test 5: SLA Compliance Check
console.log('📊 SLA Compliance:');
const slaCompliance = workflowService.checkSLACompliance(mockTicket);
console.log(`  Status: ${slaCompliance.status}`);
console.log(`  Details: ${slaCompliance.details}`);
console.log(`  Severity: ${slaCompliance.severity || 'N/A'}`);
console.log('');

// Test 6: Next Role in Workflow
console.log('➡️ Next Role in Workflow:');
const nextRole = workflowService.getNextRoleInWorkflow(mockTicket.workflow_path, mockTicket.current_workflow_step);
console.log(`  Current Step: ${mockTicket.current_workflow_step}`);
console.log(`  Next Role: ${nextRole || 'End of workflow'}`);
console.log('');

// Test 7: Workflow Step Transition Simulation
console.log('🔄 Workflow Step Transition Simulation:');
console.log('  Simulating "Forwarded" action...');

// Mock users for testing
const mockAssignedBy = { id: 'user-1', role: 'coordinator' };
const mockAssignedTo = { id: 'user-2', role: 'head-of-unit' };

// Note: This would normally be called from the controller
console.log(`  From: ${mockAssignedBy.role} (${mockAssignedBy.id})`);
console.log(`  To: ${mockAssignedTo.role} (${mockAssignedTo.id})`);
console.log(`  Action: Forwarded`);
console.log(`  Expected Next Step: ${mockTicket.current_workflow_step + 1}`);
console.log(`  Expected Next Role: ${workflowService.getNextRoleInWorkflow(mockTicket.workflow_path, mockTicket.current_workflow_step + 1)}`);
console.log('');

// Test 8: Different Workflow Paths
console.log('🛤️ Different Workflow Paths:');
const testPaths = ['MINOR_DIRECTORATE', 'MAJOR_UNIT', 'MAJOR_DIRECTORATE'];

testPaths.forEach(path => {
  const workflow = workflowService.WORKFLOW_PATHS[path];
  console.log(`  ${path}:`);
  console.log(`    Steps: ${workflow.steps.join(' → ')}`);
  console.log(`    Total: ${workflow.totalSteps} steps`);
  console.log(`    Coordinator SLA: ${workflow.sla.coordinator || 'N/A'} days`);
  console.log(`    Attendee SLA: ${workflow.sla.attendee || 'N/A'} days`);
  console.log('');
});

console.log('✅ Workflow Communication Service Test Complete!');
console.log('\n💡 How it works:');
console.log('1. Coordinator Controller calls workflowService.processWorkflowStepTransition()');
console.log('2. Workflow Service updates ticket workflow state');
console.log('3. Workflow Service creates comprehensive TicketAssignment record');
console.log('4. Ticket Controller can access workflow info via workflowService.getWorkflowInfo()');
console.log('5. Both controllers maintain consistent workflow tracking');
console.log('\n🔗 Controllers now communicate through the workflow service for:');
console.log('  - Workflow state updates');
console.log('  - SLA tracking');
console.log('  - Assignment record creation');
console.log('  - Workflow progress monitoring'); 