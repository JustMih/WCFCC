'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('queue_log', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      time: {
        type: Sequelize.DATE,
        allowNull: false
      },
      callid: {
        type: Sequelize.STRING(64),
        allowNull: false
      },
      queuename: {
        type: Sequelize.STRING(128),
        allowNull: false
      },
      agent: {
        type: Sequelize.STRING(128),
        allowNull: true
      },
      event: {
        type: Sequelize.STRING(32),
        allowNull: false
      },
      data1: {
        type: Sequelize.STRING(128),
        allowNull: true
      },
      data2: {
        type: Sequelize.STRING(128),
        allowNull: true
      },
      data3: {
        type: Sequelize.STRING(128),
        allowNull: true
      },
      data4: {
        type: Sequelize.STRING(128),
        allowNull: true
      },
      data5: {
        type: Sequelize.STRING(128),
        allowNull: true
      }
    });

    // Add indexes
    await queryInterface.addIndex('queue_log', ['time'], {
      name: 'queue_log_time_idx'
    });
    await queryInterface.addIndex('queue_log', ['callid'], {
      name: 'queue_log_callid_idx'
    });
    await queryInterface.addIndex('queue_log', ['queuename'], {
      name: 'queue_log_queuename_idx'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('queue_log');
  }
}; 