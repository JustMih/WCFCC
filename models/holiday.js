// models/holiday.js
module.exports = (sequelize, DataTypes) => {
    const Holiday = sequelize.define('Holiday', {
      holiday_date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      created_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      }
    }, {
      tableName: 'holidays',
      timestamps: false,
    });
  
    return Holiday;
  };
  