const { DataTypes } = require("sequelize");
const sequelize = require("../config/mysql_connection");

const IVRAction = sequelize.define(  // ✅ Ensure it's IVRAction singular
  "IVRAction",
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

module.exports = IVRAction;  // ✅ Export as IVRAction (singular)
