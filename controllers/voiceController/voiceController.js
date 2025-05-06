const path = require("path");
const fs = require("fs");
const IVRVoice = require("../../models/IVRVoice");

// Create Voice Entry (with file upload)
const createVoice = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  const { file_name } = req.body;
  const file_path = `/wcf-ivr-voice/${req.file.filename}`;

  try {
    const voice = await IVRVoice.create({ file_name, file_path });
    res.status(201).json(voice);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};


// Get All Voices
const getAllVoices = async (req, res) => {
  try {
    const voices = await IVRVoice.findAll();
    res.status(200).json(voices);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get One Voice by ID
const getVoiceById = async (req, res) => {
  try {
    const voice = await IVRVoice.findByPk(req.params.id);
    if (!voice) return res.status(404).json({ message: "Voice not found" });
    res.status(200).json(voice);
  } catch (error) {
    res.status(500).json({ error: error.message });
  } 
};

// Update Voice
const updateVoice = async (req, res) => {
  const { file_name, file_path } = req.body;

  try {
    const voice = await IVRVoice.findByPk(req.params.id);
    if (!voice) return res.status(404).json({ message: "Voice not found" });

    voice.file_name = file_name;
    voice.file_path = file_path;
    await voice.save();

    res.status(200).json(voice);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Delete Voice
const deleteVoice = async (req, res) => {
  try {
    const voice = await IVRVoice.findByPk(req.params.id);
    if (!voice) return res.status(404).json({ message: "Voice not found" });

    // Delete the file from the server
    const filePath = path.join(__dirname, "..", voice.file_path);
    fs.unlinkSync(filePath); // Remove the file from the server

    // Remove the record from the database
    await voice.destroy();
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  createVoice,
  getAllVoices,
  getVoiceById,
  updateVoice,
  deleteVoice,
};
