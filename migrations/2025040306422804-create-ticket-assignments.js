'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('TicketAssignments', {
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
      assigned_by_id: {
        type: Sequelize.UUID,
        references: { model: 'Users', key: 'id' },
        onDelete: 'SET NULL'
      },
      assigned_to_id: {
        type: Sequelize.UUID,
        references: { model: 'Users', key: 'id' },
        onDelete: 'SET NULL'
      },
      assigned_to_role: Sequelize.STRING,
      action: Sequelize.ENUM('Assigned', 'Returned', 'Reassigned'),
      reason: Sequelize.TEXT,
      created_at: Sequelize.DATE,
      updated_at: Sequelize.DATE
    });
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('TicketAssignments');
  }
};
