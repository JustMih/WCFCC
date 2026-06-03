-- One row per call session (not per queue ring attempt).
-- Asterisk writes many cdr rows per uniqueid/linkedid; this view sums duration.
-- Run on the WCF MySQL database after backup:
--   mysql -u user -p wcf_db < sql/call_summary_view.sql

DROP VIEW IF EXISTS call_summary;

CREATE VIEW call_summary AS
SELECT
  COALESCE(NULLIF(TRIM(c.linkedid), ''), c.uniqueid) AS uniqueid,
  MIN(c.cdrstarttime) AS call_start,
  MAX(COALESCE(c.cdrendtime, c.cdrstarttime)) AS call_end,
  MIN(
    COALESCE(
      NULLIF(TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(c.clid, '<', -1), '>', 1)), ''),
      NULLIF(TRIM(c.src), ''),
      NULLIF(TRIM(c.clid), '')
    )
  ) AS caller,
  SUBSTRING_INDEX(
    GROUP_CONCAT(NULLIF(TRIM(c.dst), '') ORDER BY c.cdrstarttime DESC SEPARATOR '||'),
    '||',
    1
  ) AS called,
  'INBOUND' AS direction,
  SUM(COALESCE(c.duration, 0)) AS total_duration,
  MAX(COALESCE(c.billsec, 0)) AS billsec,
  SUBSTRING_INDEX(
    GROUP_CONCAT(NULLIF(TRIM(c.disposition), '') ORDER BY c.cdrstarttime DESC SEPARATOR '||'),
    '||',
    1
  ) AS cdr_status,
  CASE
    WHEN MAX(
      CASE
        WHEN c.disposition = 'ANSWERED'
          AND (c.dstchannel LIKE 'PJSIP/%' OR c.dstchannel LIKE 'SIP/%')
        THEN 1
        ELSE 0
      END
    ) > 0 THEN 'ANSWERED'
    WHEN SUM(
      CASE
        WHEN c.lastapp IN ('Queue', 'AppQueue')
        THEN COALESCE(c.duration, 0)
        ELSE 0
      END
    ) >= 300 THEN 'NO ANSWER'
    ELSE 'NO ANSWER'
  END AS disposition_raw,
  CASE
    WHEN MAX(
      CASE
        WHEN c.disposition = 'ANSWERED'
          AND (c.dstchannel LIKE 'PJSIP/%' OR c.dstchannel LIKE 'SIP/%')
        THEN 1
        ELSE 0
      END
    ) > 0 THEN 'answered'
    WHEN SUM(
      CASE
        WHEN c.lastapp IN ('Queue', 'AppQueue')
        THEN COALESCE(c.duration, 0)
        ELSE 0
      END
    ) >= 294 THEN 'lost'
    ELSE 'dropped'
  END AS status,
  SUBSTRING_INDEX(
    GROUP_CONCAT(
      CASE
        WHEN c.disposition = 'ANSWERED'
          AND (c.dstchannel LIKE 'PJSIP/%' OR c.dstchannel LIKE 'SIP/%')
        THEN TRIM(SUBSTRING_INDEX(c.dstchannel, '/', -1))
        ELSE NULL
      END
      ORDER BY c.cdrstarttime DESC SEPARATOR '||'
    ),
    '||',
    1
  ) AS agent,
  SUBSTRING_INDEX(
    GROUP_CONCAT(
      CASE
        WHEN c.lastdata IS NOT NULL AND TRIM(c.lastdata) <> ''
        THEN SUBSTRING_INDEX(TRIM(c.lastdata), ',', 1)
        ELSE NULL
      END
      ORDER BY c.cdrstarttime DESC SEPARATOR '||'
    ),
    '||',
    1
  ) AS queue
FROM cdr c
GROUP BY COALESCE(NULLIF(TRIM(c.linkedid), ''), c.uniqueid);
