const fs = require("fs");
const path = require("path");

function getCustomRelativePath(recordingPath) {
  if (!recordingPath) return null;
  const normalized = recordingPath.replace(/\\/g, "/");
  const customIndex = normalized.indexOf("custom/");
  if (customIndex >= 0) {
    return normalized.slice(customIndex);
  }
  const fileName = normalized.split("/").pop();
  return fileName ? `custom/${fileName}` : null;
}

function buildPlayablePath(recordingPath) {
  return getCustomRelativePath(recordingPath);
}

function getAudioBasePaths() {
  const bases = [];
  const fromEnv = process.env.audio_recorded_path;
  if (fromEnv) {
    bases.push(path.normalize(fromEnv.replace(/\/$/, "")));
  }
  bases.push(path.join(__dirname, ".."));
  bases.push("/opt/wcf_call_center_backend");
  bases.push("/home/wcf/WCFCC");
  return [...new Set(bases)];
}

/**
 * Resolve voice note wav path on disk (tries env base, project voice/, Asterisk sounds).
 */
function resolveVoiceNoteFilePath(recordingPath) {
  if (!recordingPath) return null;

  const normalized = String(recordingPath).replace(/\\/g, "/");
  const customRel = getCustomRelativePath(normalized);
  const fileName = normalized.split("/").pop();
  const candidates = [];

  if (path.isAbsolute(normalized) || normalized.match(/^[A-Za-z]:/)) {
    candidates.push(path.normalize(normalized));
  }
  candidates.push(path.resolve(normalized));

  for (const base of getAudioBasePaths()) {
    if (customRel) {
      candidates.push(path.join(base, "voice", customRel));
      candidates.push(path.join(base, customRel));
    }
    if (fileName) {
      candidates.push(path.join(base, "voice", "custom", fileName));
      candidates.push(path.join(base, "voice", fileName));
    }
  }

  if (customRel) {
    candidates.push(path.join("/var/lib/asterisk/sounds", customRel));
  }
  if (fileName) {
    candidates.push(path.join("/var/lib/asterisk/sounds/custom", fileName));
  }

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

module.exports = {
  buildPlayablePath,
  getCustomRelativePath,
  resolveVoiceNoteFilePath,
};
