"use strict";

const fs = require("fs");
const path = require("path");
const moment = require("moment");

/** Production: Asterisk MixMonitor files (user-confirmed path) */
const DEFAULT_RECORDED_DIR = "/home/wcf/WCFCC/recorded";

function getRecordedBasePaths() {
  const bases = [];
  const fromEnv = process.env.audio_recorded_path;
  if (fromEnv) {
    bases.push(path.normalize(String(fromEnv).replace(/[/\\]+$/, "")));
  }
  bases.push("/home/wcf/WCFCC");
  bases.push(path.join(__dirname, ".."));
  bases.push("/opt/wcf_call_center_backend");
  return [...new Set(bases)];
}

/**
 * Directory served at GET /recordings and used to stream /api/recorded-audio/:file
 */
function getRecordedStaticDirectory() {
  const fromEnv = process.env.RECORDED_CALLS_DIR;
  if (fromEnv && fs.existsSync(fromEnv)) {
    return path.normalize(fromEnv);
  }
  if (fs.existsSync(DEFAULT_RECORDED_DIR)) {
    return DEFAULT_RECORDED_DIR;
  }
  for (const root of getRecordedBasePaths()) {
    const dir = path.join(root, "recorded");
    if (fs.existsSync(dir)) {
      return dir;
    }
  }
  return DEFAULT_RECORDED_DIR;
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
  const candidates = [path.join(getRecordedStaticDirectory(), base)];

  for (const root of getRecordedBasePaths()) {
    candidates.push(path.join(root, "recorded", base));
    candidates.push(path.join(root, "monitor", base));
    candidates.push(path.join(root, "recorded", base.replace(/\.wav$/i, ".WAV")));
  }

  const monitorHit = tryMonitorDatedPaths(base);
  if (monitorHit) candidates.push(monitorHit);

  const seen = new Set();
  for (const candidate of candidates) {
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

module.exports = {
  DEFAULT_RECORDED_DIR,
  getRecordedBasePaths,
  getRecordedStaticDirectory,
  resolveRecordedCallFilePath,
};
