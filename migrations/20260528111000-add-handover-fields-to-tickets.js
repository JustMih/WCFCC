'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('Tickets', 'handover_id', {
      type: Sequelize.UUID,
      allowNull: true,
      references: {
        model: 'UserHandovers',
        key: 'id',
      },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    });

    await queryInterface.addColumn('Tickets', 'handover_from_user_id', {
      type: Sequelize.UUID,
      allowNull: true,
      references: {
        model: 'Users',
        key: 'id',
      },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    });

    await queryInterface.addColumn('Tickets', 'handover_effective_role', {
      type: Sequelize.STRING(100),
      allowNull: true,
    });

    await queryInterface.addIndex('Tickets', ['handover_id']);
    await queryInterface.addIndex('Tickets', ['handover_from_user_id']);
  },

  down: async (queryInterface) => {
    await queryInterface.removeIndex('Tickets', ['handover_from_user_id']);
    await queryInterface.removeIndex('Tickets', ['handover_id']);
    await queryInterface.removeColumn('Tickets', 'handover_effective_role');
    await queryInterface.removeColumn('Tickets', 'handover_from_user_id');
    await queryInterface.removeColumn('Tickets', 'handover_id');
  },
};
