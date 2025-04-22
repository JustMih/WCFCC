'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('IVRDTMFMapping', {
      id: {
        type: Sequelize.STRING,
        allowNull: false,
        primaryKey: true
      },
      ivr_voice_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'IVRVoice', // Corrected casing
          key: 'id',
        },
        onDelete: 'CASCADE',
      },
      dtmf_key: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      ivr_action_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'IVRActions', // Corrected casing
          key: 'id',
        },
        onDelete: 'CASCADE',
      },
      parameter: {
        type: Sequelize.STRING,
        allowNull: true,
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('NOW()')
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('NOW()')
      }
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('IVRDTMFMapping');
  }
};
