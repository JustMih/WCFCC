'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('instagram_messages', {
      id: {
        type: Sequelize.STRING,
        allowNull: false,
        primaryKey: true,
      },
      sender_id: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      sender_username: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      text: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      message_type: {
        type: Sequelize.ENUM('text', 'image', 'video', 'audio', 'file'),
        defaultValue: 'text',
        allowNull: false,
      },
      media_url: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      raw_payload: {
        type: Sequelize.JSON,
        allowNull: true,
      },
      // Status tracking
      unread: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
        allowNull: false,
      },
      read: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        allowNull: false,
      },
      read_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      read_by: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      // Reply tracking
      replied: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        allowNull: false,
      },
      replied_by: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      replied_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      reply: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      // Timestamps
      created_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('instagram_messages');
  },
};
