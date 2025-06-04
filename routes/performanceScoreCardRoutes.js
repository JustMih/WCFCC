const express = require('express');
const router = express.Router();
const performanceScoreCardController = require('../controllers/performanceScoreCardController');
const auth = require('../middleware/auth');

// Get performance metrics for a specific agent
router.get('/agent', auth, performanceScoreCardController.getAgentPerformance);

// Update performance metrics
router.post('/update', auth, performanceScoreCardController.updatePerformance);

// Get performance summary for all agents
router.get('/summary', auth, performanceScoreCardController.getPerformanceSummary);

module.exports = router; 