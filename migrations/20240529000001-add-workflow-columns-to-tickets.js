'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('Tickets', 'evidence_url', {
      type: Sequelize.STRING,
      allowNull: true
    });

    await queryInterface.addColumn('Tickets', 'review_notes', {
      type: Sequelize.TEXT,
      allowNull: true
    });

    await queryInterface.addColumn('Tickets', 'approval_notes', {
      type: Sequelize.TEXT,
      allowNull: true
    });

    // Update status enum to include new workflow statuses
    await queryInterface.changeColumn('Tickets', 'status', {
      type: Sequelize.ENUM(
        'Open',
        'Assigned',
        'Carried Forward',
        'In Progress',
        'Returned',
        'Closed',
        'Pending Review',
        'Pending Approval'
      ),
      allowNull: false,
      defaultValue: 'Open'
    });

    // Update assigned_to_role enum to include all workflow roles
    await queryInterface.changeColumn('Tickets', 'assigned_to_role', {
      type: Sequelize.ENUM(
        'Agent',
        'Coordinator',
        'Attendee',
        'Head of Unit',
        'Director',
        'DG'
      ),
      allowNull: true
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('Tickets', 'evidence_url');
    await queryInterface.removeColumn('Tickets', 'review_notes');
    await queryInterface.removeColumn('Tickets', 'approval_notes');

    // Revert status enum
    await queryInterface.changeColumn('Tickets', 'status', {
      type: Sequelize.ENUM(
        'Open',
        'Assigned',
        'Carried Forward',
        'In Progress',
        'Returned',
        'Closed'
      ),
      allowNull: false,
      defaultValue: 'Open'
    });

    // Revert assigned_to_role enum
    await queryInterface.changeColumn('Tickets', 'assigned_to_role', {
      type: Sequelize.ENUM(
        'Agent',
        'Coordinator',
        'Attendee',
        'Focal',
        'Manager',
        'Director',
        'DG'
      ),
      allowNull: true
    });
  }
}; 