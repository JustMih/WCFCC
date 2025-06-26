module.exports = (sequelize, DataTypes) => {
    return sequelize.define('IVRDTMFLog', {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      caller_id: DataTypes.STRING,
      digit_pressed: DataTypes.STRING,
      menu_context: DataTypes.STRING,
      language: DataTypes.STRING,
      timestamp: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    });
  };
  