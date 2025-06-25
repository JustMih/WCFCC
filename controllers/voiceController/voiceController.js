const path = require("path");
const fs = require("fs");
const IVRVoice = require("../../models/IVRVoice");

 
const createVoice = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  const { file_name } = req.body;

  // Remove the file extension (.wav, .mp3, etc.) before saving to the database
  const file_path = `/voice/${req.file.filename.replace(/\.[^/.]+$/, "")}`; // Strips the extension

  const { language } = req.body;

  try {
    // Create IVRVoice entry with the modified file path (no extension)
    const voice = await IVRVoice.create({
      file_name,
      file_path,  // Save without the file extension
      language,
    });

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
  const { file_name, file_path,language } = req.body;

  try {
    const voice = await IVRVoice.findByPk(req.params.id);
    if (!voice) return res.status(404).json({ message: "Voice not found" });

    voice.file_name = file_name;
    voice.file_path = file_path;
    voice.language= language;
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

    // Absolute path to the voice file
    const filePath = path.join(__dirname, "..", "voice", path.basename(voice.file_path));

    // Delete the file from the server, if it exists
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    } else {
      console.warn("Voice file does not exist:", filePath);
    }

    // Remove DB record
    await voice.destroy();
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting voice:", error);
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
