const { sequelize } = require("../models");

async function syncMissedCallsFromCDR() {
  console.log("[CDR-SYNC] started");

  await sequelize.query(`
    UPDATE MissedCalls mc
    JOIN cdr c ON c.uniqueid = mc.linkedid
    SET
      mc.status = 'called_back',
      mc.called_back_by = c.src,
      mc.called_back_at = c.cdrendtime,
      mc.billsec = c.billsec
    WHERE
      mc.status = 'pending'
      AND c.disposition = 'ANSWERED'
      AND c.billsec > 0
  `);

  await sequelize.query(`
    UPDATE MissedCalls mc
    JOIN cdr c
      ON mc.caller = c.dst
      AND c.cdrstarttime > mc.time
    SET
      mc.status = 'called_back',
      mc.called_back_by = c.src,
      mc.called_back_at = c.cdrendtime,
      mc.billsec = c.billsec
    WHERE
      mc.status = 'pending'
      AND mc.linkedid IS NULL
      AND c.disposition = 'ANSWERED'
      AND c.billsec > 0
  `);

  console.log("[CDR-SYNC] completed");
}

module.exports = syncMissedCallsFromCDR;
