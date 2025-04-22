'use strict';
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('TicketJustifications', {
      id: {
        allowNull: false,
        primaryKey: true,
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4
      },
      ticket_id: {
        type: Sequelize.UUID,
        references: { model: 'Tickets', key: 'id' },
        onDelete: 'CASCADE'
      },
      user_id: {
        type: Sequelize.UUID,
        references: { model: 'Users', key: 'id' },
        onDelete: 'SET NULL'
      },
      role_at_time: Sequelize.STRING,
      justification: Sequelize.TEXT,
      created_at: Sequelize.DATE,
      updated_at: Sequelize.DATE
    });
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('TicketJustifications');
  }
};
