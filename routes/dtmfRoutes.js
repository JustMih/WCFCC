const express = require('express');
const router = express.Router();
const controller = require('../controllers/ivrAction/dtmfController');

// Must be exactly this path
router.get('/dtmf-stats', controller.getDTMFStats);

module.exports = router;
