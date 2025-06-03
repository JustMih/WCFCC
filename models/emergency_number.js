module.exports = (sequelize, DataTypes) => {
  const EmergencyNumber = sequelize.define('EmergencyNumber', {
    phone_number: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    priority: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: true,
      defaultValue: DataTypes.NOW,
    }
  }, {
    tableName: 'emergency_numbers',
    timestamps: false,
  });

  return EmergencyNumber;
};
