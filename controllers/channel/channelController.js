const Channel = require('../../models/Channel');
const User = require('../../models/User');
const { Op } = require("sequelize");
const sequelize = require('../../config/mysql_connection');

// Get all channels
const getAllChannels = async (req, res) => {
  try {
    const channels = await Channel.findAll({
      order: [['name', 'ASC']],
      include: [
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'full_name', 'email']
        },
        {
          model: User,
          as: 'updater',
          attributes: ['id', 'full_name', 'email']
        }
      ]
    });

    res.status(200).json({
      success: true,
      message: 'Channels fetched successfully',
      totalChannels: channels.length,
      data: channels
    });
  } catch (err) {
    console.error("Error fetching channels:", err);
    res.status(500).json({
      success: false,
      message: 'Something went wrong',
      error: err.message
    });
  }
};

// Get channel by ID
const getChannelById = async (req, res) => {
  try {
    const { id } = req.params;

    const channel = await Channel.findByPk(id, {
      include: [
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'full_name', 'email']
        },
        {
          model: User,
          as: 'updater',
          attributes: ['id', 'full_name', 'email']
        }
      ]
    });

    if (!channel) {
      return res.status(404).json({
        success: false,
        message: "Channel not found"
      });
    }

    res.status(200).json({
      success: true,
      message: "Channel fetched successfully",
      data: channel
    });
  } catch (err) {
    console.error("Error fetching channel:", err);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message
    });
  }
};

// Create Channel
const createChannel = async (req, res) => {
  try {
    const { name } = req.body;
    const userId = req.user?.id || req.user?.userId || req.user?.user_id;

    if (!name || name.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Channel name is required",
      });
    }

    // Check if channel with same name already exists (case-insensitive)
    const existingChannel = await Channel.findOne({
      where: sequelize.where(
        sequelize.fn('LOWER', sequelize.col('name')),
        name.trim().toLowerCase()
      )
    });

    if (existingChannel) {
      return res.status(400).json({
        success: false,
        message: "Channel with this name already exists",
      });
    }

    const channel = await Channel.create({
      name: name.trim(),
      created_by: userId,
      updated_by: userId,
    });

    res.status(201).json({
      success: true,
      message: "Channel created successfully",
      data: channel,
    });
  } catch (err) {
    console.error("Error creating channel:", err);
    res.status(500).json({
      success: false,
      message: "Failed to create channel",
      error: err.message,
    });
  }
};

// Update Channel
const updateChannel = async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    const userId = req.user?.id || req.user?.userId || req.user?.user_id;

    if (!name || name.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Channel name is required",
      });
    }

    const channel = await Channel.findByPk(id);
    if (!channel) {
      return res.status(404).json({
        success: false,
        message: "Channel not found",
      });
    }

    // Check if another channel with same name already exists (case-insensitive)
    const existingChannel = await Channel.findOne({
      where: {
        [Op.and]: [
          { id: { [Op.ne]: id } },
          sequelize.where(
            sequelize.fn('LOWER', sequelize.col('name')),
            name.trim().toLowerCase()
          )
        ]
      }
    });

    if (existingChannel) {
      return res.status(400).json({
        success: false,
        message: "Channel with this name already exists",
      });
    }

    await channel.update({
      name: name.trim(),
      updated_by: userId,
    });

    res.status(200).json({
      success: true,
      message: "Channel updated successfully",
      data: channel,
    });
  } catch (err) {
    console.error("Error updating channel:", err);
    res.status(500).json({
      success: false,
      message: "Failed to update channel",
      error: err.message,
    });
  }
};

// Delete Channel
const deleteChannel = async (req, res) => {
  try {
    const { id } = req.params;

    const channel = await Channel.findByPk(id);
    if (!channel) {
      return res.status(404).json({
        success: false,
        message: "Channel not found",
      });
    }

    // Check if channel has tickets
    const Ticket = require('../../models/Ticket');
    const ticketsCount = await Ticket.count({
      where: { channel_id: id },
    });

    if (ticketsCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete channel. It has ${ticketsCount} ticket(s) associated with it. Please reassign or delete tickets first.`,
      });
    }

    await channel.destroy();

    res.status(200).json({
      success: true,
      message: "Channel deleted successfully",
    });
  } catch (err) {
    console.error("Error deleting channel:", err);
    res.status(500).json({
      success: false,
      message: "Failed to delete channel",
      error: err.message,
    });
  }
};

module.exports = {
  getAllChannels,
  getChannelById,
  createChannel,
  updateChannel,
  deleteChannel,
};
