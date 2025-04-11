const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const {
  createVoice,
  getAllVoices,
  getVoiceById,
  updateVoice,
  deleteVoice,
} = require("../controllers/voiceController/voiceController");

// Set up multer storage to save files to the 'voice' folder
const voiceDirectory = path.join(__dirname, "..", "voice");
if (!fs.existsSync(voiceDirectory)) {
  fs.mkdirSync(voiceDirectory);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, voiceDirectory); // Save to the 'voice' directory
  },
  filename: (req, file, cb) => {
    const fileName = Date.now() + path.extname(file.originalname); // Add timestamp to prevent name collisions
    cb(null, fileName);
  },
});

const upload = multer({ storage: storage });

const router = express.Router();

// Create Voice Entry
router.post(
  "/voices",
  upload.single("voice_file"),
  (req, res, next) => {
    console.log("file uploaded", req.file); // Log the file object to check if it's being processed correctly
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    next(); // Continue to the createVoice handler
  },
  createVoice
);


// Get All Voices
router.get("/voices", getAllVoices);

// Get One Voice by ID
router.get("/voices/:id", getVoiceById);

// Update Voice
router.put("/voices/:id", updateVoice);

// Delete Voice
router.delete("/voices/:id", deleteVoice);

module.exports = router;
