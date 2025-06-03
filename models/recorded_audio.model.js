module.exports = (sequelize, DataTypes) => {
  const RecordedAudio = sequelize.define(
    "cdr", // This must match the actual table name
    {
      cdrstarttime: DataTypes.DATE,
      clid: DataTypes.STRING,
      src: DataTypes.STRING,
      dst: DataTypes.STRING,
      disposition: DataTypes.STRING,
      recordingfile: DataTypes.STRING,
    },
    {
      tableName: "cdr", // Ensure it's correct
      timestamps: false,
    }
  );

  return RecordedAudio;
};
