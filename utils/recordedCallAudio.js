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

function normalizeRecordingRef(recordingfile, uniqueid) {
  const raw = String(recordingfile || uniqueid || "").replace(/\\/g, "/").trim();
  if (!raw) return { basename: null, stem: null };

  if (raw.includes("/")) {
    const basename = path.basename(raw);
    return {
      basename,
      stem: basename.replace(/\.wav$/i, ""),
      absolute: path.isAbsolute(raw) ? path.normalize(raw) : null,
    };
  }

  const basename = raw.endsWith(".wav") || raw.endsWith(".WAV") ? raw : `${raw}.wav`;
  return { basename, stem: basename.replace(/\.wav$/i, ""), absolute: null };
}

function findInDirectory(dir, basename, stem, uniqueid) {
  if (!dir || !fs.existsSync(dir)) return null;

  const tryNames = new Set();
  if (basename) {
    tryNames.add(basename);
    tryNames.add(basename.replace(/\.wav$/i, ".WAV"));
    tryNames.add(basename.replace(/\.wav$/i, ".gsm"));
  }
  if (stem) {
    tryNames.add(`${stem}.wav`);
    tryNames.add(`${stem}.WAV`);
  }
  if (uniqueid) {
    const uid = String(uniqueid).trim();
    tryNames.add(uid.endsWith(".wav") ? uid : `${uid}.wav`);
    tryNames.add(uid);
  }

  for (const name of tryNames) {
    const full = path.join(dir, name);
    if (fs.existsSync(full)) return full;
  }

  try {
    const files = fs.readdirSync(dir);
    const lower = basename ? basename.toLowerCase() : "";
    const exact = files.find((f) => f.toLowerCase() === lower);
    if (exact) return path.join(dir, exact);

    const prefixes = [stem, uniqueid, stem && stem.split(".")[0]]
      .filter(Boolean)
      .map(String);

    for (const prefix of prefixes) {
      const hit = files.find(
        (f) =>
          f.startsWith(prefix) &&
          /\.(wav|WAV|gsm)$/i.test(f)
      );
      if (hit) return path.join(dir, hit);
    }
  } catch {
    /* ignore readdir errors */
  }

  return null;
}

function tryMonitorDatedPaths(basename, stem, uniqueid) {
  const roots = [
    "/var/spool/asterisk/monitor",
    "/var/spool/asterisk/monitor/complete",
  ];

  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    const hit = findInDirectory(root, basename, stem, uniqueid);
    if (hit) return hit;

    for (let d = 0; d < 31; d++) {
      const day = moment().subtract(d, "days");
      const datedDir = path.join(
        root,
        day.format("YYYY"),
        day.format("MM"),
        day.format("DD")
      );
      const datedHit = findInDirectory(datedDir, basename, stem, uniqueid);
      if (datedHit) return datedHit;
    }
  }

  return null;
}

/**
 * Resolve MixMonitor wav on disk.
 * @param {string} recordingfile - CDR recordingfile column
 * @param {string} [uniqueid] - CDR uniqueid fallback (e.g. 1765957984.0.wav)
 */
function resolveRecordedCallFilePath(recordingfile, uniqueid) {
  const { basename, stem, absolute } = normalizeRecordingRef(
    recordingfile,
    uniqueid
  );
  if (!basename && !stem) return null;

  const candidates = [];

  if (absolute && fs.existsSync(absolute)) {
    candidates.push(absolute);
  }

  const recordedDir = getRecordedStaticDirectory();
  const dirHit = findInDirectory(recordedDir, basename, stem, uniqueid);
  if (dirHit) candidates.push(dirHit);

  for (const root of getRecordedBasePaths()) {
    const hit = findInDirectory(
      path.join(root, "recorded"),
      basename,
      stem,
      uniqueid
    );
    if (hit) candidates.push(hit);
  }

  const monitorHit = tryMonitorDatedPaths(basename, stem, uniqueid);
  if (monitorHit) candidates.push(monitorHit);

  return candidates[0] || null;
}

module.exports = {
  DEFAULT_RECORDED_DIR,
  getRecordedBasePaths,
  getRecordedStaticDirectory,
  normalizeRecordingRef,
  resolveRecordedCallFilePath,
};
