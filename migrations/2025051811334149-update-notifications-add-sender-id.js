'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Add sender_id after recipient_id
    await queryInterface.addColumn('Notifications', 'sender_id', {
      type: Sequelize.UUID,
      allowNull: true,
      collate: 'utf8mb4_bin',
      after: 'recipient_id' // ✅ MySQL will place this column in order
    });

    // Add FK constraint (with correct case on table name)
    await queryInterface.sequelize.query(`
      ALTER TABLE Notifications
      ADD CONSTRAINT sender_id
      FOREIGN KEY (sender_id)
      REFERENCES Users(id)
      ON DELETE SET NULL
    `);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.sequelize.query(`
      ALTER TABLE Notifications DROP FOREIGN KEY fk_notification_sender
    `);
    await queryInterface.removeColumn('Notifications', 'sender_id');
  }
};
