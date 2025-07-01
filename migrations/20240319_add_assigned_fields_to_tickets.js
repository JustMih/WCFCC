'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('Tickets', 'assigned_to', {
      type: Sequelize.UUID,
      allowNull: true,
      references: {
        model: 'Users',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });

    await queryInterface.addColumn('Tickets', 'assigned_by', {
      type: Sequelize.UUID,
      allowNull: true,
      references: {
        model: 'Users',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });

    await queryInterface.addColumn('Tickets', 'assigned_at', {
      type: Sequelize.DATE,
      allowNull: true
    });

    // Add index for better query performance
    await queryInterface.addIndex('Tickets', ['assigned_to'], {
      name: 'idx_tickets_assigned_to'
    });

    await queryInterface.addIndex('Tickets', ['assigned_by'], {
      name: 'idx_tickets_assigned_by'
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Remove indexes first
    await queryInterface.removeIndex('Tickets', 'idx_tickets_assigned_to');
    await queryInterface.removeIndex('Tickets', 'idx_tickets_assigned_by');

    // Remove columns
    await queryInterface.removeColumn('Tickets', 'assigned_to');
    await queryInterface.removeColumn('Tickets', 'assigned_by');
    await queryInterface.removeColumn('Tickets', 'assigned_at');
  }
}; 