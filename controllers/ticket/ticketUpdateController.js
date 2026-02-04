const TicketUpdate = require('../../models/TicketUpdate');
const Ticket = require('../../models/Ticket');
const User = require('../../models/User');
const TicketUpdateRead = require('../../models/TicketUpdateRead');
const Notification = require('../../models/Notification');
const { Op } = require('sequelize');
const { sendEmailNonBlocking, renderEmailCard } = require('../../services/emailService');

// Helper function to check if user can add updates to a ticket
const canUserAddUpdate = (ticket, userId) => {
  return (
    ticket.assigned_to_id === userId &&
    ticket.status !== 'Closed'
  );
};

// Helper function to parse mentions from text (exactly two words after @)
const parseMentions = (text) => {
  if (!text) return [];
  
  // Regex to match @mentions - exactly two words after @
  const mentionRegex = /@(\S+\s+\S+)/g;
  const mentions = [];
  let match;
  
  while ((match = mentionRegex.exec(text)) !== null) {
    // Extract the two words (without @)
    const mentionName = match[1].trim();
    mentions.push(mentionName);
  }
  
  return mentions;
};

// Helper function to find users by name (case-insensitive, partial match)
const findUsersByMentionName = async (mentionName) => {
  try {
    // Split mention name into two words
    const nameParts = mentionName.split(/\s+/);
    if (nameParts.length < 2) return [];
    
    const firstName = nameParts[0];
    const lastName = nameParts[1];
    
    // Find users where full_name contains both words (case-insensitive)
    const users = await User.findAll({
      where: {
        [Op.and]: [
          {
            full_name: {
              [Op.like]: `%${firstName}%`
            }
          },
          {
            full_name: {
              [Op.like]: `%${lastName}%`
            }
          }
        ]
      },
      attributes: ['id', 'full_name', 'email', 'username']
    });
    
    return users;
  } catch (error) {
    console.error('Error finding users by mention name:', error);
    return [];
  }
};

// Helper function to send notifications and emails to tagged users
const notifyTaggedUsers = async (ticket, updateText, senderId, senderName, type = 'update') => {
  try {
    // Parse mentions from text
    const mentionNames = parseMentions(updateText);
    
    if (mentionNames.length === 0) {
      return; // No mentions found
    }
    
    console.log(`📧 [Mentions] Found ${mentionNames.length} mentions in ${type}:`, mentionNames);
    
    // Find all tagged users
    const allTaggedUsers = [];
    for (const mentionName of mentionNames) {
      const users = await findUsersByMentionName(mentionName);
      allTaggedUsers.push(...users);
    }
    
    // Remove duplicates based on user ID
    const uniqueTaggedUsers = Array.from(
      new Map(allTaggedUsers.map(user => [user.id, user])).values()
    );
    
    // Exclude sender from notifications
    const taggedUsers = uniqueTaggedUsers.filter(user => user.id !== senderId);
    
    if (taggedUsers.length === 0) {
      console.log('📧 [Mentions] No valid tagged users found (excluding sender)');
      return;
    }
    
    console.log(`📧 [Mentions] Sending notifications to ${taggedUsers.length} tagged users`);
    
    // Create notifications and send emails for each tagged user
    for (const taggedUser of taggedUsers) {
      try {
        // Create notification record
        const notificationMessage = type === 'update' 
          ? `${senderName} mentioned you in a ticket update for Ticket ${ticket.ticket_id || ticket.id}: "${updateText.substring(0, 100)}${updateText.length > 100 ? '...' : ''}"`
          : `${senderName} mentioned you in a message for Ticket ${ticket.ticket_id || ticket.id}: "${updateText.substring(0, 100)}${updateText.length > 100 ? '...' : ''}"`;
        
        await Notification.create({
          ticket_id: ticket.id,
          sender_id: senderId,
          recipient_id: taggedUser.id,
          message: notificationMessage,
          channel: 'In-System',
          status: 'unread',
          category: ticket.category || 'General',
          created_at: new Date()
        });
        
        console.log(`✅ [Mentions] Notification created for user: ${taggedUser.full_name} (${taggedUser.id})`);
        
        // Send email if user has email address
        if (taggedUser.email) {
          try {
            const subject = `You were mentioned in Ticket ${ticket.ticket_id || ticket.id}`;
            const bodyHtml = `
              <p>Hello ${taggedUser.full_name || 'User'},</p>
              <p>You have been mentioned in a ${type === 'update' ? 'ticket update' : 'message'} for the following ticket:</p>
            `;
            const detailsHtml = `
              <ul>
                <li><b>Ticket ID:</b> ${ticket.ticket_id || ticket.id}</li>
                <li><b>Subject:</b> ${ticket.subject || 'N/A'}</li>
                <li><b>Category:</b> ${ticket.category || 'N/A'}</li>
                <li><b>Mentioned by:</b> ${senderName}</li>
                <li><b>Message:</b> ${updateText.substring(0, 200)}${updateText.length > 200 ? '...' : ''}</li>
              </ul>
              <p>Please log into the system to view the full ${type === 'update' ? 'update' : 'message'}.</p>
            `;
            const htmlBody = renderEmailCard(subject, bodyHtml, detailsHtml);
            
            sendEmailNonBlocking({
              to: taggedUser.email,
              subject: subject,
              htmlBody: htmlBody
            });
            
            console.log(`✅ [Mentions] Email sent to: ${taggedUser.email}`);
          } catch (emailError) {
            console.error(`❌ [Mentions] Error sending email to ${taggedUser.email}:`, emailError);
          }
        } else {
          console.log(`⚠️ [Mentions] User ${taggedUser.full_name} has no email address`);
        }
      } catch (notifyError) {
        console.error(`❌ [Mentions] Error notifying user ${taggedUser.id}:`, notifyError);
      }
    }
    
    console.log(`✅ [Mentions] Completed notifying ${taggedUsers.length} tagged users`);
  } catch (error) {
    console.error('❌ [Mentions] Error in notifyTaggedUsers:', error);
    // Don't throw error - notifications are not critical
  }
};

// Add a new update to a ticket
const addTicketUpdate = async (req, res) => {
  try {
    const { ticket_id, update_text } = req.body;
    const userId = req.user?.userId;
    const user = req.user;

    console.log('➕ [TicketUpdates] Adding new update for ticket:', ticket_id);
    console.log('➕ [TicketUpdates] User ID:', userId);
    console.log('➕ [TicketUpdates] Update text length:', update_text?.length);

    // Check if user is authenticated
    if (!req.user || !userId) {
      console.log('❌ [TicketUpdates] User not authenticated');
      return res.status(401).json({
        success: false,
        message: 'User not authenticated or user ID not found'
      });
    }

    // Validate required fields
    if (!ticket_id || !update_text) {
      console.log('❌ [TicketUpdates] Missing required fields - ticket_id:', !!ticket_id, 'update_text:', !!update_text);
      return res.status(400).json({
        success: false,
        message: 'Ticket ID and update text are required'
      });
    }

    // Check if ticket exists and user is assigned to it
    const ticket = await Ticket.findByPk(ticket_id);
    if (!ticket) {
      console.log('❌ [TicketUpdates] Ticket not found:', ticket_id);
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    console.log('✅ [TicketUpdates] Ticket found:', ticket.ticket_id);

    // Check if user can add updates to this ticket
    if (!canUserAddUpdate(ticket, userId)) {
      console.log('❌ [TicketUpdates] User cannot add updates - assigned_to_id:', ticket.assigned_to_id, 'user_id:', userId, 'status:', ticket.status);
      return res.status(403).json({
        success: false,
        message: 'You can only add updates to tickets assigned to you and that are not closed'
      });
    }

    console.log('✅ [TicketUpdates] User can add updates');

    // Fetch user details from database to get full_name
    const userDetails = await User.findByPk(userId);
    if (!userDetails) {
      console.log('❌ [TicketUpdates] User details not found:', userId);
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    console.log('✅ [TicketUpdates] User details found:', userDetails.full_name);

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

    console.log('✅ [TicketUpdates] Update created successfully with ID:', update.id);

    // Notify tagged users (non-blocking)
    notifyTaggedUsers(ticket, update_text, userId, userDetails.full_name, 'update')
      .catch(error => {
        console.error('❌ [TicketUpdates] Error notifying tagged users:', error);
        // Don't fail the request if notification fails
      });

    res.status(201).json({
      success: true,
      message: 'Update added successfully',
      data: update
    });

  } catch (error) {
    console.error('❌ [TicketUpdates] Error adding ticket update:', error);
    console.error('❌ [TicketUpdates] Error stack:', error.stack);
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

    console.log('🔍 [TicketUpdates] Fetching updates for ticket:', ticket_id);
    console.log('🔍 [TicketUpdates] User ID:', userId);

    // Check if ticket exists
    const ticket = await Ticket.findByPk(ticket_id);
    if (!ticket) {
      console.log('❌ [TicketUpdates] Ticket not found:', ticket_id);
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    console.log('✅ [TicketUpdates] Ticket found:', ticket.ticket_id);

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

    // Get read status for current user
    const readRecords = await TicketUpdateRead.findAll({
      where: {
        user_id: userId,
        ticket_update_id: {
          [Op.in]: updates.map(u => u.id)
        }
      },
      attributes: ['ticket_update_id', 'read_at']
    });

    const readMap = {};
    readRecords.forEach(record => {
      readMap[record.ticket_update_id] = record.read_at;
    });

    // Add read status to each update
    const updatesWithReadStatus = updates.map(update => {
      const updateData = update.toJSON();
      updateData.is_read = !!readMap[update.id];
      updateData.read_at = readMap[update.id] || null;
      return updateData;
    });

    console.log('✅ [TicketUpdates] Found', updates.length, 'updates for ticket:', ticket_id);

    res.status(200).json({
      success: true,
      data: updatesWithReadStatus
    });

  } catch (error) {
    console.error('❌ [TicketUpdates] Error fetching ticket updates:', error);
    console.error('❌ [TicketUpdates] Error stack:', error.stack);
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

    console.log('✏️ [TicketUpdates] Updating update ID:', update_id);
    console.log('✏️ [TicketUpdates] User ID:', userId);
    console.log('✏️ [TicketUpdates] New text length:', update_text?.length);

    // Validate required fields
    if (!update_text) {
      console.log('❌ [TicketUpdates] Update text is required');
      return res.status(400).json({
        success: false,
        message: 'Update text is required'
      });
    }

    // Find the update
    const update = await TicketUpdate.findByPk(update_id);
    if (!update) {
      console.log('❌ [TicketUpdates] Update not found:', update_id);
      return res.status(404).json({
        success: false,
        message: 'Update not found'
      });
    }

    console.log('✅ [TicketUpdates] Update found for ticket:', update.ticket_id);

    // Check if user owns this update
    if (update.user_id !== userId) {
      console.log('❌ [TicketUpdates] User does not own this update - update_user_id:', update.user_id, 'current_user_id:', userId);
      return res.status(403).json({
        success: false,
        message: 'You can only edit your own updates'
      });
    }

    console.log('✅ [TicketUpdates] User owns this update');

    // Update the update
    await update.update({
      update_text,
      updated_at: new Date()
    });

    console.log('✅ [TicketUpdates] Update modified successfully');

    res.status(200).json({
      success: true,
      message: 'Update modified successfully',
      data: update
    });

  } catch (error) {
    console.error('❌ [TicketUpdates] Error modifying update:', error);
    console.error('❌ [TicketUpdates] Error stack:', error.stack);
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

    console.log('🗑️ [TicketUpdates] Deleting update ID:', update_id);
    console.log('🗑️ [TicketUpdates] User ID:', userId);

    // Find the update
    const update = await TicketUpdate.findByPk(update_id);
    if (!update) {
      console.log('❌ [TicketUpdates] Update not found for deletion:', update_id);
      return res.status(404).json({
        success: false,
        message: 'Update not found'
      });
    }

    console.log('✅ [TicketUpdates] Update found for deletion, ticket:', update.ticket_id);

    // Check if user owns this update
    if (update.user_id !== userId) {
      console.log('❌ [TicketUpdates] User does not own this update for deletion - update_user_id:', update.user_id, 'current_user_id:', userId);
      return res.status(403).json({
        success: false,
        message: 'You can only delete your own updates'
      });
    }

    console.log('✅ [TicketUpdates] User owns this update, proceeding with deletion');

    // Delete the update
    await update.destroy();

    console.log('✅ [TicketUpdates] Update deleted successfully');

    res.status(200).json({
      success: true,
      message: 'Update deleted successfully'
    });

  } catch (error) {
    console.error('❌ [TicketUpdates] Error deleting update:', error);
    console.error('❌ [TicketUpdates] Error stack:', error.stack);
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

// Mark an update as read by a user
const markUpdateAsRead = async (req, res) => {
  try {
    const { update_id } = req.params;
    const userId = req.user.userId;

    console.log('📖 [TicketUpdates] Marking update as read - Update ID:', update_id, 'User ID:', userId);

    // Check if update exists
    const update = await TicketUpdate.findByPk(update_id);
    if (!update) {
      console.log('❌ [TicketUpdates] Update not found:', update_id);
      return res.status(404).json({
        success: false,
        message: 'Update not found'
      });
    }

    // Check if already read
    const existingRead = await TicketUpdateRead.findOne({
      where: {
        ticket_update_id: update_id,
        user_id: userId
      }
    });

    if (existingRead) {
      console.log('✅ [TicketUpdates] Update already marked as read');
      return res.status(200).json({
        success: true,
        message: 'Update already marked as read',
        data: existingRead
      });
    }

    // Create read record
    const readRecord = await TicketUpdateRead.create({
      ticket_update_id: update_id,
      user_id: userId,
      read_at: new Date()
    });

    console.log('✅ [TicketUpdates] Update marked as read successfully');

    res.status(200).json({
      success: true,
      message: 'Update marked as read',
      data: readRecord
    });

  } catch (error) {
    console.error('❌ [TicketUpdates] Error marking update as read:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Mark all updates for a ticket as read by a user
const markAllUpdatesAsRead = async (req, res) => {
  try {
    const { ticket_id } = req.params;
    const userId = req.user.userId;

    console.log('📖 [TicketUpdates] Marking all updates as read - Ticket ID:', ticket_id, 'User ID:', userId);

    // Check if ticket exists
    const ticket = await Ticket.findByPk(ticket_id);
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    // Get all updates for this ticket that are not from current user
    const updates = await TicketUpdate.findAll({
      where: {
        ticket_id,
        user_id: {
          [Op.ne]: userId
        }
      },
      attributes: ['id']
    });

    const updateIds = updates.map(u => u.id);

    if (updateIds.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No updates to mark as read',
        data: { count: 0 }
      });
    }

    // Get already read updates
    const existingReads = await TicketUpdateRead.findAll({
      where: {
        user_id: userId,
        ticket_update_id: {
          [Op.in]: updateIds
        }
      },
      attributes: ['ticket_update_id']
    });

    const alreadyReadIds = existingReads.map(r => r.ticket_update_id);
    const unreadIds = updateIds.filter(id => !alreadyReadIds.includes(id));

    // Mark unread updates as read
    if (unreadIds.length > 0) {
      const readRecords = unreadIds.map(updateId => ({
        ticket_update_id: updateId,
        user_id: userId,
        read_at: new Date()
      }));

      await TicketUpdateRead.bulkCreate(readRecords);
    }

    console.log('✅ [TicketUpdates] Marked', unreadIds.length, 'updates as read');

    res.status(200).json({
      success: true,
      message: 'All updates marked as read',
      data: { count: unreadIds.length }
    });

  } catch (error) {
    console.error('❌ [TicketUpdates] Error marking all updates as read:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Get unread updates count for a ticket
const getUnreadUpdatesCount = async (req, res) => {
  try {
    const { ticket_id } = req.params;
    const userId = req.user.userId;

    // Get all updates for this ticket that are not from current user
    const updates = await TicketUpdate.findAll({
      where: {
        ticket_id,
        user_id: {
          [Op.ne]: userId
        }
      },
      attributes: ['id']
    });

    const updateIds = updates.map(u => u.id);

    if (updateIds.length === 0) {
      return res.status(200).json({
        success: true,
        data: { unreadCount: 0 }
      });
    }

    // Get read updates
    const readRecords = await TicketUpdateRead.findAll({
      where: {
        user_id: userId,
        ticket_update_id: {
          [Op.in]: updateIds
        }
      },
      attributes: ['ticket_update_id']
    });

    const readIds = readRecords.map(r => r.ticket_update_id);
    const unreadCount = updateIds.length - readIds.length;

    res.status(200).json({
      success: true,
      data: { unreadCount }
    });

  } catch (error) {
    console.error('❌ [TicketUpdates] Error getting unread count:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
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
  checkUserCanAddUpdate,
  markUpdateAsRead,
  markAllUpdatesAsRead,
  getUnreadUpdatesCount
};
