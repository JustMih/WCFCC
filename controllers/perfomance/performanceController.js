const PerformanceScoreCard = require('../../models/PerformanceScoreCard');
const CDR = require('../../models/CDR');
const QueueLog = require('../../models/QueueLog');
const { Op, Sequelize } = require('sequelize');
const sequelize = require('../../config/database');
const ami = require('asterisk-ami-client');

const PerformanceController = {
    // Get individual and team performance metrics for a specific agent
    getAgentPerformance: async (req, res) => {
        try {
            const { agentId } = req.params;
            const today = new Date();
            const startOfDay = new Date(today.setHours(0, 0, 0, 0));
            const endOfDay = new Date(today.setHours(23, 59, 59, 999));

            console.log('Fetching performance data for agent:', agentId);

            // Get today's performance metrics
            const performanceData = await PerformanceScoreCard.findOne({
                where: {
                    agentId,
                    date: {
                        [Op.between]: [startOfDay, endOfDay]
                    }
                }
            });

            // Get queue performance
            const queueStats = await QueueLog.findAll({
                where: {
                    agent: agentId,
                    time: {
                        [Op.between]: [startOfDay, endOfDay]
                    }
                },
                attributes: [
                    'event',
                    [sequelize.fn('COUNT', sequelize.col('id')), 'count']
                ],
                group: ['event']
            });

            // Connect to Asterisk AMI with specific credentials
            const amiClient = new ami({
                host: '10.52.0.19',
                port: 5038,
                username: 'admin',
                password: '@Ttcl123'
            });

            // Get agent status and performance data
            const getAgentData = () => {
                return new Promise((resolve, reject) => {
                    amiClient.connect()
                        .then(() => {
                            console.log('Connected to Asterisk AMI');
                            
                            // Get Queue Status
                            amiClient.action({
                                action: 'QueueStatus',
                                queue: 'default'
                            }, (err, res) => {
                                if (err) {
                                    console.error('Error getting queue status:', err);
                                    reject(err);
                                    return;
                                }
                                console.log('Queue status response:', res);

                                // Get Agent Status
                                amiClient.action({
                                    action: 'Agents',
                                    agent: agentId
                                }, (err, agentRes) => {
                                    if (err) {
                                        console.error('Error getting agent status:', err);
                                        reject(err);
                                        return;
                                    }
                                    console.log('Agent status response:', agentRes);

                                    // Get Queue Summary
                                    amiClient.action({
                                        action: 'QueueSummary',
                                        queue: 'default'
                                    }, (err, summaryRes) => {
                                        if (err) {
                                            console.error('Error getting queue summary:', err);
                                            reject(err);
                                            return;
                                        }
                                        console.log('Queue summary response:', summaryRes);

                                        // Get Core Show Channels
                                        amiClient.action({
                                            action: 'CoreShowChannels'
                                        }, (err, channelsRes) => {
                                            if (err) {
                                                console.error('Error getting channels:', err);
                                                reject(err);
                                                return;
                                            }
                                            console.log('Channels response:', channelsRes);

                                            amiClient.disconnect();
                                            console.log('Disconnected from Asterisk AMI');

                                            // Process the data
                                            const agentData = {
                                                status: agentRes?.response?.Status || 'Unknown',
                                                calls: {
                                                    total: 0,
                                                    active: 0,
                                                    completed: 0,
                                                    duration: 0
                                                },
                                                queue: {
                                                    position: 0,
                                                    calls: 0,
                                                    completed: 0,
                                                    abandoned: 0,
                                                    holdTime: 0,
                                                    talkTime: 0
                                                }
                                            };

                                            // Process queue status
                                            if (res?.response) {
                                                const agentInQueue = res.response.find(q => q.Name === agentId);
                                                if (agentInQueue) {
                                                    agentData.queue.position = agentInQueue.Position || 0;
                                                    agentData.queue.calls = agentInQueue.Calls || 0;
                                                }
                                            }

                                            // Process queue summary
                                            if (summaryRes?.response) {
                                                const queueSummary = summaryRes.response.find(q => q.Queue === 'default');
                                                if (queueSummary) {
                                                    agentData.queue.completed = queueSummary.Completed || 0;
                                                    agentData.queue.abandoned = queueSummary.Abandoned || 0;
                                                    agentData.queue.holdTime = queueSummary.Holdtime || 0;
                                                    agentData.queue.talkTime = queueSummary.TalkTime || 0;
                                                }
                                            }

                                            // Process active channels
                                            if (channelsRes?.response) {
                                                const agentChannels = channelsRes.response.filter(ch => 
                                                    ch.Channel.includes(agentId) || 
                                                    ch.Channel.includes(`Local/${agentId}`)
                                                );
                                                agentData.calls.active = agentChannels.length;
                                                agentData.calls.total = agentData.calls.active + 
                                                    (agentData.queue.completed || 0);
                                            }

                                            resolve(agentData);
                                        });
                                    });
                                });
                            });
                        })
                        .catch(err => {
                            console.error('AMI connection error:', err);
                            reject(err);
                        });
                });
            };

            // Get real-time data from Asterisk
            const agentData = await getAgentData();

            // Create default metrics if no data found
            const defaultMetrics = {
                averageHandlingTime: 0,
                firstResponseTime: 0,
                firstCallResolution: 0,
                customerSatisfaction: 0,
                totalCalls: 0,
                resolvedCalls: 0,
                abandonedCalls: 0,
                unansweredCalls: 0
            };

            // If no performance data exists for today, create a new entry
            if (!performanceData) {
                console.log('No performance data found for today, creating new entry');
                const newPerformanceData = await PerformanceScoreCard.create({
                    agentId,
                    date: new Date(),
                    ...defaultMetrics
                });
                console.log('Created new performance entry:', newPerformanceData.toJSON());
            }

            res.status(200).json({
                success: true,
                message: 'Agent performance metrics retrieved successfully',
                data: {
                    agentId,
                    performanceMetrics: performanceData?.toJSON() || defaultMetrics,
                    realTimeMetrics: {
                        status: agentData.status,
                        calls: agentData.calls,
                        queue: agentData.queue
                    },
                    queueMetrics: queueStats.reduce((acc, stat) => {
                        acc[stat.event] = stat.dataValues.count;
                        return acc;
                    }, {})
                }
            });
        } catch (error) {
            console.error('Error in getAgentPerformance:', error);
            res.status(500).json({
                success: false,
                message: 'Error retrieving agent performance metrics',
                error: error.message
            });
        }
    },

    // Get team performance metrics
    getTeamSummary: async (req, res) => {
        try {
            const today = new Date();
            const startOfDay = new Date(today.setHours(0, 0, 0, 0));
            const endOfDay = new Date(today.setHours(23, 59, 59, 999));

            // Get team-wide performance metrics
            const teamPerformance = await PerformanceScoreCard.findAll({
                where: {
                    date: {
                        [Op.between]: [startOfDay, endOfDay]
                    }
                },
                attributes: [
                    [sequelize.fn('AVG', sequelize.col('averageHandlingTime')), 'avgHandlingTime'],
                    [sequelize.fn('AVG', sequelize.col('firstResponseTime')), 'avgResponseTime'],
                    [sequelize.fn('AVG', sequelize.col('firstCallResolution')), 'avgResolutionRate'],
                    [sequelize.fn('AVG', sequelize.col('customerSatisfaction')), 'avgSatisfaction'],
                    [sequelize.fn('SUM', sequelize.col('totalCalls')), 'totalTeamCalls'],
                    [sequelize.fn('SUM', sequelize.col('resolvedCalls')), 'totalResolvedCalls']
                ]
            });

            // Get team-wide queue statistics
            const teamQueueStats = await QueueLog.findAll({
                where: {
                    time: {
                        [Op.between]: [startOfDay, endOfDay]
                    }
                },
                attributes: [
                    'event',
                    [sequelize.fn('COUNT', sequelize.col('id')), 'count']
                ],
                group: ['event']
            });

            res.status(200).json({
                success: true,
                message: 'Team performance summary retrieved successfully',
                data: {
                    teamMetrics: teamPerformance[0]?.dataValues || {
                        avgHandlingTime: 0,
                        avgResponseTime: 0,
                        avgResolutionRate: 0,
                        avgSatisfaction: 0,
                        totalTeamCalls: 0,
                        totalResolvedCalls: 0
                    },
                    queueMetrics: teamQueueStats.reduce((acc, stat) => {
                        acc[stat.event] = stat.dataValues.count;
                        return acc;
                    }, {})
                }
            });
        } catch (error) {
            console.error('Error in getTeamSummary:', error);
            res.status(500).json({
                success: false,
                message: 'Error retrieving team performance summary',
                error: error.message
            });
        }
    }
};

module.exports = PerformanceController; 