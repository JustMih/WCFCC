const express = require('express');
const router = express.Router();
// const auth = require('../middleware/auth');
const PerformanceController = require('../controllers/perfomance/performanceController');

// Get individual and team performance metrics for a specific agent
router.get('/:agentId', PerformanceController.getAgentPerformance);

// Get team performance metrics
router.get('/team/summary', PerformanceController.getTeamSummary);

module.exports = router; 