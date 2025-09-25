const InstagramComment = require("../../models/instagram_comment");
const InstagramMessage = require("../../models/instagram_message");
const InstagramPost = require("../../models/instagram_post");
const sequelize = require("../../config/mysql_connection");

// Get all Instagram data (comments and messages)
const getAllInstagramData = async (req, res) => {
  try {
    const { type, status, limit = 50, offset = 0 } = req.query;
    
    let whereClause = {};
    if (status === 'unread') {
      whereClause.unread = true;
    } else if (status === 'read') {
      whereClause.read = true;
    } else if (status === 'replied') {
      whereClause.replied = true;
    }

    let data = [];
    
    if (!type || type === 'comments') {
      const comments = await InstagramComment.findAll({
        where: whereClause,
        order: [['created_at', 'DESC']],
        limit: parseInt(limit),
        offset: parseInt(offset)
      });
      data = [...data, ...comments.map(comment => ({ ...comment.dataValues, type: 'comment' }))];
    }
    
    if (!type || type === 'messages') {
      const messages = await InstagramMessage.findAll({
        where: whereClause,
        order: [['created_at', 'DESC']],
        limit: parseInt(limit),
        offset: parseInt(offset)
      });
      data = [...data, ...messages.map(message => ({ ...message.dataValues, type: 'message' }))];
    }

    // Sort combined data by creation date
    data.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    res.json({ 
      success: true, 
      data,
      total: data.length 
    });
  } catch (error) {
    console.error("Error fetching Instagram data:", error);
    res.status(500).json({ error: "Failed to fetch Instagram data" });
  }
};

// Mark comment as read
const markCommentAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const comment = await InstagramComment.findByPk(id);
    
    if (!comment) {
      return res.status(404).json({ error: "Comment not found" });
    }

    comment.read = true;
    comment.unread = false;
    comment.read_at = new Date();
    comment.read_by = req.user?.name || 'System';
    
    await comment.save();
    
    res.json({ 
      success: true, 
      message: "Comment marked as read",
      comment 
    });
  } catch (error) {
    console.error("Error marking comment as read:", error);
    res.status(500).json({ error: "Failed to mark comment as read" });
  }
};

// Mark message as read
const markMessageAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const message = await InstagramMessage.findByPk(id);
    
    if (!message) {
      return res.status(404).json({ error: "Message not found" });
    }

    message.read = true;
    message.unread = false;
    message.read_at = new Date();
    message.read_by = req.user?.name || 'System';
    
    await message.save();
    
    res.json({ 
      success: true, 
      message: "Message marked as read",
      message 
    });
  } catch (error) {
    console.error("Error marking message as read:", error);
    res.status(500).json({ error: "Failed to mark message as read" });
  }
};

// Reply to comment
const replyToComment = async (req, res) => {
  try {
    const { id } = req.params;
    const { reply } = req.body;
    
    if (!reply || !reply.trim()) {
      return res.status(400).json({ error: "Reply text is required" });
    }

    const comment = await InstagramComment.findByPk(id);
    if (!comment) {
      return res.status(404).json({ error: "Comment not found" });
    }

    comment.reply = reply.trim();
    comment.replied = true;
    comment.replied_by = req.user?.name || 'Anonymous';
    comment.replied_at = new Date();
    
    // Also mark as read when replying
    comment.read = true;
    comment.unread = false;
    comment.read_at = new Date();
    comment.read_by = req.user?.name || 'Anonymous';

    await comment.save();
    
    res.json({ 
      success: true, 
      message: "Reply saved successfully",
      comment 
    });
  } catch (error) {
    console.error("Error replying to comment:", error);
    res.status(500).json({ error: "Failed to save reply" });
  }
};

// Reply to message
const replyToMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const { reply } = req.body;
    
    if (!reply || !reply.trim()) {
      return res.status(400).json({ error: "Reply text is required" });
    }

    const message = await InstagramMessage.findByPk(id);
    if (!message) {
      return res.status(404).json({ error: "Message not found" });
    }

    message.reply = reply.trim();
    message.replied = true;
    message.replied_by = req.user?.name || 'Anonymous';
    message.replied_at = new Date();
    
    // Also mark as read when replying
    message.read = true;
    message.unread = false;
    message.read_at = new Date();
    message.read_by = req.user?.name || 'Anonymous';

    await message.save();
    
    res.json({ 
      success: true, 
      message: "Reply saved successfully",
      message 
    });
  } catch (error) {
    console.error("Error replying to message:", error);
    res.status(500).json({ error: "Failed to save reply" });
  }
};

// Get statistics
const getInstagramStats = async (req, res) => {
  try {
    const [commentStats, messageStats] = await Promise.all([
      InstagramComment.findAll({
        attributes: [
          [sequelize.fn('COUNT', sequelize.col('id')), 'total'],
          [sequelize.fn('COUNT', sequelize.literal('CASE WHEN unread = true THEN 1 END')), 'unread'],
          [sequelize.fn('COUNT', sequelize.literal('CASE WHEN read = true THEN 1 END')), 'read'],
          [sequelize.fn('COUNT', sequelize.literal('CASE WHEN replied = true THEN 1 END')), 'replied']
        ],
        raw: true
      }),
      InstagramMessage.findAll({
        attributes: [
          [sequelize.fn('COUNT', sequelize.col('id')), 'total'],
          [sequelize.fn('COUNT', sequelize.literal('CASE WHEN unread = true THEN 1 END')), 'unread'],
          [sequelize.fn('COUNT', sequelize.literal('CASE WHEN read = true THEN 1 END')), 'read'],
          [sequelize.fn('COUNT', sequelize.literal('CASE WHEN replied = true THEN 1 END')), 'replied']
        ],
        raw: true
      })
    ]);

    const commentStatsData = commentStats[0] || { total: 0, unread: 0, read: 0, replied: 0 };
    const messageStatsData = messageStats[0] || { total: 0, unread: 0, read: 0, replied: 0 };

    res.json({
      success: true,
      stats: {
        comments: commentStatsData,
        messages: messageStatsData,
        total: {
          total: parseInt(commentStatsData.total) + parseInt(messageStatsData.total),
          unread: parseInt(commentStatsData.unread) + parseInt(messageStatsData.unread),
          read: parseInt(commentStatsData.read) + parseInt(messageStatsData.read),
          replied: parseInt(commentStatsData.replied) + parseInt(messageStatsData.replied)
        }
      }
    });
  } catch (error) {
    console.error("Error fetching Instagram stats:", error);
    res.status(500).json({ error: "Failed to fetch statistics" });
  }
};

// Mark multiple items as read
const markMultipleAsRead = async (req, res) => {
  try {
    const { ids, type } = req.body;
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "IDs array is required" });
    }

    const Model = type === 'messages' ? InstagramMessage : InstagramComment;
    const updateData = {
      read: true,
      unread: false,
      read_at: new Date(),
      read_by: req.user?.name || 'System'
    };

    const [updatedCount] = await Model.update(updateData, {
      where: { id: ids }
    });

    res.json({ 
      success: true, 
      message: `${updatedCount} items marked as read`,
      updatedCount 
    });
  } catch (error) {
    console.error("Error marking multiple items as read:", error);
    res.status(500).json({ error: "Failed to mark items as read" });
  }
};

// Create Instagram post
const createInstagramPost = async (req, res) => {
  try {
    const {
      caption,
      media_url,
      media_type = 'image',
      hashtags,
      mentions,
      location,
      scheduled_at
    } = req.body;

    if (!caption && !media_url) {
      return res.status(400).json({ error: 'Caption or media URL is required' });
    }

    const postData = {
      caption,
      media_url,
      media_type,
      hashtags,
      mentions,
      location,
      created_by: req.user?.name || 'System',
      status: scheduled_at ? 'scheduled' : 'draft',
      scheduled_at: scheduled_at ? new Date(scheduled_at) : null
    };

    const post = await InstagramPost.create(postData);

    res.status(201).json({
      success: true,
      message: 'Instagram post created successfully',
      post
    });
  } catch (error) {
    console.error('Error creating Instagram post:', error);
    res.status(500).json({ error: 'Failed to create Instagram post' });
  }
};

// Get all Instagram posts
const getAllInstagramPosts = async (req, res) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;
    
    let whereClause = {};
    if (status) {
      whereClause.status = status;
    }

    const posts = await InstagramPost.findAll({
      where: whereClause,
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      success: true,
      data: posts,
      total: posts.length
    });
  } catch (error) {
    console.error('Error fetching Instagram posts:', error);
    res.status(500).json({ error: 'Failed to fetch Instagram posts' });
  }
};

// Update Instagram post
const updateInstagramPost = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Add updated_by field
    updateData.updated_by = req.user?.name || 'System';

    const [updatedCount] = await InstagramPost.update(updateData, {
      where: { id }
    });

    if (updatedCount === 0) {
      return res.status(404).json({ error: 'Instagram post not found' });
    }

    const updatedPost = await InstagramPost.findByPk(id);

    res.json({
      success: true,
      message: 'Instagram post updated successfully',
      post: updatedPost
    });
  } catch (error) {
    console.error('Error updating Instagram post:', error);
    res.status(500).json({ error: 'Failed to update Instagram post' });
  }
};

// Delete Instagram post
const deleteInstagramPost = async (req, res) => {
  try {
    const { id } = req.params;

    const deletedCount = await InstagramPost.destroy({
      where: { id }
    });

    if (deletedCount === 0) {
      return res.status(404).json({ error: 'Instagram post not found' });
    }

    res.json({
      success: true,
      message: 'Instagram post deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting Instagram post:', error);
    res.status(500).json({ error: 'Failed to delete Instagram post' });
  }
};

module.exports = {
  getAllInstagramData,
  markCommentAsRead,
  markMessageAsRead,
  replyToComment,
  replyToMessage,
  getInstagramStats,
  markMultipleAsRead,
  createInstagramPost,
  getAllInstagramPosts,
  updateInstagramPost,
  deleteInstagramPost
};
