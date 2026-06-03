"use strict";

const { QueryTypes } = require("sequelize");
const moment = require("moment");

function isDuplicateKeyError(err) {
  const code = err?.parent?.code || err?.original?.code;
  const errno = err?.parent?.errno || err?.original?.errno;
  return (
    err?.name === "SequelizeUniqueConstraintError" ||
    code === "ER_DUP_ENTRY" ||
    errno === 1062
  );
}

/** Match MySQL DATETIME (server +03:00). */
function formatCallTimeForDb(callTime) {
  const d = callTime instanceof Date ? callTime : new Date(callTime);
  return moment(d).utcOffset("+03:00").format("YYYY-MM-DD HH:mm:ss");
}

/**
 * Insert missed call without duplicate-key errors (uniq_missed_call).
 * Used by MissedCall.create override and routes.
 */
async function insertMissedCallSafe(MissedCallModel, values = {}, options = {}) {
  const sequelize = MissedCallModel.sequelize;
  const caller = String(values.caller ?? "").trim();
  const agentId =
    values.agentId != null && values.agentId !== ""
      ? String(values.agentId).trim()
      : "";
  const status = values.status || "pending";
  const callTime =
    values.time instanceof Date ? values.time : new Date(values.time);

  if (!caller || !agentId || Number.isNaN(callTime.getTime())) {
    throw new Error("MissedCall insert requires caller, agentId, and valid time");
  }

  const timeStr = formatCallTimeForDb(callTime);

  await sequelize.query(
    `
    INSERT IGNORE INTO MissedCalls
      (caller, time, agentId, status, createdAt, updatedAt)
    VALUES
      (:caller, :time, :agentId, :status, NOW(), NOW())
    `,
    {
      replacements: { caller, time: timeStr, agentId, status },
      type: QueryTypes.INSERT,
    }
  );

  const rows = await sequelize.query(
    `
    SELECT * FROM MissedCalls
    WHERE caller = :caller
      AND agentId = :agentId
      AND \`time\` = :time
    LIMIT 1
    `,
    {
      replacements: { caller, agentId, time: timeStr },
      type: QueryTypes.SELECT,
    }
  );

  if (rows[0]) {
    return MissedCallModel.build(rows[0], { isNewRecord: false });
  }

  const fallback = await MissedCallModel.findOne({
    where: { caller, agentId },
    order: [["time", "DESC"]],
    ...options,
  });
  if (fallback) return fallback;

  throw new Error(
    `MissedCall insert could not load row for ${caller}/${agentId}/${timeStr}`
  );
}

function patchMissedCallCreate(MissedCallModel) {
  if (MissedCallModel.create.__usesInsertIgnore) {
    return MissedCallModel;
  }

  const legacyCreate = MissedCallModel.create.bind(MissedCallModel);

  MissedCallModel.create = async function createSafe(values, options) {
    try {
      return await insertMissedCallSafe(MissedCallModel, values, options);
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        const row = await MissedCallModel.findOne({
          where: {
            caller: values.caller,
            agentId: values.agentId,
          },
          order: [["time", "DESC"]],
        });
        if (row) return row;
      }
      throw err;
    }
  };

  MissedCallModel.create.__usesInsertIgnore = true;
  MissedCallModel.create.__legacyCreate = legacyCreate;

  console.log(
    "[MissedCall] create() patched — duplicates use INSERT IGNORE (uniq_missed_call safe)"
  );

  return MissedCallModel;
}

module.exports = {
  insertMissedCallSafe,
  formatCallTimeForDb,
  isDuplicateKeyError,
  patchMissedCallCreate,
};
