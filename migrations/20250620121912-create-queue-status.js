'use strict';
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('queue_status', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      queue: {
        type: Sequelize.STRING
      },
      callers: {
        type: Sequelize.INTEGER
      },
      longestWait: {
        type: Sequelize.INTEGER
      },
      availableAgents: {
        type: Sequelize.INTEGER
      },
      busyAgents: {
        type: Sequelize.INTEGER
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('queue_status');
  }
};
