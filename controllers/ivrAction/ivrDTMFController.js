const IVRDTMFMapping = require("../../models/IVRDTMFMapping");

const addIVRDTMFMapping = async (req, res) => {
  try {
    const { mappings } = req.body;

    if (!Array.isArray(mappings)) {
      return res.status(400).json({ message: "Invalid format: mappings must be array" });
    }

    const results = await Promise.all(
      mappings.map((mapping) => IVRDTMFMapping.create(mapping))
    );

   return res.status(201).json({ message: "DTMF mappings saved", results });
  } catch (error) {
    console.error("Failed to insert mappings:", error);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getMappingsByVoice = async (req, res) => {
  try {
    const { ivr_voice_id } = req.params;
    const mappings = await IVRDTMFMapping.findAll({ where: { ivr_voice_id } });
    res.status(200).json(mappings);
  } catch (error) {
    res.status(500).json({ message: "Fetch error", error: error.message });
  }
};

module.exports = {
  addIVRDTMFMapping,
  getAllMappings: getMappingsByVoice,
};


 
