const { DataTypes } = require("sequelize");
const sequelize = require("../config/mysql_connection.js");
const User = require("./user.js");

const PjsipAors = sequelize.define(
  "pjsip_aors",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      allowNull: false,
      // autoIncrement: true,
    },
    max_contacts: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    qualify_frequency: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: null,
    },
    contact: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: null,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: User,
        key: "id",
      },
      unique: true,
    },
  }
  // { timestamps: true }
);

User.hasOne(PjsipAors, { foreignKey: "userId", onDelete: "CASCADE" });
PjsipAors.belongsTo(User, { foreignKey: "userId", onDelete: "CASCADE" });

module.exports = PjsipAors;
