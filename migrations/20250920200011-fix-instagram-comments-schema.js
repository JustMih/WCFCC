'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    // Check if media_id column exists, if not add it
    const tableDescription = await queryInterface.describeTable('instagram_comments');
    
    if (!tableDescription.media_id) {
      await queryInterface.addColumn('instagram_comments', 'media_id', {
        type: Sequelize.STRING,
        allowNull: true
      });
    }
    
    if (!tableDescription.parent_id) {
      await queryInterface.addColumn('instagram_comments', 'parent_id', {
        type: Sequelize.STRING,
        allowNull: true
      });
    }
    
    if (!tableDescription.text) {
      await queryInterface.addColumn('instagram_comments', 'text', {
        type: Sequelize.TEXT,
        allowNull: true
      });
    }
    
    if (!tableDescription.from_id) {
      await queryInterface.addColumn('instagram_comments', 'from_id', {
        type: Sequelize.STRING,
        allowNull: true
      });
    }
    
    if (!tableDescription.from_username) {
      await queryInterface.addColumn('instagram_comments', 'from_username', {
        type: Sequelize.STRING,
        allowNull: true
      });
    }
    
    if (!tableDescription.raw_payload) {
      await queryInterface.addColumn('instagram_comments', 'raw_payload', {
        type: Sequelize.JSON,
        allowNull: true
      });
    }
    
    if (!tableDescription.replied) {
      await queryInterface.addColumn('instagram_comments', 'replied', {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        allowNull: false
      });
    }
    
    if (!tableDescription.replied_by) {
      await queryInterface.addColumn('instagram_comments', 'replied_by', {
        type: Sequelize.STRING,
        allowNull: true
      });
    }
    
    if (!tableDescription.replied_at) {
      await queryInterface.addColumn('instagram_comments', 'replied_at', {
        type: Sequelize.DATE,
        allowNull: true
      });
    }
    
    if (!tableDescription.reply) {
      await queryInterface.addColumn('instagram_comments', 'reply', {
        type: Sequelize.TEXT,
        allowNull: true
      });
    }
    
    if (!tableDescription.unread) {
      await queryInterface.addColumn('instagram_comments', 'unread', {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
        allowNull: false
      });
    }
    
    if (!tableDescription.read) {
      await queryInterface.addColumn('instagram_comments', 'read', {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        allowNull: false
      });
    }
  },

  async down (queryInterface, Sequelize) {
    // Remove the columns that were added
    await queryInterface.removeColumn('instagram_comments', 'media_id');
    await queryInterface.removeColumn('instagram_comments', 'parent_id');
    await queryInterface.removeColumn('instagram_comments', 'text');
    await queryInterface.removeColumn('instagram_comments', 'from_id');
    await queryInterface.removeColumn('instagram_comments', 'from_username');
    await queryInterface.removeColumn('instagram_comments', 'raw_payload');
    await queryInterface.removeColumn('instagram_comments', 'replied');
    await queryInterface.removeColumn('instagram_comments', 'replied_by');
    await queryInterface.removeColumn('instagram_comments', 'replied_at');
    await queryInterface.removeColumn('instagram_comments', 'reply');
    await queryInterface.removeColumn('instagram_comments', 'unread');
    await queryInterface.removeColumn('instagram_comments', 'read');
  }
};
