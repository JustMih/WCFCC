const express = require('express');
const router = express.Router();
const reportsController = require('../controllers/reports/reports.controller');

router.get('/voice-notes', reportsController.getVoiceNotes);
router.get('/cdr-reports', reportsController.getCDRReports);
router.get('/ivr-interactions', reportsController.getIVRInteractions);

module.exports = router;
