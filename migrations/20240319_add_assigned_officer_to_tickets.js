'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('Tickets', 'assigned_officer_id', {
      type: Sequelize.UUID,
      allowNull: true,
      references: {
        model: 'AssignedOfficers',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });

    // Add index for better query performance
    await queryInterface.addIndex('Tickets', ['assigned_officer_id'], {
      name: 'idx_tickets_assigned_officer'
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Remove index first
    await queryInterface.removeIndex('Tickets', 'idx_tickets_assigned_officer');

    // Remove column
    await queryInterface.removeColumn('Tickets', 'assigned_officer_id');
  }
}; 