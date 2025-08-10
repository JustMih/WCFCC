const { exec } = require('child_process');
const path = require('path');

console.log('🚀 Starting migration for TicketAssignments workflow tracking fields...\n');

// Run the migration
const migrationCommand = 'npx sequelize-cli db:migrate';

exec(migrationCommand, { cwd: __dirname }, (error, stdout, stderr) => {
  if (error) {
    console.error('❌ Migration failed:', error);
    return;
  }
  
  if (stderr) {
    console.error('⚠️ Migration warnings:', stderr);
  }
  
  console.log('✅ Migration output:', stdout);
  console.log('\n🎉 Migration completed successfully!');
  console.log('\n📋 New fields added to TicketAssignments table:');
  console.log('   • workflow_path - Workflow path (MINOR_UNIT, MAJOR_DIRECTORATE, etc.)');
  console.log('   • workflow_step - Current step in workflow (1-based)');
  console.log('   • workflow_current_role - Current role (coordinator, director, etc.)');
  console.log('   • workflow_next_role - Next role in workflow');
  console.log('   • workflow_total_steps - Total steps in workflow');
  console.log('   • sla_total_days - Total SLA working days');
  console.log('   • sla_current_step_days - SLA days for current step');
  console.log('   • sla_remaining_days - Remaining SLA days');
  console.log('   • backup_type - Type of backup record');
  console.log('   • action_details - JSON string with action details');
  console.log('\n🔍 You can now track complete workflow flow with detailed audit trail!');
}); 