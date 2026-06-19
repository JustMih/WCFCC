/**
 * Build call-center SLA metrics from a SQL aggregate row (cdr summary).
 * @param {object} row - { total, answered, answered_within_20s, not_answered, avg_response_sec, avg_handle_sec }
 * @param {string} [date] - optional date label for daily rows
 */
function buildSlaMetricsFromRow(row, date) {
  const total = Number(row?.total) || 0;
  const answered = Number(row?.answered) || 0;
  const within20 = Number(row?.answered_within_20s) || 0;
  const notAnswered = Number(row?.not_answered) || 0;

  const serviceLevel =
    total > 0 ? Math.round((within20 / total) * 100) : 0;
  const abandonmentRate =
    total > 0 ? Math.round((notAnswered / total) * 100) : 0;

  const metrics = {
    serviceLevel,
    abandonmentRate,
    averageResponseTime: Math.round(Number(row?.avg_response_sec) || 0),
    averageHandleTime: Math.round(Number(row?.avg_handle_sec) || 0),
    totalCalls: total,
    answeredCalls: answered,
    answeredWithin20s: within20,
    notAnsweredCalls: notAnswered,
  };

  if (date !== undefined) {
    metrics.date =
      typeof date === "string"
        ? date
        : date instanceof Date
          ? date.toISOString().slice(0, 10)
          : String(date);
  }

  return metrics;
}

const SLA_AGGREGATE_SELECT = `
  COUNT(*) AS total,
  SUM(CASE WHEN disposition = 'ANSWERED' THEN 1 ELSE 0 END) AS answered,
  SUM(
    CASE
      WHEN disposition = 'ANSWERED' AND COALESCE(duration, 0) <= 20 THEN 1
      ELSE 0
    END
  ) AS answered_within_20s,
  SUM(CASE WHEN disposition != 'ANSWERED' THEN 1 ELSE 0 END) AS not_answered,
  AVG(CASE WHEN disposition = 'ANSWERED' THEN duration END) AS avg_response_sec,
  AVG(CASE WHEN disposition = 'ANSWERED' THEN billsec END) AS avg_handle_sec
`;

module.exports = {
  buildSlaMetricsFromRow,
  SLA_AGGREGATE_SELECT,
};
