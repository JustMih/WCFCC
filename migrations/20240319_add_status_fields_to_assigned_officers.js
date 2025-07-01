'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Add status enum
    await queryInterface.addColumn('AssignedOfficers', 'status', {
      type: Sequelize.ENUM('Active', 'Reassigned', 'Completed'),
      defaultValue: 'Active',
      allowNull: false
    });

    // Add reassignment history
    await queryInterface.addColumn('AssignedOfficers', 'reassignment_history', {
      type: Sequelize.JSON,
      allowNull: true
    });

    // Add assigned_at timestamp
    await queryInterface.addColumn('AssignedOfficers', 'assigned_at', {
      type: Sequelize.DATE,
      defaultValue: Sequelize.fn('NOW'),
      allowNull: false
    });

    // Add completed_at timestamp
    await queryInterface.addColumn('AssignedOfficers', 'completed_at', {
      type: Sequelize.DATE,
      allowNull: true
    });

    // Add notes field
    await queryInterface.addColumn('AssignedOfficers', 'notes', {
      type: Sequelize.TEXT,
      allowNull: true
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Remove all added columns
    await queryInterface.removeColumn('AssignedOfficers', 'notes');
    await queryInterface.removeColumn('AssignedOfficers', 'completed_at');
    await queryInterface.removeColumn('AssignedOfficers', 'assigned_at');
    await queryInterface.removeColumn('AssignedOfficers', 'reassignment_history');
    
    // Remove the ENUM type after removing the column
    await queryInterface.removeColumn('AssignedOfficers', 'status');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_AssignedOfficers_status";');
  }
}; 