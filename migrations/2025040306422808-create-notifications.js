'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('Notifications', {
      id: {
        allowNull: false,
        primaryKey: true,
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4
      },
      ticket_id: {
        type: Sequelize.UUID,
        references: { model: 'Tickets', key: 'id' },
        onDelete: 'CASCADE'
      },
      recipient_id: {
        type: Sequelize.UUID,
        references: { model: 'Users', key: 'id' },
        onDelete: 'SET NULL'
      },
      message: Sequelize.TEXT,
      channel: Sequelize.ENUM('Email', 'SMS', 'In-System'),
      status: Sequelize.ENUM('Pending', 'Sent', 'Failed'),
      created_at: Sequelize.DATE,
      updated_at: Sequelize.DATE
    });
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('Notifications');
  }
};
