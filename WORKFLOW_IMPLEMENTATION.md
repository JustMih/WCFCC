# WCF Ticket Management System - Workflow Implementation

## Overview

This document describes the implementation of the comprehensive workflow system for handling complaints, suggestions, and compliments in the WCF Ticket Management System.

## Workflow Paths

### 1. Minor Complaint - Unit
**Path**: Agent → Coordinator (rate, change type, assign) → Head of Unit (assign, reverse, attend and close) → Attendee (attend and recommend) → Head of Unit (reverse, close)

**Roles**: coordinator → supervisor → attendee → supervisor

### 2. Minor Complaint - Directorate
**Path**: Agent → Coordinator (rate, change type, assign) → Director (assign, reverse) → Manager (assign, attend and close) → Attendee (attend and recommend) → Manager (reverse, close)

**Roles**: coordinator → director-general → supervisor → attendee → supervisor

### 3. Major Complaint - Unit
**Path**: Agent → Coordinator (rate, change type, assign) → Head of Unit (assign, reverse, attend, upload evidence and recommend) → Attendee (attend, upload evidence and recommend) → Head of Unit (review, recommend, reverse) → DG (approve and close, reverse)

**Roles**: coordinator → supervisor → attendee → supervisor → director-general

### 4. Major Complaint - Directorate
**Path**: Agent → Coordinator (rate, change type, assign) → Director (assign, reverse) → Manager (assign, reverse, attend, upload evidence and recommend) → Attendee (attend, upload evidence and recommend) → Manager (review, recommend, reverse) → Director (review, recommend, reverse) → DG (approve and close, reverse)

**Roles**: coordinator → director-general → supervisor → attendee → supervisor → director-general → director-general

## Key Features Implemented

### 1. Complaint Rating System
- **Coordinator Actions**: Rate complaints as Minor or Major
- **Automatic Assignment**: Based on rating and unit type, automatically assigns to next role in workflow
- **Email Notifications**: Sends notifications to ticket creators

### 2. Complaint to Inquiry Conversion
- **Coordinator Actions**: Convert complaints to inquiries
- **Automatic Assignment**: Assigns to appropriate focal person or attendee
- **Workflow Integration**: Follows inquiry workflow after conversion

### 3. Role-Based Actions

#### Coordinator
- Rate complaints (Minor/Major)
- Convert complaints to inquiries
- Forward tickets to units

#### Head of Unit (Supervisor)
- Assign tickets to attendees
- Attend and close minor complaints
- Review and recommend
- Reverse tickets

#### Attendee
- Attend and recommend
- Upload evidence
- Submit recommendations

#### Director General (DG)
- Approve and close major complaints
- Reverse tickets
- Upload evidence

### 4. Workflow Management

#### Status Tracking
- Tracks current step in workflow
- Shows available actions for current user
- Maintains assignment history

#### Assignment History
- Records all assignments and actions
- Tracks reasons and justifications
- Maintains audit trail

#### Reverse Functionality
- Allows authorized users to reverse tickets
- Returns to previous step in workflow
- Maintains assignment history

## API Endpoints

### Coordinator Endpoints
```
POST /api/coordinator/tickets/:id/rate
POST /api/coordinator/tickets/:id/convert-or-forward
GET /api/coordinator/workflow/:ticketId/status
GET /api/coordinator/workflow/:ticketId/actions
GET /api/coordinator/workflow/paths
```

### Workflow Endpoints
```
POST /api/workflow/:ticketId/assign-attendee
POST /api/workflow/:ticketId/attend-and-close
POST /api/workflow/:ticketId/attend-and-recommend
POST /api/workflow/:ticketId/upload-evidence
POST /api/workflow/:ticketId/approve-and-close
POST /api/workflow/:ticketId/reverse
POST /api/workflow/:ticketId/review-and-recommend
```

## Database Schema Updates

### Ticket Model
- `complaint_type`: ENUM('Minor', 'Major')
- `assigned_to_role`: ENUM('Agent', 'Coordinator', 'Attendee', 'Head of Unit', 'Director', 'DG')
- `evidence_url`: STRING (for file attachments)
- `review_notes`: TEXT
- `approval_notes`: TEXT

### TicketAssignment Model
- Tracks all workflow assignments
- Records actions and reasons
- Maintains assignment history

## Email Notifications

### Rating Notifications
- Sent to ticket creators when complaints are rated
- Includes rating type and justification
- Professional HTML email templates

### Forwarding Notifications
- Sent to unit supervisors when tickets are forwarded
- Includes ticket details and justification
- Professional HTML email templates

## Security and Authorization

### Role-Based Access Control
- Each endpoint is protected by role middleware
- Users can only perform actions appropriate to their role
- Ticket assignments are validated against user roles

### Assignment Validation
- Users can only act on tickets assigned to them
- Workflow progression is validated
- Reverse actions are restricted to appropriate roles

## Testing Features

### Hardcoded Email Testing
- Test email addresses configured for development
- Easy switching between test and production emails
- Comprehensive email logging

## Frontend Integration

### Workflow Status Display
- Shows current step in workflow
- Displays available actions for current user
- Visual workflow progression indicator

### Action Buttons
- Dynamic action buttons based on user role and ticket status
- Context-sensitive UI elements
- Real-time status updates

## Error Handling

### Comprehensive Error Messages
- Clear error messages for invalid actions
- Validation of required fields
- Proper HTTP status codes

### Graceful Degradation
- Email failures don't break workflow
- Fallback assignments when users unavailable
- Robust error recovery

## Future Enhancements

### Potential Improvements
1. **Advanced Assignment Logic**: Load balancing and workload distribution
2. **Escalation Rules**: Automatic escalation for overdue tickets
3. **Notification Preferences**: User-configurable notification settings
4. **Workflow Templates**: Customizable workflow paths
5. **Analytics Dashboard**: Workflow performance metrics
6. **Mobile Notifications**: Push notifications for mobile apps

## Usage Examples

### Rating a Complaint
```javascript
POST /api/coordinator/tickets/123/rate
{
  "complaintType": "Minor",
  "responsible_unit_name": "ICT Unit",
  "justification": "Minor technical issue that can be resolved quickly"
}
```

### Converting to Inquiry
```javascript
POST /api/coordinator/tickets/123/convert-or-forward
{
  "category": "Inquiry",
  "justification": "Complaint converted to inquiry for further investigation"
}
```

### Assigning to Attendee
```javascript
POST /api/workflow/123/assign-attendee
{
  "attendeeId": "uuid-here",
  "justification": "Assigned to technical specialist"
}
```

This implementation provides a robust, scalable workflow system that handles all the specified requirements while maintaining security, auditability, and user experience. 