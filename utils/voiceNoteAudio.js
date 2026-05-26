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

module.exports = {
  buildPlayablePath,
};
