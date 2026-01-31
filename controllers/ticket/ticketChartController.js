const TicketChart = require('../../models/TicketChart');
const TicketChartRead = require('../../models/TicketChartRead');
const Ticket = require('../../models/Ticket');
const User = require('../../models/User');
const Notification = require('../../models/Notification');
const { Op } = require('sequelize');
const { sendEmailNonBlocking, renderEmailCard } = require('../../services/emailService');

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
const notifyTaggedUsers = async (ticket, messageText, senderId, senderName, type = 'message') => {
  try {
    // Parse mentions from text
    const mentionNames = parseMentions(messageText);
    
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
          ? `${senderName} mentioned you in a ticket update for Ticket ${ticket.ticket_id || ticket.id}: "${messageText.substring(0, 100)}${messageText.length > 100 ? '...' : ''}"`
          : `${senderName} mentioned you in a message for Ticket ${ticket.ticket_id || ticket.id}: "${messageText.substring(0, 100)}${messageText.length > 100 ? '...' : ''}"`;
        
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
                <li><b>Message:</b> ${messageText.substring(0, 200)}${messageText.length > 200 ? '...' : ''}</li>
              </ul>
              <p>Please log into the system to view the full ${type === 'update' ? 'update' : 'message'}.</p>
            `;
            const htmlBody = renderEmailCard(subject, bodyHtml, detailsHtml);
            
            sendEmailNonBlocking({
              // to: taggedUser.email,
              to:'grace.tarimo@wcf.go.tz',
              subject: subject,
              htmlBody: htmlBody
            });
            
            console.log(`✅ [Mentions] Email sent to test email: grace.tarimo@wcf.go.tz (original: ${taggedUser.email})`);
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

// Send a new message to a ticket
const sendMessage = async (req, res) => {
  try {
    const { ticket_id } = req.params;
    const { message, user_id } = req.body;
    const userId = req.user?.userId || user_id;

    console.log('💬 [TicketCharts] Sending message for ticket:', ticket_id);
    console.log('💬 [TicketCharts] User ID:', userId);
    console.log('💬 [TicketCharts] Message length:', message?.length);

    // Check if user is authenticated
    if (!userId) {
      console.log('❌ [TicketCharts] User not authenticated');
      return res.status(401).json({
        success: false,
        message: 'User not authenticated or user ID not found'
      });
    }

    // Validate required fields
    if (!ticket_id || !message || !message.trim()) {
      console.log('❌ [TicketCharts] Missing required fields');
      return res.status(400).json({
        success: false,
        message: 'Ticket ID and message are required'
      });
    }

    // Check if ticket exists
    const ticket = await Ticket.findByPk(ticket_id);
    if (!ticket) {
      console.log('❌ [TicketCharts] Ticket not found:', ticket_id);
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    console.log('✅ [TicketCharts] Ticket found:', ticket.ticket_id);

    // Fetch user details from database to get full_name
    const userDetails = await User.findByPk(userId);
    if (!userDetails) {
      console.log('❌ [TicketCharts] User details not found:', userId);
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    console.log('✅ [TicketCharts] User details found:', userDetails.full_name);

    // Create the message
    const chartMessage = await TicketChart.create({
      ticket_id,
      user_id: userId,
      user_name: userDetails.full_name,
      message: message.trim(),
      created_at: new Date()
    });

    console.log('✅ [TicketCharts] Message created successfully with ID:', chartMessage.id);

    // Notify tagged users (non-blocking)
    notifyTaggedUsers(ticket, message.trim(), userId, userDetails.full_name, 'message')
      .catch(error => {
        console.error('❌ [TicketCharts] Error notifying tagged users:', error);
        // Don't fail the request if notification fails
      });

    res.status(201).json({
      success: true,
      message: 'Message sent successfully',
      data: chartMessage
    });

  } catch (error) {
    console.error('❌ [TicketCharts] Error sending message:', error);
    console.error('❌ [TicketCharts] Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Get all messages for a specific ticket
const getTicketMessages = async (req, res) => {
  try {
    const { ticket_id } = req.params;
    const userId = req.user?.userId || req.user?.id;

    console.log('📋 [TicketCharts] Fetching messages for ticket:', ticket_id);

    // Check if ticket exists
    const ticket = await Ticket.findByPk(ticket_id);
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    // Get all messages for this ticket
    const messages = await TicketChart.findAll({
      where: { ticket_id },
      order: [['created_at', 'ASC']]
    });

    console.log('✅ [TicketCharts] Found', messages.length, 'messages');

    res.status(200).json({
      success: true,
      data: messages
    });

  } catch (error) {
    console.error('❌ [TicketCharts] Error fetching messages:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Mark all messages for a ticket as read by a user
const markAllMessagesAsRead = async (req, res) => {
  try {
    const { ticket_id } = req.params;
    const userId = req.user?.userId || req.user?.id;

    console.log('📖 [TicketCharts] Marking all messages as read - Ticket ID:', ticket_id, 'User ID:', userId);

    // Check if ticket exists
    const ticket = await Ticket.findByPk(ticket_id);
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    // Get all messages for this ticket that are not from current user
    const messages = await TicketChart.findAll({
      where: {
        ticket_id,
        user_id: {
          [Op.ne]: userId
        }
      },
      attributes: ['id']
    });

    const messageIds = messages.map(m => m.id);

    if (messageIds.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No messages to mark as read',
        data: { count: 0 }
      });
    }

    // Get already read messages
    const existingReads = await TicketChartRead.findAll({
      where: {
        ticket_chart_id: {
          [Op.in]: messageIds
        },
        user_id: userId
      },
      attributes: ['ticket_chart_id']
    });

    const alreadyReadIds = existingReads.map(r => r.ticket_chart_id);
    const unreadIds = messageIds.filter(id => !alreadyReadIds.includes(id));

    if (unreadIds.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'All messages already marked as read',
        data: { count: 0 }
      });
    }

    // Create read records for unread messages
    const readRecords = unreadIds.map(messageId => ({
      ticket_chart_id: messageId,
      user_id: userId,
      read_at: new Date()
    }));

    await TicketChartRead.bulkCreate(readRecords);

    console.log('✅ [TicketCharts] Marked', unreadIds.length, 'messages as read');

    res.status(200).json({
      success: true,
      message: 'Messages marked as read successfully',
      data: { count: unreadIds.length }
    });

  } catch (error) {
    console.error('❌ [TicketCharts] Error marking messages as read:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

// Get unread messages count for a ticket
const getUnreadMessagesCount = async (req, res) => {
  try {
    const { ticket_id } = req.params;
    const userId = req.user?.userId || req.user?.id;

    console.log('🔢 [TicketCharts] Getting unread count - Ticket ID:', ticket_id, 'User ID:', userId);

    // Check if ticket exists
    const ticket = await Ticket.findByPk(ticket_id);
    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: 'Ticket not found'
      });
    }

    // Get all messages for this ticket that are not from current user
    const messages = await TicketChart.findAll({
      where: {
        ticket_id,
        user_id: {
          [Op.ne]: userId
        }
      },
      attributes: ['id']
    });

    const messageIds = messages.map(m => m.id);

    if (messageIds.length === 0) {
      return res.status(200).json({
        success: true,
        data: { unreadCount: 0 }
      });
    }

    // Get read messages
    const readMessages = await TicketChartRead.findAll({
      where: {
        ticket_chart_id: {
          [Op.in]: messageIds
        },
        user_id: userId
      },
      attributes: ['ticket_chart_id']
    });

    const readIds = readMessages.map(r => r.ticket_chart_id);
    const unreadCount = messageIds.length - readIds.length;

    console.log('✅ [TicketCharts] Unread count:', unreadCount);

    res.status(200).json({
      success: true,
      data: { unreadCount }
    });

  } catch (error) {
    console.error('❌ [TicketCharts] Error getting unread count:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

module.exports = {
  sendMessage,
  getTicketMessages,
  markAllMessagesAsRead,
  getUnreadMessagesCount
};

