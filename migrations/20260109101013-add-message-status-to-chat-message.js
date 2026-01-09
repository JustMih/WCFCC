"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Add message status field (sent, delivered, read)
    await queryInterface.addColumn("ChatMassage", "status", {
      type: Sequelize.ENUM("sent", "delivered", "read"),
      allowNull: false,
      defaultValue: "sent",
    });

    // Add deliveredAt timestamp
    await queryInterface.addColumn("ChatMassage", "deliveredAt", {
      type: Sequelize.DATE,
      allowNull: true,
    });

    // Add readAt timestamp (if not already exists)
    await queryInterface.addColumn("ChatMassage", "readAt", {
      type: Sequelize.DATE,
      allowNull: true,
    });

    // Update existing messages: if isRead is true, set status to 'read', else 'delivered'
    await queryInterface.sequelize.query(`
      UPDATE ChatMassage 
      SET status = CASE 
        WHEN isRead = true THEN 'read'
        ELSE 'delivered'
      END,
      deliveredAt = createdAt,
      readAt = CASE 
        WHEN isRead = true THEN updatedAt
        ELSE NULL
      END
    `);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn("ChatMassage", "status");
    await queryInterface.removeColumn("ChatMassage", "deliveredAt");
    await queryInterface.removeColumn("ChatMassage", "readAt");
  },
};
