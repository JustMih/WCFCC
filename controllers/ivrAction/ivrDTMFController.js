const { IVRDTMFMapping, IVRAction, IVRVoice } = require("../../models");
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
    const mappings = await IVRDTMFMapping.findAll({
      where: { ivr_voice_id },
      include: [
        { model: IVRAction, as: 'action', attributes: ['name'] },
        { model: IVRVoice, as: 'voice', attributes: ['file_name'] }
      ],
      order: [["dtmf_digit", "ASC"]]
    });
    
    res.status(200).json(mappings);
  } catch (error) {
    console.error("Error fetching mappings:", error);
    res.status(500).json({ message: "Fetch error", error: error.message });
  }
};

const getAllMappings = async (req, res) => {
  try {
    const mappings = await IVRDTMFMapping.findAll({
      order: [["dtmf_digit", "ASC"]]  
    });
    res.status(200).json(mappings);
  } catch (error) {
    console.error("Error fetching mappings:", error);
    res.status(500).json({ message: "Fetch error", error: error.message });
  }
};

const deleteMapping = async (req, res) => {
  try {
    const { id } = req.params;
    const mapping = await IVRDTMFMapping.findByPk(id);
    if (!mapping) {
      return res.status(404).json({ message: "Mapping not found" });
    }
    await mapping.destroy();
    res.status(200).json({ message: "Mapping deleted" });
  } catch (error) {
    console.error("Error deleting mapping:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const updateMapping = async (req, res) => {
  try {
    const { id } = req.params;
    const { parameter } = req.body;

    const mapping = await IVRDTMFMapping.findByPk(id);
    if (!mapping) {
      return res.status(404).json({ message: "Mapping not found" });
    }

    mapping.parameter = parameter;
    await mapping.save();

    // Fetch updated mapping with included related data
    const updatedMapping = await IVRDTMFMapping.findByPk(id, {
      include: [
        { model: IVRAction, as: 'action', attributes: ['name'] },  
        { model: IVRVoice, as: 'voice', attributes: ['file_name'] } 
      ]
    });

    res.status(200).json({ message: "Mapping updated", mapping: updatedMapping });
  } catch (error) {
    console.error("Error updating mapping:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

module.exports = {
  addIVRDTMFMapping,
  getMappingsByVoice,
  getAllMappings,
  deleteMapping,
  updateMapping
};
