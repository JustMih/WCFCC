const { DataTypes } = require("sequelize");
const sequelize = require("../config/mysql_connection.js");
const User = require("./User.js");

const PjsipAuths = sequelize.define(
  "pjsip_auths",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      allowNull: false,
      // autoIncrement: true,
    },
    auth_type: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "userpass",
    },
    username: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false,
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

User.hasOne(PjsipAuths, { foreignKey: "userId", onDelete: "CASCADE" });
PjsipAuths.belongsTo(User, { foreignKey: "userId", onDelete: "CASCADE" });

module.exports = PjsipAuths;
