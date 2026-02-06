'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('TicketUpdateReads', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      ticket_update_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'TicketUpdates',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        comment: 'Reference to the ticket update that was read'
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'Users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        comment: 'User who read the update'
      },
      read_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
        comment: 'Timestamp when the update was read'
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      }
    });

    // Add indexes for better query performance
    try {
      await queryInterface.addIndex('TicketUpdateReads', ['ticket_update_id'], {
        name: 'idx_ticket_update_read_update_id'
      });
    } catch (error) {
      if (!error.message.includes('Duplicate key name')) {
        throw error;
      }
    }

    try {
      await queryInterface.addIndex('TicketUpdateReads', ['user_id'], {
        name: 'idx_ticket_update_read_user_id'
      });
    } catch (error) {
      if (!error.message.includes('Duplicate key name')) {
        throw error;
      }
    }

    // Add unique constraint to ensure a user can only have one read record per update
    try {
      await queryInterface.addIndex('TicketUpdateReads', ['ticket_update_id', 'user_id'], {
        name: 'idx_ticket_update_read_unique',
        unique: true,
        comment: 'Ensure a user can only have one read record per update'
      });
    } catch (error) {
      if (!error.message.includes('Duplicate key name')) {
        throw error;
      }
    }
  },

  down: async (queryInterface, Sequelize) => {
    // Remove indexes first
    try {
      await queryInterface.removeIndex('TicketUpdateReads', 'idx_ticket_update_read_unique');
    } catch (error) {
      // Index might not exist
    }

    try {
      await queryInterface.removeIndex('TicketUpdateReads', 'idx_ticket_update_read_user_id');
    } catch (error) {
      // Index might not exist
    }

    try {
      await queryInterface.removeIndex('TicketUpdateReads', 'idx_ticket_update_read_update_id');
    } catch (error) {
      // Index might not exist
    }

    // Drop table
    await queryInterface.dropTable('TicketUpdateReads');
  }
};

