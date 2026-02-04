# 🔄 Workflow Communication System

## Overview

The **Workflow Communication Service** is a centralized service that enables seamless communication between the **Coordinator Controller** and **Ticket Controller** for complete workflow tracking and SLA management.

## 🏗️ Architecture

```
┌─────────────────────┐    ┌─────────────────────────────┐    ┌─────────────────────┐
│   Coordinator       │    │   Workflow Communication    │    │   Ticket            │
│   Controller       │◄──►│   Service                   │◄──►│   Controller        │
│                     │    │                             │    │                     │
│ • convertOrForward  │    │ • Workflow state management │    │ • assignTicket      │
│ • rateTickets       │    │ • SLA tracking              │    │ • reverseTicket     │
│ • workflow status   │    │ • Assignment records        │    │ • workflow info     │
└─────────────────────┘    │ • Progress calculation      │    └─────────────────────┘
                           └─────────────────────────────┘
```

## 🎯 Key Features

### 1. **Centralized Workflow Management**
- Single source of truth for workflow paths and steps
- Consistent SLA definitions across all controllers
- Unified workflow state tracking

### 2. **Seamless Controller Communication**
- Both controllers use the same service
- Automatic workflow state synchronization
- Consistent assignment record creation

### 3. **Comprehensive SLA Tracking**
- Real-time SLA compliance monitoring
- Working day calculations (excluding weekends)
- Deadline tracking for each workflow step

### 4. **Complete Audit Trail**
- Every workflow action creates detailed records
- Full context preservation in TicketAssignment
- Historical workflow progression tracking

## 🔄 How It Works

### **Step 1: Coordinator Forwards Ticket**
```javascript
// In coordinatorController.js
const result = await workflowService.processWorkflowStepTransition(
  ticketId,
  "Forwarded",
  assignedBy,
  assignedTo,
  reason,
  transaction
);
```

### **Step 2: Workflow Service Updates State**
```javascript
// In workflowCommunicationService.js
const workflowUpdates = {
  current_workflow_step: nextStep,
  workflow_current_role: nextRole,
  workflow_completed: nextStep >= workflow.totalSteps
};

await updateTicketWorkflowState(ticketId, workflowUpdates, transaction);
```

### **Step 3: Comprehensive Assignment Record Created**
```javascript
const assignment = await createWorkflowAssignmentRecord(
  ticket,
  action,
  assignedBy,
  assignedTo,
  currentStep,
  nextRole,
  reason,
  transaction
);
```

### **Step 4: Ticket Controller Uses Workflow Info**
```javascript
// In ticketController.js
const workflowInfo = workflowService.getWorkflowInfo(ticket);
const slaCompliance = workflowService.checkSLACompliance(ticket);
```

## 📊 Workflow Paths

### **Minor Complaint - Unit**
```
Agent → Coordinator → Head of Unit → Attendee → Head of Unit
  1        2             3            4           5
```

### **Minor Complaint - Directorate**
```
Agent → Coordinator → Director → Manager → Attendee → Manager → Director
  1        2           3         4         5         6         7
```

### **Major Complaint - Unit**
```
Agent → Coordinator → Head of Unit → Attendee → Head of Unit → DG
  1        2             3            4           5           6
```

### **Major Complaint - Directorate**
```
Agent → Coordinator → Director → Manager → Attendee → Manager → Director → DG
  1        2           3         4         5         6         7         8
```

## ⏰ SLA Management

### **Working Day Calculation**
- Excludes weekends (Saturday & Sunday)
- Configurable holiday support
- Accurate deadline calculations

### **SLA Compliance Status**
- **On Time**: Within SLA limits
- **Approaching Deadline**: 1 day remaining
- **Overdue**: Past SLA deadline

### **Role-Based SLA**
```javascript
const SLA_RULES = {
  coordinator: 2,        // 2 working days
  'head-of-unit': 1,     // 1 working day
  attendee: {            // Varies by complaint type
    minor: 3,            // 3 working days
    major: 10            // 10 working days
  },
  director: 1,           // 1 working day
  manager: 1,            // 1 working day
  'director-general': 1  // 1 working day
};
```

## 🔧 API Endpoints

### **Coordinator Controller**
- `POST /coordinator/convert-or-forward/:ticketId` - Convert or forward ticket
- `GET /coordinator/workflow-status/:ticketId` - Get workflow status
- `GET /coordinator/workflow-audit/:ticketId` - Get audit trail
- `GET /coordinator/sla-dashboard` - Get SLA dashboard

### **Ticket Controller**
- `POST /ticket/assign/:ticketId` - Assign ticket with workflow tracking
- `POST /ticket/reverse/:ticketId` - Reverse ticket with workflow tracking
- `GET /ticket/workflow-info/:ticketId` - Get workflow information
- `GET /ticket/workflow-audit/:ticketId` - Get workflow audit trail

## 📝 Database Schema

### **Tickets Table (Enhanced)**
```sql
ALTER TABLE Tickets ADD COLUMN workflow_path VARCHAR(100);
ALTER TABLE Tickets ADD COLUMN current_workflow_step INTEGER;
ALTER TABLE Tickets ADD COLUMN workflow_total_steps INTEGER;
ALTER TABLE Tickets ADD COLUMN workflow_current_role VARCHAR(100);
ALTER TABLE Tickets ADD COLUMN workflow_started_at TIMESTAMP;
ALTER TABLE Tickets ADD COLUMN workflow_completed BOOLEAN;
```

### **Ticket_assignments Table (Enhanced)**
```sql
ALTER TABLE Ticket_assignments ADD COLUMN workflow_path VARCHAR(100);
ALTER TABLE Ticket_assignments ADD COLUMN workflow_step INTEGER;
ALTER TABLE Ticket_assignments ADD COLUMN workflow_current_role VARCHAR(100);
ALTER TABLE Ticket_assignments ADD COLUMN workflow_next_role VARCHAR(100);
ALTER TABLE Ticket_assignments ADD COLUMN workflow_total_steps INTEGER;
ALTER TABLE Ticket_assignments ADD COLUMN sla_total_days INTEGER;
ALTER TABLE Ticket_assignments ADD COLUMN sla_current_step_days VARCHAR(50);
ALTER TABLE Ticket_assignments ADD COLUMN sla_remaining_days INTEGER;
ALTER TABLE Ticket_assignments ADD COLUMN backup_type VARCHAR(50);
ALTER TABLE Ticket_assignments ADD COLUMN action_details TEXT;
```

## 🚀 Usage Examples

### **1. Forward Ticket with Workflow Tracking**
```javascript
// Coordinator forwards ticket
const result = await workflowService.processWorkflowStepTransition(
  ticketId,
  "Forwarded",
  { id: coordinatorId, role: "coordinator" },
  { id: unitUserId, role: "head-of-unit" },
  "Forwarded to IT Unit for resolution",
  transaction
);

console.log(`Workflow: ${result.workflow.path}`);
console.log(`Current Step: ${result.workflow.currentStep}/${result.workflow.totalSteps}`);
console.log(`Next Role: ${result.workflow.nextRole}`);
```

### **2. Check SLA Compliance**
```javascript
const slaStatus = workflowService.checkSLACompliance(ticket);
if (slaStatus.status === 'Overdue') {
  console.log(`⚠️ Ticket is ${slaStatus.details}`);
  // Send escalation notification
}
```

### **3. Get Workflow Progress**
```javascript
const workflowInfo = workflowService.getWorkflowInfo(ticket);
const progress = {
  percentage: Math.round((workflowInfo.currentStep / workflowInfo.totalSteps) * 100),
  current_step: workflowInfo.currentStep,
  total_steps: workflowInfo.totalSteps,
  remaining_steps: workflowInfo.totalSteps - workflowInfo.currentStep
};
```

## 🔍 Testing

### **Run Test Script**
```bash
node test-workflow-communication.js
```

### **Expected Output**
```
🚀 Testing Workflow Communication Service

📋 Available Workflow Paths:
  MINOR_UNIT:
    Steps: agent → coordinator → head-of-unit → attendee → head-of-unit
    Total Steps: 5
    SLA: {"coordinator":2,"head-of-unit":1,"attendee":3}

🎫 Mock Ticket:
  ID: TKT-2025-001
  Subject: Test Complaint
  Workflow: MINOR_UNIT
  Current Step: 2/5
  Current Role: coordinator

🔍 Workflow Information:
  Path: MINOR_UNIT
  Current Step: 2
  Total Steps: 5
  Current Role: coordinator
  Next Role: head-of-unit
  Steps: agent,coordinator,head-of-unit,attendee,head-of-unit
  SLA: {"coordinator":2,"head-of-unit":1,"attendee":3}
```

## 🎯 Benefits

### **For Developers**
- **Single Service**: One place to manage all workflow logic
- **Consistent API**: Same functions used across controllers
- **Easy Testing**: Centralized logic is easier to test
- **Maintainable**: Changes in one place affect all controllers

### **For Users**
- **Real-time Tracking**: See exactly where tickets are in workflow
- **SLA Visibility**: Know when deadlines are approaching
- **Complete History**: Full audit trail of all actions
- **Progress Monitoring**: Visual progress through workflow steps

### **For System**
- **Data Consistency**: All controllers use same workflow state
- **Performance**: Optimized queries with proper indexing
- **Scalability**: Easy to add new workflow paths or roles
- **Compliance**: Full audit trail for regulatory requirements

## 🔧 Configuration

### **Adding New Workflow Paths**
```javascript
// In workflowCommunicationService.js
const WORKFLOW_PATHS = {
  // ... existing paths ...
  NEW_WORKFLOW: {
    steps: ['agent', 'coordinator', 'new-role', 'attendee'],
    totalSteps: 4,
    sla: {
      coordinator: 2,
      'new-role': 1,
      attendee: 3
    }
  }
};
```

### **Modifying SLA Rules**
```javascript
const SLA_RULES = {
  // ... existing rules ...
  'new-role': 2,  // 2 working days for new role
};
```

## 🚨 Error Handling

### **Common Errors**
- **Invalid Workflow Path**: Ticket has unknown workflow_path
- **Missing Workflow State**: Required workflow fields not set
- **SLA Calculation Error**: Cannot determine SLA for current role

### **Fallback Behavior**
- Controllers gracefully handle missing workflow information
- Basic assignment records created for non-workflow tickets
- Error logging for debugging workflow issues

## 🔮 Future Enhancements

### **Planned Features**
- **Dynamic SLA Rules**: Configurable via admin interface
- **Workflow Templates**: Reusable workflow definitions
- **Advanced Analytics**: Workflow performance metrics
- **Mobile Notifications**: Real-time workflow updates

### **Integration Points**
- **Email Service**: Enhanced workflow notifications
- **Dashboard**: Real-time workflow monitoring
- **Reporting**: Workflow performance reports
- **API**: External system integration

## 📚 Related Files

- `services/workflowCommunicationService.js` - Main service
- `controllers/coordinator/coordinatorController.js` - Coordinator logic
- `controllers/ticket/ticketController.js` - Ticket management
- `models/Ticket.js` - Enhanced ticket model
- `models/TicketAssignment.js` - Enhanced assignment model
- `migrations/20250115000000-add-workflow-tracking-to-ticket-assignments.js` - Database schema

## 🤝 Support

For questions or issues with the workflow communication system:
1. Check the test script output
2. Review database migration status
3. Verify controller imports
4. Check workflow service configuration

---

**🎉 The workflow communication system is now fully integrated and ready to track your complete complaint workflow from start to finish!** 