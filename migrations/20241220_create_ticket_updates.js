'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('TicketUpdates', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      ticket_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'Tickets',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'Users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      user_name: {
        type: Sequelize.STRING(100),
        allowNull: false
      },
      user_role: {
        type: Sequelize.STRING(50),
        allowNull: false
      },
      update_text: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      update_date: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      assignment_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'TicketAssignments',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      }
    });

    // Add indexes (check if they exist first)
    try {
      await queryInterface.addIndex('TicketUpdates', ['ticket_id'], {
        name: 'idx_ticket_update_ticket_id'
      });
    } catch (error) {
      if (!error.message.includes('Duplicate key name')) {
        throw error;
      }
    }
    
    try {
      await queryInterface.addIndex('TicketUpdates', ['user_id'], {
        name: 'idx_ticket_update_user_id'
      });
    } catch (error) {
      if (!error.message.includes('Duplicate key name')) {
        throw error;
      }
    }
    
    try {
      await queryInterface.addIndex('TicketUpdates', ['update_date'], {
        name: 'idx_ticket_update_date'
      });
    } catch (error) {
      if (!error.message.includes('Duplicate key name')) {
        throw error;
      }
    }
    
    try {
      await queryInterface.addIndex('TicketUpdates', ['is_active'], {
        name: 'idx_ticket_update_active'
      });
    } catch (error) {
      if (!error.message.includes('Duplicate key name')) {
        throw error;
      }
    }
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('TicketUpdates');
  }
};
