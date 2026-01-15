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
// Serve audio file by voice ID
const getVoiceAudio = async (req, res) => {
  const { id } = req.params;

  try {
    const voice = await IVRVoice.findByPk(id);
    if (!voice) {
      return res.status(404).json({ message: "Voice not found" });
    }

    // Construct the actual file path on disk
    // Assuming files are saved in /uploads/voice/ or similar
    const uploadDir = path.join(__dirname, "..", "..", "uploads", "voice"); // Adjust path as needed
    const possibleExtensions = [".wav", ".mp3", ".ogg"];

    let filePath = null;
    for (const ext of possibleExtensions) {
      const testPath = path.join(uploadDir, `${path.basename(voice.file_path)}${ext}`);
      if (fs.existsSync(testPath)) {
        filePath = testPath;
        break;
      }
    }

    if (!filePath) {
      return res.status(404).json({ message: "Audio file not found on server" });
    }

    // Set proper headers
    const stat = fs.statSync(filePath);
    res.writeHead(200, {
      "Content-Type": getMimeType(filePath),
      "Content-Length": stat.size,
      "Accept-Ranges": "bytes",
    });

    // Stream the file
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  } catch (error) {
    console.error("Error serving audio:", error);
    res.status(500).json({ message: "Error playing audio" });
  }
};

// Helper to detect MIME type
function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
  };
  return mimeTypes[ext] || "application/octet-stream";
}
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
