const { exec } = require('child_process');
const path = require('path');

console.log('🔄 Starting rollback for TicketAssignments workflow tracking fields...\n');

// Rollback the migration
const rollbackCommand = 'npx sequelize-cli db:migrate:undo';

exec(rollbackCommand, { cwd: __dirname }, (error, stdout, stderr) => {
  if (error) {
    console.error('❌ Rollback failed:', error);
    return;
  }
  
  if (stderr) {
    console.error('⚠️ Rollback warnings:', stderr);
  }
  
  console.log('✅ Rollback output:', stdout);
  console.log('\n🔄 Rollback completed successfully!');
  console.log('\n📋 Fields removed from TicketAssignments table:');
  console.log('   • workflow_path');
  console.log('   • workflow_step');
  console.log('   • workflow_current_role');
  console.log('   • workflow_next_role');
  console.log('   • workflow_total_steps');
  console.log('   • sla_total_days');
  console.log('   • sla_current_step_days');
  console.log('   • sla_remaining_days');
  console.log('   • backup_type');
  console.log('   • action_details');
  console.log('\n⚠️ Note: This will remove all workflow tracking data!');
}); 