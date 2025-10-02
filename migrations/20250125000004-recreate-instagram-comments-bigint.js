'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Drop the existing table
    await queryInterface.dropTable('instagram_comments');
    
    // Recreate with BIGINT columns
    await queryInterface.createTable('instagram_comments', {
      id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        primaryKey: true,
      },
      media_id: {
        type: Sequelize.BIGINT,
        allowNull: true,
      },
      parent_id: {
        type: Sequelize.BIGINT,
        allowNull: true,
      },
      text: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      from_id: {
        type: Sequelize.BIGINT,
        allowNull: true,
      },
      from_username: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      raw_payload: {
        type: Sequelize.JSON,
        allowNull: true,
      },
      replied: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        allowNull: false,
      },
      replied_by: {
        type: Sequelize.STRING(255),
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
        type: Sequelize.STRING(255),
        allowNull: true,
      },
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
    
    console.log('✅ Instagram comments table recreated with BIGINT columns');
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('instagram_comments');
  },
};
