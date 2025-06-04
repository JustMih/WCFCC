const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PerformanceScoreCard = sequelize.define('PerformanceScoreCard', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  agentId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Users',
      key: 'id'
    }
  },
  date: {
    type: DataTypes.DATE,
    allowNull: false
  },
  // Average Handling Time (AHT) in seconds
  averageHandlingTime: {
    type: DataTypes.FLOAT,
    allowNull: true
  },
  // First Response Time (FRT) in seconds
  firstResponseTime: {
    type: DataTypes.FLOAT,
    allowNull: true
  },
  // First Call Resolution Rate (%)
  firstCallResolution: {
    type: DataTypes.FLOAT,
    allowNull: true
  },
  // Average Speed of Answer (ASA) in seconds
  averageSpeedOfAnswer: {
    type: DataTypes.FLOAT,
    allowNull: true
  },
  // Call Abandonment Rate (%)
  callAbandonmentRate: {
    type: DataTypes.FLOAT,
    allowNull: true
  },
  // Unanswered Rate (%)
  unansweredRate: {
    type: DataTypes.FLOAT,
    allowNull: true
  },
  // Customer Satisfaction Score (1-5)
  customerSatisfaction: {
    type: DataTypes.FLOAT,
    allowNull: true
  },
  // Total calls handled
  totalCalls: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  // Total resolved calls
  resolvedCalls: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  // Total abandoned calls
  abandonedCalls: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  // Total unanswered calls
  unansweredCalls: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  }
}, {
  timestamps: true,
  indexes: [
    {
      fields: ['agentId', 'date']
    }
  ]
});

module.exports = PerformanceScoreCard; 