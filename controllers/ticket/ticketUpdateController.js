const TicketUpdate = require('../../models/TicketUpdate');
const Ticket = require('../../models/Ticket');
const User = require('../../models/User');
const { Op } = require('sequelize');

// Helper function to check if user can add updates to a ticket
const canUserAddUpdate = (ticket, userId) => {
  return (
    ticket.assigned_to_id === userId &&
    ticket.status !== 'Closed'
  );
};

// Add a new update to a ticket
const addTicketUpdate = async (req, res) => {
  try {
    const { ticket_id, update_text } = req.body;
    const userId = req.user?.userId;
    const user = req.user;

    // Check if user is authenticated
    if (!req.user || !userId) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated or user ID not found'
      });
    }

    // Validate required fields
    if (!ticket_id || !update_text) {
      return res.status(400).json({
        success: false,
        message: 'Ticket ID and update text are required'
      });
    }

    // Check if ticket exists and user is assigned to it
    const ticket = await Ticket.findByPk(ticket_id);
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    // Check if user can add updates to this ticket
    if (!canUserAddUpdate(ticket, userId)) {
      return res.status(403).json({
        success: false,
        message: 'You can only add updates to tickets assigned to you and that are not closed'
      });
    }

    // Fetch user details from database to get full_name
    const userDetails = await User.findByPk(userId);
    if (!userDetails) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Create the update
    const update = await TicketUpdate.create({
      ticket_id,
      user_id: userId,
      user_name: userDetails.full_name,
      user_role: user.role,
      update_text,
      update_date: new Date(),
      is_active: true
    });

    res.status(201).json({
      success: true,
      message: 'Update added successfully',
      data: update
    });

  } catch (error) {
    console.error('Error adding ticket update:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Get all updates for a specific ticket
const getTicketUpdates = async (req, res) => {
  try {
    const { ticket_id } = req.params;
    const userId = req.user.userId;

    // Check if ticket exists
    const ticket = await Ticket.findByPk(ticket_id);
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    // Get all updates for this ticket, ordered by date (newest first)
    const updates = await TicketUpdate.findAll({
      where: { ticket_id },
      order: [['update_date', 'DESC']],
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'full_name', 'role']
        }
      ]
    });

    res.status(200).json({
      success: true,
      data: updates
    });

  } catch (error) {
    console.error('Error fetching ticket updates:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Get updates for a specific user on a specific ticket
const getUserTicketUpdates = async (req, res) => {
  try {
    const { ticket_id } = req.params;
    const userId = req.user.id;

    // Check if ticket exists
    const ticket = await Ticket.findByPk(ticket_id);
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    // Get updates for this specific user on this ticket
    const updates = await TicketUpdate.findAll({
      where: { 
        ticket_id,
        user_id: userId
      },
      order: [['update_date', 'DESC']]
    });

    res.status(200).json({
      success: true,
      data: updates
    });

  } catch (error) {
    console.error('Error fetching user ticket updates:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Update an existing update (only by the user who created it)
const updateTicketUpdate = async (req, res) => {
  try {
    const { update_id } = req.params;
    const { update_text } = req.body;
    const userId = req.user.userId;

    // Validate required fields
    if (!update_text) {
      return res.status(400).json({
        success: false,
        message: 'Update text is required'
      });
    }

    // Find the update
    const update = await TicketUpdate.findByPk(update_id);
    if (!update) {
      return res.status(404).json({
        success: false,
        message: 'Update not found'
      });
    }

    // Check if user owns this update
    if (update.user_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'You can only edit your own updates'
      });
    }

    // Update the text
    update.update_text = update_text;
    await update.save();

    res.status(200).json({
      success: true,
      message: 'Update modified successfully',
      data: update
    });

  } catch (error) {
    console.error('Error updating ticket update:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Delete an update (only by the user who created it)
const deleteTicketUpdate = async (req, res) => {
  try {
    const { update_id } = req.params;
    const userId = req.user.userId;

    // Find the update
    const update = await TicketUpdate.findByPk(update_id);
    if (!update) {
      return res.status(404).json({
        success: false,
        message: 'Update not found'
      });
    }

    // Check if user owns this update
    if (update.user_id !== userId) {
      return res.status(403).json({
        success: false,
        message: 'You can only delete your own updates'
      });
    }

    // Delete the update
    await update.destroy();

    res.status(200).json({
      success: true,
      message: 'Update deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting ticket update:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Check if user can add updates to a ticket
const checkUserCanAddUpdate = async (req, res) => {
  try {
    const { ticket_id } = req.params;
    const userId = req.user.userId;

    // Check if ticket exists
    const ticket = await Ticket.findByPk(ticket_id);
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    const canAdd = canUserAddUpdate(ticket, userId);

    res.status(200).json({
      success: true,
      data: {
        canAddUpdate: canAdd,
        ticket_id,
        user_id: userId
      }
    });

  } catch (error) {
    console.error('Error checking user can add update:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Deactivate all updates for a user when ticket is attended/closed
const deactivateUserUpdates = async (ticket_id, user_id) => {
  try {
    await TicketUpdate.update(
      { is_active: false },
      {
        where: {
          ticket_id,
          user_id,
          is_active: true
        }
      }
    );
  } catch (error) {
    console.error('Error deactivating user updates:', error);
  }
};

module.exports = {
  addTicketUpdate,
  getTicketUpdates,
  getUserTicketUpdates,
  updateTicketUpdate,
  deleteTicketUpdate,
  deactivateUserUpdates,
  canUserAddUpdate,
  checkUserCanAddUpdate
};
