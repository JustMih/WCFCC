// routes/monitorRoutes.js
const express = require('express');
const router = express.Router();
const { getQueueCache, getLiveCallsCache } = require('../services/amiService');

// GET /api/live-calls — uses in-memory cache
router.get('/live-calls', (req, res) => {
  res.json(getLiveCallsCache());
});

// GET /api/waiting-calls — uses in-memory cache
router.get('/waiting-calls', (req, res) => {
  res.json(getQueueCache());
});

module.exports = router;
