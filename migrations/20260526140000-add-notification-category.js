"use strict";

/** Notifications.category — type label (e.g. Handover, Assignment, reminder category) */
module.exports = {
  up: async (queryInterface, Sequelize) => {
    const table = await queryInterface.describeTable("Notifications");
    if (table.category) {
      return;
    }

    await queryInterface.addColumn("Notifications", "category", {
      type: Sequelize.STRING(100),
      allowNull: true,
      after: "comment",
    });
  },

  down: async (queryInterface) => {
    const table = await queryInterface.describeTable("Notifications");
    if (!table.category) {
      return;
    }
    await queryInterface.removeColumn("Notifications", "category");
  },
};
