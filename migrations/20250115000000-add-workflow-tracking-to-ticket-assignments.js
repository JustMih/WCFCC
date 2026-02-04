'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Add workflow tracking fields to Ticket_assignments table
    await queryInterface.addColumn('Ticket_assignments', 'workflow_path', {
      type: Sequelize.STRING(100),
      allowNull: true,
      comment: 'Workflow path (e.g., MINOR_UNIT, MAJOR_DIRECTORATE)'
    });

    await queryInterface.addColumn('Ticket_assignments', 'workflow_step', {
      type: Sequelize.INTEGER,
      allowNull: true,
      comment: 'Current step in the workflow (1-based)'
    });

    await queryInterface.addColumn('Ticket_assignments', 'workflow_current_role', {
      type: Sequelize.STRING(100),
      allowNull: true,
      comment: 'Current role in the workflow (e.g., coordinator, director)'
    });

    await queryInterface.addColumn('Ticket_assignments', 'workflow_next_role', {
      type: Sequelize.STRING(100),
      allowNull: true,
      comment: 'Next role in the workflow'
    });

    await queryInterface.addColumn('Ticket_assignments', 'workflow_total_steps', {
      type: Sequelize.INTEGER,
      allowNull: true,
      comment: 'Total number of steps in the workflow'
    });

    await queryInterface.addColumn('Ticket_assignments', 'sla_total_days', {
      type: Sequelize.INTEGER,
      allowNull: true,
      comment: 'Total SLA working days for the workflow'
    });

    await queryInterface.addColumn('Ticket_assignments', 'sla_current_step_days', {
      type: Sequelize.STRING(50),
      allowNull: true,
      comment: 'SLA days for current step (e.g., "2 working days")'
    });

    await queryInterface.addColumn('Ticket_assignments', 'sla_remaining_days', {
      type: Sequelize.INTEGER,
      allowNull: true,
      comment: 'Remaining SLA days for current step'
    });

    await queryInterface.addColumn('Ticket_assignments', 'backup_type', {
      type: Sequelize.STRING(50),
      allowNull: true,
      comment: 'Type of backup record (e.g., workflow_action, system_backup)'
    });

    await queryInterface.addColumn('Ticket_assignments', 'action_details', {
      type: Sequelize.TEXT,
      allowNull: true,
      comment: 'JSON string containing detailed action information'
    });

    // Add indexes for better query performance
    await queryInterface.addIndex('Ticket_assignments', ['workflow_path']);
    await queryInterface.addIndex('Ticket_assignments', ['workflow_step']);
    await queryInterface.addIndex('Ticket_assignments', ['workflow_current_role']);
    await queryInterface.addIndex('Ticket_assignments', ['backup_type']);
    await queryInterface.addIndex('Ticket_assignments', ['ticket_id', 'workflow_step']);
  },

  async down(queryInterface, Sequelize) {
    // Remove indexes first
    await queryInterface.removeIndex('Ticket_assignments', ['workflow_path']);
    await queryInterface.removeIndex('Ticket_assignments', ['workflow_step']);
    await queryInterface.removeIndex('Ticket_assignments', ['workflow_current_role']);
    await queryInterface.removeIndex('Ticket_assignments', ['backup_type']);
    await queryInterface.removeIndex('Ticket_assignments', ['ticket_id', 'workflow_step']);

    // Remove columns
    await queryInterface.removeColumn('Ticket_assignments', 'workflow_path');
    await queryInterface.removeColumn('Ticket_assignments', 'workflow_step');
    await queryInterface.removeColumn('Ticket_assignments', 'workflow_current_role');
    await queryInterface.removeColumn('Ticket_assignments', 'workflow_next_role');
    await queryInterface.removeColumn('Ticket_assignments', 'workflow_total_steps');
    await queryInterface.removeColumn('Ticket_assignments', 'sla_total_days');
    await queryInterface.removeColumn('Ticket_assignments', 'sla_current_step_days');
    await queryInterface.removeColumn('Ticket_assignments', 'sla_remaining_days');
    await queryInterface.removeColumn('Ticket_assignments', 'backup_type');
    await queryInterface.removeColumn('Ticket_assignments', 'action_details');
  }
}; 