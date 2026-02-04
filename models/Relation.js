const { DataTypes } = require("sequelize");
const sequelize = require("../config/mysql_connection.js");

const Relation = sequelize.define(
  "Relation",
  {
    id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      autoIncrement: true,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    timestamps: true,
    underscored: true,
    tableName: "Relation",
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

module.exports = Relation;
