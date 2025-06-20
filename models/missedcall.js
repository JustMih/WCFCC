const { DataTypes } = require("sequelize");
const sequelize = require("../config/mysql_connection.js");

const MissedCall = sequelize.define("MissedCall", {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  caller: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  time: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  agentId: {
    type: DataTypes.STRING, // or UUID if you use that format
    allowNull: false,
  },
  status: {
    type: DataTypes.ENUM('pending', 'called_back', 'ignored'),
    defaultValue: 'pending',
    allowNull: false,
  },
}, {
  timestamps: true, // adds createdAt and updatedAt
});

module.exports = MissedCall;