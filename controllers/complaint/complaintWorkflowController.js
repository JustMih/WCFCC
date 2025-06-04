const { Ticket, User, Section, Function, Notification } = require('../../models');
const { Op } = require('sequelize');

// Helper function to create notification
const createNotification = async (ticketId, senderId, recipientId, message) => {
  await Notification.create({
    ticket_id: ticketId,
    sender_id: senderId,
    recipient_id: recipientId,
    message,
    channel: 'In-System',
    status: 'unread'
  });
};

// Helper function to get next role in workflow
const getNextRole = (currentRole, complaintType, unitType) => {
  const minorUnitWorkflow = ['Coordinator', 'Attendee', 'Head of Unit'];
  const minorDirectorateWorkflow = ['Coordinator', 'Attendee', 'Director'];
  const majorUnitWorkflow = ['Coordinator', 'Attendee', 'Head of Unit', 'Director', 'DG'];
  const majorDirectorateWorkflow = ['Coordinator', 'Attendee', 'Director', 'DG'];

  let workflow;
  if (complaintType === 'Minor' && unitType === 'Unit') {
    workflow = minorUnitWorkflow;
  } else if (complaintType === 'Minor' && unitType === 'Directorate') {
    workflow = minorDirectorateWorkflow;
  } else if (complaintType === 'Major' && unitType === 'Unit') {
    workflow = majorUnitWorkflow;
  } else {
    workflow = majorDirectorateWorkflow;
  }

  const currentIndex = workflow.indexOf(currentRole);
  return currentIndex < workflow.length - 1 ? workflow[currentIndex + 1] : null;
};

// Assign complaint to next person in workflow
const assignComplaint = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { assigneeId, notes } = req.body;
    const assignerId = req.user.userId;

    const ticket = await Ticket.findByPk(ticketId, {
      include: [
        {
          model: Section,
          as: 'responsibleSection',
        }
      ]
    });

    if (!ticket) {
      return res.status(404).json({ message: 'Complaint not found' });
    }

    const unitType = ticket.responsibleSection.name.includes('Directorate') ? 'Directorate' : 'Unit';
    const nextRole = getNextRole(ticket.assigned_to_role, ticket.complaint_type, unitType);

    if (!nextRole) {
      return res.status(400).json({ message: 'No next role in workflow' });
    }

    // Update ticket assignment
    await ticket.update({
      assigned_to_id: assigneeId,
      assigned_to_role: nextRole,
      status: 'Assigned'
    });

    // Create notification
    await createNotification(
      ticketId,
      assignerId,
      assigneeId,
      `You have been assigned a ${ticket.complaint_type} complaint for review`
    );

    res.status(200).json({
      message: 'Complaint assigned successfully',
      ticket
    });

  } catch (error) {
    console.error('Error assigning complaint:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Attend to complaint (for Attendees)
const attendComplaint = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { resolution, evidence } = req.body;
    const attendeeId = req.user.userId;

    const ticket = await Ticket.findByPk(ticketId);
    if (!ticket) {
      return res.status(404).json({ message: 'Complaint not found' });
    }

    // Update ticket with resolution
    await ticket.update({
      attended_by_id: attendeeId,
      resolution_details: resolution,
      evidence_url: evidence,
      status: 'In Progress',
      date_of_resolution: new Date()
    });

    // Find supervisor to notify
    const supervisor = await User.findOne({
      where: {
        role: ticket.assigned_to_role === 'Head of Unit' ? 'head-of-unit' : 'director',
        section_id: ticket.responsible_unit_id
      }
    });

    if (supervisor) {
      await createNotification(
        ticketId,
        attendeeId,
        supervisor.id,
        'A complaint has been attended and is ready for review'
      );
    }

    res.status(200).json({
      message: 'Complaint attended successfully',
      ticket
    });

  } catch (error) {
    console.error('Error attending complaint:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Review complaint (for Head of Unit/Director)
const reviewComplaint = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { approved, reviewNotes } = req.body;
    const reviewerId = req.user.userId;

    const ticket = await Ticket.findByPk(ticketId, {
      include: [
        {
          model: Section,
          as: 'responsibleSection',
        }
      ]
    });

    if (!ticket) {
      return res.status(404).json({ message: 'Complaint not found' });
    }

    if (approved) {
      const unitType = ticket.responsibleSection.name.includes('Directorate') ? 'Directorate' : 'Unit';
      const nextRole = getNextRole(ticket.assigned_to_role, ticket.complaint_type, unitType);

      if (nextRole) {
        // If there's a next role, update for next review
        await ticket.update({
          status: 'In Progress',
          review_notes: reviewNotes,
          date_of_review_resolution: new Date()
        });

        // Find next reviewer
        const nextReviewer = await User.findOne({
          where: {
            role: nextRole.toLowerCase().replace(' ', '-'),
            section_id: ticket.responsible_unit_id
          }
        });

        if (nextReviewer) {
          await createNotification(
            ticketId,
            reviewerId,
            nextReviewer.id,
            'A complaint is ready for your review'
          );
        }
      } else {
        // If no next role, close the complaint
        await ticket.update({
          status: 'Closed',
          review_notes: reviewNotes,
          date_of_review_resolution: new Date()
        });
      }
    } else {
      // If not approved, return to attendee
      await ticket.update({
        status: 'Returned',
        review_notes: reviewNotes,
        date_of_review_resolution: new Date()
      });

      // Notify attendee
      if (ticket.attended_by_id) {
        await createNotification(
          ticketId,
          reviewerId,
          ticket.attended_by_id,
          'Your complaint resolution needs revision'
        );
      }
    }

    res.status(200).json({
      message: approved ? 'Complaint reviewed and approved' : 'Complaint returned for revision',
      ticket
    });

  } catch (error) {
    console.error('Error reviewing complaint:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Final approval (for DG)
const approveComplaint = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { approved, approvalNotes } = req.body;
    const dgId = req.user.userId;

    const ticket = await Ticket.findByPk(ticketId);
    if (!ticket) {
      return res.status(404).json({ message: 'Complaint not found' });
    }

    if (approved) {
      // Close the complaint
      await ticket.update({
        status: 'Closed',
        approval_notes: approvalNotes,
        date_of_feedback: new Date()
      });

      // Notify coordinator of closure
      const coordinator = await User.findOne({
        where: {
          role: 'coordinator'
        }
      });

      if (coordinator) {
        await createNotification(
          ticketId,
          dgId,
          coordinator.id,
          'A complaint has been approved and closed by DG'
        );
      }
    } else {
      // Return for revision
      await ticket.update({
        status: 'Returned',
        approval_notes: approvalNotes
      });

      // Notify previous handler
      if (ticket.attended_by_id) {
        await createNotification(
          ticketId,
          dgId,
          ticket.attended_by_id,
          'Complaint needs revision as per DG\'s comments'
        );
      }
    }

    res.status(200).json({
      message: approved ? 'Complaint approved and closed' : 'Complaint returned for revision',
      ticket
    });

  } catch (error) {
    console.error('Error in DG approval:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = {
  assignComplaint,
  attendComplaint,
  reviewComplaint,
  approveComplaint
}; 