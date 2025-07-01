'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // await queryInterface.addColumn('Tickets', 'forwarded_by_id', {
    //   type: Sequelize.UUID,
    //   allowNull: true,
    //   references: {
    //     model: 'Users',
    //     key: 'id'
    //   },
    //   onUpdate: 'CASCADE',
    //   onDelete: 'SET NULL'
    // });

    // await queryInterface.addColumn('Tickets', 'forwarded_at', {
    //   type: Sequelize.DATE,
    //   allowNull: true
    // });

    // await queryInterface.addColumn('Tickets', 'converted_by_id', {
    //   type: Sequelize.UUID,
    //   allowNull: true,
    //   references: {
    //     model: 'Users',
    //     key: 'id'
    //   },
    //   onUpdate: 'CASCADE',
    //   onDelete: 'SET NULL'
    // });

    // await queryInterface.addColumn('Tickets', 'converted_at', {
    //   type: Sequelize.DATE,
    //   allowNull: true
    // });

    // await queryInterface.addColumn('Tickets', 'responsible_unit_name', {
    //   type: Sequelize.STRING,
    //   allowNull: true,
    //   after: 'responsible_unit_id'
    // });

  },

  async down(queryInterface, Sequelize) {
    // await queryInterface.removeColumn('Tickets', 'forwarded_by_id');
    // await queryInterface.removeColumn('Tickets', 'forwarded_at');
    // await queryInterface.removeColumn('Tickets', 'converted_by_id');
    // await queryInterface.removeColumn('Tickets', 'converted_at');
    // await queryInterface.removeColumn('Tickets', 'responsible_unit_name');
  }
};
