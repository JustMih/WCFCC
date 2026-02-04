'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('Tickets', 'workflow_path', {
      type: Sequelize.ENUM('MINOR_UNIT', 'MINOR_DIRECTORATE', 'MAJOR_UNIT', 'MAJOR_DIRECTORATE'),
      allowNull: true
    });

    await queryInterface.addColumn('Tickets', 'current_workflow_step', {
      type: Sequelize.INTEGER,
      allowNull: true,
      defaultValue: 1
    });

    await queryInterface.addColumn('Tickets', 'workflow_completed', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false
    });

    await queryInterface.addColumn('Tickets', 'workflow_started_at', {
      type: Sequelize.DATE,
      allowNull: true
    });

    await queryInterface.addColumn('Tickets', 'workflow_completed_at', {
      type: Sequelize.DATE,
      allowNull: true
    });

    await queryInterface.addColumn('Tickets', 'current_workflow_role', {
      type: Sequelize.STRING(50),
      allowNull: true
    });

    await queryInterface.addColumn('Tickets', 'workflow_notes', {
      type: Sequelize.TEXT,
      allowNull: true
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('Tickets', 'workflow_path');
    await queryInterface.removeColumn('Tickets', 'current_workflow_step');
    await queryInterface.removeColumn('Tickets', 'workflow_completed');
    await queryInterface.removeColumn('Tickets', 'workflow_started_at');
    await queryInterface.removeColumn('Tickets', 'workflow_completed_at');
    await queryInterface.removeColumn('Tickets', 'current_workflow_role');
    await queryInterface.removeColumn('Tickets', 'workflow_notes');
  }
}; 