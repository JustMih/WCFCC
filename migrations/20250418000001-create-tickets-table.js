'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Tickets', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      created_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'Users',
          key: 'id'
        },
        onDelete: 'SET NULL'
      },
      assigned_to_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'Users',
          key: 'id'
        },
        onDelete: 'SET NULL'
      },
      attended_by_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'Users',
          key: 'id'
        },
        onDelete: 'SET NULL'
      },
      rated_by_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'Users',
          key: 'id'
        },
        onDelete: 'SET NULL'
      },
      responsible_unit_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'functions',
          key: 'id'
        },
        onDelete: 'SET NULL'
      },
      first_name: {
        type: Sequelize.STRING(50),
        allowNull: true
      },
      middle_name: {
        type: Sequelize.STRING(50),
        allowNull: true
      },
      last_name: {
        type: Sequelize.STRING(50),
        allowNull: true
      },
      phone_number: {
        type: Sequelize.STRING(20),
        allowNull: false
      },
      nida_number: {
        type: Sequelize.STRING(20),
        allowNull: true
      },
      requester: {
        type: Sequelize.STRING(100),
        allowNull: false
      },
      institution: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      region: {
        type: Sequelize.STRING(50),
        allowNull: true
      },
      district: {
        type: Sequelize.STRING(50),
        allowNull: true
      },
      subject: {
        type: Sequelize.STRING(200),
        allowNull: false
      },
      category: {
        type: Sequelize.ENUM('Inquiry', 'Complaint', 'Suggestion', 'Compliment'),
        allowNull: false
      },
      sub_section: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      section: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      channel: {
        type: Sequelize.STRING(50),
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      complaint_type: {
        type: Sequelize.ENUM('Minor', 'Major'),
        allowNull: true
      },
      converted_to: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      status: {
        type: Sequelize.ENUM('Open', 'Assigned', 'Carried Forward', 'In Progress', 'Returned', 'Closed'),
        defaultValue: 'Open',
        allowNull: false
      },
      request_registered_date: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
        allowNull: false
      },
      date_of_resolution: {
        type: Sequelize.DATE,
        allowNull: true
      },
      date_of_feedback: {
        type: Sequelize.DATE,
        allowNull: true
      },
      date_of_review_resolution: {
        type: Sequelize.DATE,
        allowNull: true
      },
      resolution_details: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      aging_days: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        allowNull: false
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false
      }
    });

    // Add indexes
    await queryInterface.addIndex('Tickets', ['status'], { name: 'idx_ticket_status' });
    await queryInterface.addIndex('Tickets', ['category'], { name: 'idx_ticket_category' });
    await queryInterface.addIndex('Tickets', ['created_at'], { name: 'idx_ticket_created_at' });
    await queryInterface.addIndex('Tickets', ['created_by'], { name: 'idx_ticket_created_by' });
    await queryInterface.addIndex('Tickets', ['assigned_to_id'], { name: 'idx_ticket_assigned' });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('Tickets');
  }
}; 