'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // First, modify the status column to be an ENUM
    await queryInterface.changeColumn('Notifications', 'status', {
      type: Sequelize.ENUM('read', 'unread'),
      allowNull: false,
      defaultValue: 'unread'
    });

    // Then add the comment column if it doesn't exist
    await queryInterface.addColumn('Notifications', 'comment', {
      type: Sequelize.TEXT,
      allowNull: true
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Revert status column back to STRING
    await queryInterface.changeColumn('Notifications', 'status', {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: 'Pending'
    });

    // Remove the comment column
    await queryInterface.removeColumn('Notifications', 'comment');
  }
}; 