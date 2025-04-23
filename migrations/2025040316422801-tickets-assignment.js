// migrations/20250319-create-ticket-assignments.js
'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('Ticket_assignments', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      ticket_id: {
        type: Sequelize.UUID,
        references: { model: 'Tickets', key: 'id' },
      },
      assigned_by_id: Sequelize.UUID,
      assigned_to_id: Sequelize.UUID,
      assigned_to_role: Sequelize.ENUM('Coordinator', 'Attendee', 'Focal', 'Manager', 'Director', 'DG'),
      action: Sequelize.ENUM('Assigned', 'Returned', 'Reassigned'),
      reason: Sequelize.TEXT,
      created_at: Sequelize.DATE,
    });
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('Ticket_assignments');
  }
};
