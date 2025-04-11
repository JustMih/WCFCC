const { DataTypes } = require("sequelize");
const sequelize = require("../config/mysql_connection.js");

const IVRActions = sequelize.define(
  "IVRActions",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      allowNull: false,
      primaryKey: true,
    },
    name: { type: DataTypes.STRING, allowNull: false },
  },
  { timestamps: true }
);

module.exports = IVRActions;
