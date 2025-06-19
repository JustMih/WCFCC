const PerformanceScoreCard = require('../models/PerformanceScoreCard');
const { Op } = require('sequelize');
const sequelize = require('sequelize');

// Get performance metrics for a specific agent
exports.getAgentPerformance = async (req, res) => {
  try {
    const { agentId, startDate, endDate } = req.query;
    
    const whereClause = {
      agentId,
      date: {
        [Op.between]: [startDate, endDate]
      }
    };

    const performance = await PerformanceScoreCard.findAll({
      where: whereClause,
      order: [['date', 'ASC']]
    });

    res.json(performance);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Update performance metrics
exports.updatePerformance = async (req, res) => {
  try {
    const {
      agentId,
      date,
      averageHandlingTime,
      firstResponseTime,
      firstCallResolution,
      averageSpeedOfAnswer,
      callAbandonmentRate,
      unansweredRate,
      customerSatisfaction,
      totalCalls,
      resolvedCalls,
      abandonedCalls,
      unansweredCalls
    } = req.body;

    const [performance, created] = await PerformanceScoreCard.findOrCreate({
      where: { agentId, date },
      defaults: {
        averageHandlingTime,
        firstResponseTime,
        firstCallResolution,
        averageSpeedOfAnswer,
        callAbandonmentRate,
        unansweredRate,
        customerSatisfaction,
        totalCalls,
        resolvedCalls,
        abandonedCalls,
        unansweredCalls
      }
    });

    if (!created) {
      await performance.update({
        averageHandlingTime,
        firstResponseTime,
        firstCallResolution,
        averageSpeedOfAnswer,
        callAbandonmentRate,
        unansweredRate,
        customerSatisfaction,
        totalCalls,
        resolvedCalls,
        abandonedCalls,
        unansweredCalls
      });
    }

    res.json(performance);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get performance summary for all agents
exports.getPerformanceSummary = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const summary = await PerformanceScoreCard.findAll({
      where: {
        date: {
          [Op.between]: [startDate, endDate]
        }
      },
      attributes: [
        'agentId',
        [sequelize.fn('AVG', sequelize.col('averageHandlingTime')), 'avgHandlingTime'],
        [sequelize.fn('AVG', sequelize.col('firstResponseTime')), 'avgResponseTime'],
        [sequelize.fn('AVG', sequelize.col('firstCallResolution')), 'avgCallResolution'],
        [sequelize.fn('AVG', sequelize.col('averageSpeedOfAnswer')), 'avgSpeedOfAnswer'],
        [sequelize.fn('AVG', sequelize.col('callAbandonmentRate')), 'avgAbandonmentRate'],
        [sequelize.fn('AVG', sequelize.col('unansweredRate')), 'avgUnansweredRate'],
        [sequelize.fn('AVG', sequelize.col('customerSatisfaction')), 'avgCustomerSatisfaction'],
        [sequelize.fn('SUM', sequelize.col('totalCalls')), 'totalCalls'],
        [sequelize.fn('SUM', sequelize.col('resolvedCalls')), 'totalResolvedCalls'],
        [sequelize.fn('SUM', sequelize.col('abandonedCalls')), 'totalAbandonedCalls'],
        [sequelize.fn('SUM', sequelize.col('unansweredCalls')), 'totalUnansweredCalls']
      ],
      group: ['agentId']
    });

    res.json(summary);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}; 