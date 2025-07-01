"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn("Ticket_assignments", "attachment_path", {
      type: Sequelize.STRING,
      allowNull: true,
    });
    await queryInterface.addColumn("Ticket_assignments", "evidence_url", {
      type: Sequelize.STRING,
      allowNull: true,
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn("Ticket_assignments", "attachment_path");
    await queryInterface.removeColumn("Ticket_assignments", "evidence_url");
  },
}; 