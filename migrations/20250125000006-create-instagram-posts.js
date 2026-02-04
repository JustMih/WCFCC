'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('instagram_posts', {
      id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        primaryKey: true,
        autoIncrement: true,
      },
      caption: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      media_url: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      media_type: {
        type: Sequelize.ENUM('image', 'video', 'carousel'),
        defaultValue: 'image',
        allowNull: false,
      },
      hashtags: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      mentions: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      location: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      // Post status
      status: {
        type: Sequelize.ENUM('draft', 'scheduled', 'published', 'failed'),
        defaultValue: 'draft',
        allowNull: false,
      },
      scheduled_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      published_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      instagram_post_id: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      // Creator info
      created_by: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      updated_by: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      // Analytics
      likes_count: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        allowNull: false,
      },
      comments_count: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        allowNull: false,
      },
      shares_count: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        allowNull: false,
      },
      reach_count: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        allowNull: false,
      },
      impressions_count: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        allowNull: false,
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
    await queryInterface.dropTable('instagram_posts');
  },
};
