const { DataTypes } = require('sequelize');
const sequelize = require('../config/mysql_connection');

const TicketAssignment = sequelize.define('TicketAssignment', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  ticket_id: {
    type: DataTypes.UUID,
    allowNull: false
  },
  assigned_by_id: {
    type: DataTypes.UUID,
    allowNull: false
  },
  assigned_to_id: {
    type: DataTypes.UUID,
    allowNull: false
  },
  assigned_to_role: {
    type: DataTypes.STRING,
    allowNull: false
  },
  action: {
    type: DataTypes.STRING,
    allowNull: false
  },
  reason: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  attachment_path: {
    type: DataTypes.STRING,
    allowNull: true
  },
  evidence_url: {
    type: DataTypes.STRING,
    allowNull: true
  },
  // New workflow tracking fields
  workflow_path: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Workflow path (e.g., MINOR_UNIT, MAJOR_DIRECTORATE)'
  },
  workflow_step: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Current step in the workflow (1-based)'
  },
  workflow_current_role: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Current role in the workflow (e.g., reviewer, director)'
  },
  workflow_next_role: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Next role in the workflow'
  },
  workflow_total_steps: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Total number of steps in the workflow'
  },
  sla_total_days: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Total SLA working days for the workflow'
  },
  sla_current_step_days: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'SLA days for current step (e.g., "2 working days")'
  },
  sla_remaining_days: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Remaining SLA days for current step'
  },
  backup_type: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'Type of backup record (e.g., workflow_action, system_backup)'
  },
  action_details: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'JSON string containing detailed action information'
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'Ticket_assignments',
  timestamps: false
});

TicketAssignment.associate = (models) => {
  TicketAssignment.belongsTo(models.Ticket, { foreignKey: 'ticket_id', as: 'ticket' });
  TicketAssignment.belongsTo(models.User, { as: 'assignedBy', foreignKey: 'assigned_by_id' });
  TicketAssignment.belongsTo(models.User, { as: 'assignedTo', foreignKey: 'assigned_to_id' });
};

module.exports = TicketAssignment; 