"use strict";

const fs = require("fs");
const path = require("path");
const moment = require("moment");

function getRecordedBasePaths() {
  const bases = [];
  const fromEnv = process.env.audio_recorded_path;
  if (fromEnv) {
    bases.push(path.normalize(String(fromEnv).replace(/[/\\]+$/, "")));
  }
  bases.push(path.join(__dirname, ".."));
  bases.push("/opt/wcf_call_center_backend");
  bases.push("/home/wcf/WCFCC");
  return [...new Set(bases)];
}

function tryMonitorDatedPaths(filename) {
  const roots = [
    "/var/spool/asterisk/monitor",
    "/var/spool/asterisk/monitor/complete",
  ];

  for (const root of roots) {
    if (!fs.existsSync(root)) continue;

    const flat = path.join(root, filename);
    if (fs.existsSync(flat)) return flat;

    for (let d = 0; d < 31; d++) {
      const day = moment().subtract(d, "days");
      const dated = path.join(
        root,
        day.format("YYYY"),
        day.format("MM"),
        day.format("DD"),
        filename
      );
      if (fs.existsSync(dated)) return dated;
    }
  }

  return null;
}

/**
 * Resolve Asterisk MixMonitor wav on disk (CDR recordingfile is usually basename only).
 */
function resolveRecordedCallFilePath(filename) {
  if (!filename) return null;

  const base = path.basename(String(filename).replace(/\\/g, "/"));
  const candidates = [];

  for (const root of getRecordedBasePaths()) {
    candidates.push(path.join(root, "recorded", base));
    candidates.push(path.join(root, "monitor", base));
    candidates.push(path.join(root, "recorded", base.replace(/\.wav$/i, ".WAV")));
  }

  candidates.push(tryMonitorDatedPaths(base));

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

module.exports = {
  getRecordedBasePaths,
  resolveRecordedCallFilePath,
};
