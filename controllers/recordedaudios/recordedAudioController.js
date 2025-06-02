 const path = require('path');
const fs = require('fs');

// GET all .wav files from the recorded directory
const getAllRecordedAudio = async (req, res) => {
  const directoryPath = '/opt/wcf_call_center_backend/recorded';

  try {
    const files = await fs.promises.readdir(directoryPath);
    const wavFiles = files.filter(file => file.endsWith('.wav'));

    res.json(wavFiles.map(file => ({
      filename: file,
      url: `/api/recorded-audio/${encodeURIComponent(file)}`
    })));
  } catch (err) {
    console.error('Cannot read recorded files:', err);
    res.status(500).json({ error: 'Cannot read recordings' });
  }
};

// GET a specific audio file by filename
const getRecordedAudio = async (req, res) => {
  const filename = decodeURIComponent(req.params.filename);

  if (!filename.endsWith('.wav') || filename.includes('..')) {
    return res.status(400).json({ error: 'Invalid filename' });
  }

  const filePath = path.join('/opt/wcf_call_center_backend/recorded', filename);

  try {
    await fs.promises.access(filePath, fs.constants.R_OK);
    res.sendFile(filePath, {
      headers: {
        'Content-Type': 'audio/wav',
        'Content-Disposition': `inline; filename="${filename}"`
      }
    });
  } catch (err) {
    console.error(`File not found: ${filePath}`, err);
    res.status(404).json({ error: 'File not found' });
  }
};

module.exports = {
  getAllRecordedAudio,
  getRecordedAudio
};
