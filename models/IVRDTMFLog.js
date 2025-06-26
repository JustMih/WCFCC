module.exports = (sequelize, DataTypes) => {
  return sequelize.define('IVRDTMFLog', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },
    caller_id: {
      type: DataTypes.STRING,
      field: 'caller_id' // ✅ explicitly match column name
    },
    digit_pressed: {
      type: DataTypes.STRING,
      field: 'digit_pressed'
    },
    menu_context: {
      type: DataTypes.STRING,
      field: 'menu_context'
    },
    language: {
      type: DataTypes.STRING,
      field: 'language'
    },
    timestamp: {
      type: DataTypes.DATE,
      field: 'timestamp'
    }
  }, {
    tableName: 'IVR_DTMF_Logs',
    timestamps: false
  });
};
