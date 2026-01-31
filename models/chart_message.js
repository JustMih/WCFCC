const { DataTypes } = require("sequelize");
const sequelize = require("../config/mysql_connection.js");
const User = require("./User");

const ChatMassage = sequelize.define(
  "ChatMassage",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    senderId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: User,
        key: "id",
      },
      onDelete: "CASCADE",
    },
    receiverId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: User,
        key: "id",
      },
      onDelete: "CASCADE",
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    isRead: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    status: {
      type: DataTypes.ENUM('sent', 'delivered', 'read'),
      allowNull: false,
      defaultValue: 'sent',
    },
    deliveredAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    readAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: "ChatMassage",
    tableName: "ChatMassage",
    timestamps: true,
  }
);

User.hasOne(ChatMassage, { foreignKey: "senderId", onDelete: "CASCADE" });
ChatMassage.belongsTo(User, { foreignKey: "senderId", onDelete: "CASCADE" });

User.hasOne(ChatMassage, { foreignKey: "receiverId", onDelete: "CASCADE" });
ChatMassage.belongsTo(User, { foreignKey: "receiverId", onDelete: "CASCADE" });

module.exports = ChatMassage;
