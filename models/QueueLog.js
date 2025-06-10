'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class QueueLog extends Model {
    static associate(models) {
      // define associations here if needed
    }
  }
  
  QueueLog.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    time: {
      type: DataTypes.DATE,
      allowNull: false
    },
    callid: {
      type: DataTypes.STRING(64),
      allowNull: false
    },
    queuename: {
      type: DataTypes.STRING(128),
      allowNull: false
    },
    agent: {
      type: DataTypes.STRING(128),
      allowNull: true
    },
    event: {
      type: DataTypes.STRING(32),
      allowNull: false
    },
    data1: {
      type: DataTypes.STRING(128),
      allowNull: true
    },
    data2: {
      type: DataTypes.STRING(128),
      allowNull: true
    },
    data3: {
      type: DataTypes.STRING(128),
      allowNull: true
    },
    data4: {
      type: DataTypes.STRING(128),
      allowNull: true
    },
    data5: {
      type: DataTypes.STRING(128),
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'QueueLog',
    tableName: 'queue_log',
    timestamps: false,
    indexes: [
      {
        name: 'queue_log_time_idx',
        fields: ['time']
      },
      {
        name: 'queue_log_callid_idx',
        fields: ['callid']
      },
      {
        name: 'queue_log_queuename_idx',
        fields: ['queuename']
      }
    ]
  });

  return QueueLog;
}; 