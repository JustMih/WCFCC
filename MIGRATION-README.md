# 🚀 Migration Guide: Add Workflow Tracking to TicketAssignments

## 📋 Overview
This migration adds comprehensive workflow tracking fields to the `TicketAssignments` table, enabling complete audit trail and backup functionality for your workflow system.

## 🔧 What's Being Added

### New Fields in TicketAssignments Table:
- **`workflow_path`** - Workflow path (e.g., MINOR_UNIT, MAJOR_DIRECTORATE)
- **`workflow_step`** - Current step in workflow (1-based)
- **`workflow_current_role`** - Current role (coordinator, director, etc.)
- **`workflow_next_role`** - Next role in workflow
- **`workflow_total_steps`** - Total steps in workflow
- **`sla_total_days`** - Total SLA working days
- **`sla_current_step_days`** - SLA days for current step
- **`sla_remaining_days`** - Remaining SLA days
- **`backup_type`** - Type of backup record
- **`action_details`** - JSON string with action details

### New Indexes:
- `workflow_path`
- `workflow_step`
- `workflow_current_role`
- `backup_type`
- `ticket_id + workflow_step` (composite)

## 🚀 How to Run the Migration

### Option 1: Using the Migration Script (Recommended)
```bash
cd BACKEND
node run-migration.js
```

### Option 2: Using Sequelize CLI Directly
```bash
cd BACKEND
npx sequelize-cli db:migrate
```

### Option 3: Using npm script (if added to package.json)
```bash
cd BACKEND
npm run migrate
```

## 🔄 How to Rollback (if needed)

### Option 1: Using the Rollback Script
```bash
cd BACKEND
node rollback-migration.js
```

### Option 2: Using Sequelize CLI Directly
```bash
cd BACKEND
npx sequelize-cli db:migrate:undo
```

## ✅ What Happens After Migration

1. **New Fields Available**: All new workflow tracking fields will be available in your `TicketAssignments` table
2. **Enhanced Audit Trail**: Every workflow action will now create comprehensive assignment records
3. **Complete Flow Tracking**: You can see exactly who did what, when, and why at every step
4. **SLA Monitoring**: Track SLA compliance for every workflow step
5. **Backup Records**: Maintain complete backup of all workflow actions

## 🔍 How to Use the New Fields

### 1. Enhanced Assignment Records:
```javascript
// Every workflow action now creates a comprehensive record
await TicketAssignment.create({
  ticket_id: ticket.id,
  assigned_by_id: userId,
  assigned_to_id: unitUser.id,
  action: "Forwarded",
  workflow_path: "MAJOR_DIRECTORATE",
  workflow_step: 2,
  workflow_current_role: "coordinator",
  workflow_next_role: "director",
  sla_total_days: 17,
  sla_current_step_days: "2 working days",
  reason: "Complete workflow context with SLA details"
});
```

### 2. Complete Flow Tracking:
```javascript
// Get complete workflow history
const assignments = await TicketAssignment.findAll({
  where: { ticket_id: ticketId },
  order: [['workflow_step', 'ASC']]
});

// See the complete flow
assignments.forEach(assignment => {
  console.log(`Step ${assignment.workflow_step}: ${assignment.workflow_current_role} ${assignment.action} to ${assignment.workflow_next_role}`);
});
```

### 3. SLA Compliance Monitoring:
```javascript
// Check SLA compliance for each step
assignments.forEach(assignment => {
  if (assignment.sla_remaining_days !== null) {
    console.log(`Step ${assignment.workflow_step}: ${assignment.sla_remaining_days} days remaining`);
  }
});
```

## ⚠️ Important Notes

1. **Backup First**: Always backup your database before running migrations
2. **Test Environment**: Test the migration in a development environment first
3. **Data Integrity**: The new fields are nullable, so existing data won't be affected
4. **Performance**: New indexes will improve query performance for workflow-related queries

## 🎯 Benefits After Migration

- **Complete Visibility**: See every workflow action with full context
- **SLA Tracking**: Monitor compliance at every step
- **Audit Trail**: Complete history for compliance and reporting
- **Performance**: Better query performance with new indexes
- **Backup**: Comprehensive backup of all workflow actions
- **Troubleshooting**: Easy identification of workflow issues

## 🆘 Troubleshooting

### Migration Fails:
- Check database connection
- Ensure you have proper permissions
- Verify Sequelize CLI is installed

### Fields Not Visible:
- Restart your application
- Check if the model is properly updated
- Verify the migration ran successfully

### Performance Issues:
- Check if indexes were created properly
- Monitor query performance
- Consider adding additional indexes if needed

## 📞 Support
If you encounter any issues during migration, check:
1. Database logs for errors
2. Application logs for model issues
3. Sequelize CLI output for migration status

---

**🎉 After successful migration, you'll have complete workflow tracking with detailed audit trail and backup functionality!** 