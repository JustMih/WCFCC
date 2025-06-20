'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class QueueStatus extends Model {
    static associate(models) {
      // define associations here if needed
    }
  }

  QueueStatus.init({
    queue: {
      type: DataTypes.STRING,
      allowNull: false
    },
    callers: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    longestWait: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    availableAgents: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    busyAgents: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    }
  }, {
    sequelize,
    modelName: 'QueueStatus',
    tableName: 'queue_status',
    timestamps: true,
    underscored: true
  });

  return QueueStatus;
};
