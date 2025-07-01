'use strict';

const { Model, DataTypes } = require('sequelize');
const sequelize = require('../config/mysql_connection'); // Import your sequelize instance here

class QueueStatus extends Model {}

QueueStatus.init(
  {
    queue: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    callers: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    longestWait: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    availableAgents: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    busyAgents: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
  },
  {
    sequelize,           // pass your sequelize instance here
    modelName: 'QueueStatus',
    tableName: 'queue_status',
    timestamps: true,
    underscored: true,
  }
);

module.exports = QueueStatus;
