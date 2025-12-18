const TicketChart = require('../../models/TicketChart');
const TicketChartRead = require('../../models/TicketChartRead');
const Ticket = require('../../models/Ticket');
const User = require('../../models/User');
const { Op } = require('sequelize');

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

