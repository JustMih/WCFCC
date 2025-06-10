const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');

// Get individual and team performance metrics for a specific agent
router.get('/:agentId', auth, async (req, res) => {
    try {
        const { agentId } = req.params;
        
        // TODO: Implement actual database queries to fetch metrics
        // This is a sample response structure matching your frontend needs
        const response = {
            individual: {
                aht: 180, // Average Handling Time in seconds
                frt: 45,  // First Response Time in seconds
                fcr: 85,  // First Call Resolution percentage
                asa: 30,  // Average Speed of Answer in seconds
                avar: 5,  // Call Abandonment Rate percentage
                unanswered: 3, // Unanswered Rate percentage
                cs: 90    // Customer Satisfaction score
            },
            team: {
                aht: 200,
                frt: 60,
                fcr: 80,
                asa: 35,
                avar: 6,
                unanswered: 4,
                cs: 88
            }
        };

        res.json(response);
    } catch (error) {
        console.error('Error fetching performance metrics:', error);
        res.status(500).json({ error: 'Failed to fetch performance metrics' });
    }
});

// Get team performance metrics
router.get('/team/summary', auth, async (req, res) => {
    try {
        // TODO: Implement actual database queries to fetch team metrics
        const teamMetrics = {
            aht: 200,
            frt: 60,
            fcr: 80,
            asa: 35,
            avar: 6,
            unanswered: 4,
            cs: 88
        };

        res.json(teamMetrics);
    } catch (error) {
        console.error('Error fetching team metrics:', error);
        res.status(500).json({ error: 'Failed to fetch team metrics' });
    }
});

module.exports = router; 