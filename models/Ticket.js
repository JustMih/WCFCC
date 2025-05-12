const { DataTypes } = require('sequelize');
const sequelize = require('../config/mysql_connection.js');

const Ticket = sequelize.define(
  'Ticket',
  {
    id: { 
      type: DataTypes.UUID, 
      defaultValue: DataTypes.UUIDV4, 
      primaryKey: true 
    },

    userId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'created_by',
      references: {
        model: 'Users',
        key: 'id'
      },
      onDelete: 'SET NULL'
    },
    
    assigned_to_id: {
      type: DataTypes.UUID,
      references: {
        model: 'Users',
        key: 'id',
      },
      onDelete: 'SET NULL',
    },

    attended_by_id: {
      type: DataTypes.UUID,
      references: {
        model: 'Users',
        key: 'id',
      },
      onDelete: 'SET NULL',
    },

    rated_by_id: {
      type: DataTypes.UUID,
      references: {
        model: 'Users',
        key: 'id',
      },
      onDelete: 'SET NULL',
    },

    responsible_unit_id: {
      type: DataTypes.UUID,
      references: {
        model: 'functions',
        key: 'id',
      },
      onDelete: 'SET NULL',
    },

    // Personal Information
    first_name: {
      type: DataTypes.STRING(50),
      allowNull: false,
      validate: {
        notEmpty: true
      }
    },
    middle_name: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    last_name: {
      type: DataTypes.STRING(50),
      allowNull: false,
      validate: {
        notEmpty: true
      }
    },
    phone_number: {
      type: DataTypes.STRING(20),
      allowNull: false,
      validate: {
        notEmpty: true
      }
    },
    nida_number: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    requester: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    institution: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    region: {
      type: DataTypes.STRING(50),
      allowNull: true
    },
    district: {
      type: DataTypes.STRING(50),
      allowNull: true
    },

    // Ticket Details
    subject: {
      type: DataTypes.STRING(200),
      allowNull: false,
      validate: {
        notEmpty: true
      }
    },
    category: {
      type: DataTypes.ENUM('Inquiry', 'Complaint', 'Suggestion', 'Compliment'),
      allowNull: false
    },
    sub_section: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    section: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    channel: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false,
      validate: {
        notEmpty: true
      }
    },
    complaint_type: {
      type: DataTypes.ENUM('Minor', 'Major'),
      allowNull: true
    },
    converted_to: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('Open', 'Assigned', 'Carried Forward', 'In Progress', 'Returned', 'Closed'),
      defaultValue: 'Open',
      allowNull: false
    },

    // Dates
    request_registered_date: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      allowNull: false
    },
    date_of_resolution: {
      type: DataTypes.DATE,
      allowNull: true
    },
    date_of_feedback: {
      type: DataTypes.DATE,
      allowNull: true
    },
    date_of_review_resolution: {
      type: DataTypes.DATE,
      allowNull: true
    },

    // Additional Information
    resolution_details: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    aging_days: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false
    },
  },
  {
    tableName: 'Tickets',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: true,
    indexes: [
      {
        name: 'idx_ticket_status',
        fields: ['status']
      },
      {
        name: 'idx_ticket_category',
        fields: ['category']
      },
      {
        name: 'idx_ticket_created_at',
        fields: ['created_at']
      },
      {
        name: 'idx_ticket_created_by',
        fields: ['created_by']
      },
      {
        name: 'idx_ticket_assigned',
        fields: ['assigned_to_id']
      }
    ]
  }
);

// Associations inside model
Ticket.associate = (models) => {
  Ticket.belongsTo(models.User, { foreignKey: 'userId', as: 'creator' });
  Ticket.belongsTo(models.User, { foreignKey: 'assigned_to_id', as: 'assignee' });
  Ticket.belongsTo(models.User, { foreignKey: 'attended_by_id', as: 'attendedBy' });
  Ticket.belongsTo(models.User, { foreignKey: 'rated_by_id', as: 'ratedBy' });
  Ticket.belongsTo(models.Function, { foreignKey: 'responsible_unit_id', as: 'responsibleUnit' });
};

module.exports = Ticket;
