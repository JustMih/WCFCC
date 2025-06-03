const { DataTypes } = require('sequelize');
const sequelize = require("../config/mysql_connection");

const CDR = sequelize.define('CDR', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  clid: DataTypes.STRING(80),
  src: DataTypes.STRING(80),
  dst: DataTypes.STRING(80),
  dcontext: DataTypes.STRING(80),
  channel: DataTypes.STRING(80),
  dstchannel: DataTypes.STRING(80),
  lastapp: DataTypes.STRING(80),
  lastdata: DataTypes.STRING(80),
  duration: DataTypes.INTEGER,
  billsec: DataTypes.INTEGER,
  disposition: DataTypes.STRING(45),
  amaflags: DataTypes.INTEGER,
  accountcode: DataTypes.STRING(20),
  uniqueid: DataTypes.STRING(150),
  userfield: DataTypes.STRING(255),
  did: DataTypes.STRING(80),
  recordingfile: DataTypes.STRING(255),
  cdrstarttime: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'cdr',
  timestamps: false,
});

module.exports = CDR;
