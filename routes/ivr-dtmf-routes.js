const express = require("express");
const router = express.Router();
const {
  addIVRDTMFMapping,
  getAllMappings,
  getMappingsByVoice,
  deleteMapping,  // ✅ Import this
  updateMapping   // ✅ Import this if you're using it
  
} = require("../controllers/ivrAction/ivrDTMFController");

router.post("/ivr/dtmf-mappings", addIVRDTMFMapping);
router.get("/ivr/dtmf-mappings", getAllMappings);
router.get("/dtmf-mappings/:ivr_voice_id", getMappingsByVoice); 
router.get("/ivr/dtmf-mappings/:ivr_voice_id", getMappingsByVoice);
router.delete("/ivr/dtmf-mappings/:id", deleteMapping);  // ✅ Works now
router.put("/ivr/dtmf-mappings/:id", updateMapping);     // ✅ Works now
//router.post("/voice", updateVoiceFile);


module.exports = router;
