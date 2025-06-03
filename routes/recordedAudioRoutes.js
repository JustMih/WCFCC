// const express = require("express");
// const router = express.Router();
// const { getAllRecordedAudio, getRecordedAudio } = require("../controllers/recordedaudios/recordedAudioController");

// // Route to get all recorded audio files
// router.get("/recorded-audio", getAllRecordedAudio);

// // Route to serve a specific recorded audio file
// router.get("/recorded-audio/:filename", getRecordedAudio);

// module.exports = router;

 
// const express = require("express");
// const router = express.Router();
// const { getAllRecordedAudio, getRecordedAudio } = require("../controllers/recordedaudios/recordedAudioController");

// router.get("/", getAllRecordedAudio);  
// router.get("/:filename", getRecordedAudio); 
 
// module.exports = router;
const express = require("express");
const router = express.Router();
const { getAllRecordedAudio, getRecordedAudio } = require("../controllers/recordedaudios/recordedAudioController");

router.get("/", getAllRecordedAudio);
router.get("/:filename", getRecordedAudio);

module.exports = router;
