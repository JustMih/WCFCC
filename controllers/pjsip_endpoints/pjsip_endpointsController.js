const Pjsip_Endpoints = require("../../models/pjsip_endpoints");

// Create
const createEndpoint = async (req, res) => {
  try {
    const {
      id,
      transport,
      aors,
      auth,
      context,
      disallow,
      allow,
      direct_media,
      outbound_proxy,
      from_domain,
      qualify_frequency,
      media_address,
      dtmf_mode,
      force_rport,
      comedia,
      rtp_symmetric,
    } = req.body;

    const endpoint = await Pjsip_Endpoints.create({
      id,
      transport,
      aors,
      auth,
      context,
      disallow,
      allow,
      direct_media,
      outbound_proxy,
      from_domain,
      qualify_frequency,
      media_address,
      dtmf_mode,
      force_rport,
      comedia,
      rtp_symmetric,
    });
    res.status(201).json(endpoint);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Read all
const getAllEndpoints = async (req, res) => {
  try {
    const endpoints = await Pjsip_Endpoints.findAll();
    res.status(200).json(endpoints);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Read by ID
const getEndpointById = async (req, res) => {
  try {
    const endpoint = await Pjsip_Endpoints.findByPk(req.params.id);
    if (endpoint) {
      res.status(200).json(endpoint);
    } else {
      res.status(404).json({ message: "Endpoint not found" });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Update
const updateEndpoint = async (req, res) => {
  try {
    const {
      id,
      transport,
      aors,
      auth,
      context,
      disallow,
      allow,
      direct_media,
      outbound_proxy,
      from_domain,
      qualify_frequency,
      media_address,
      dtmf_mode,
      force_rport,
      comedia,
      rtp_symmetric,
    } = req.body;

    const endpoint = await Pjsip_Endpoints.findByPk(req.params.id);
    if (endpoint) {
      endpoint.id = id || endpoint.id;
      endpoint.transport = transport || endpoint.transport;
      endpoint.aors = aors || endpoint.aors;
      endpoint.auth = auth || endpoint.auth;
      endpoint.context = context || endpoint.context;
      endpoint.disallow = disallow || endpoint.disallow;
      endpoint.allow = allow || endpoint.allow;
      endpoint.direct_media = direct_media || endpoint.direct_media;
      endpoint.outbound_proxy = outbound_proxy || endpoint.outbound_proxy;
      endpoint.from_domain = from_domain || endpoint.from_domain;
      endpoint.qualify_frequency =
        qualify_frequency || endpoint.qualify_frequency;
      endpoint.media_address = media_address || endpoint.media_address;
      endpoint.dtmf_mode = dtmf_mode || endpoint.dtmf_mode;
      endpoint.force_rport = force_rport || endpoint.force_rport;
      endpoint.comedia = comedia || endpoint.comedia;
      endpoint.rtp_symmetric = rtp_symmetric || endpoint.rtp_symmetric;

      await endpoint.save();
      res.status(200).json(endpoint);
    } else {
      res.status(404).json({ message: "Endpoint not found" });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Delete
const deleteEndpoint = async (req, res) => {
  try {
    const endpoint = await Pjsip_Endpoints.findByPk(req.params.id);
    if (endpoint) {
      await endpoint.destroy();
      res.status(200).json({ message: "Endpoint deleted" });
    } else {
      res.status(404).json({ message: "Endpoint not found" });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  createEndpoint,
  getAllEndpoints,
  getEndpointById,
  updateEndpoint,
  deleteEndpoint,
};