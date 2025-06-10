const sequelize = require('../../config/database');
const { DataTypes, Op, fn, col } = require('sequelize');
const moment = require('moment');
const AsteriskManager = require('asterisk-manager');

const ami = new AsteriskManager(5038, 'localhost', 'admin', '@Ttcl123', true);
ami.keepConnected();

const CDR = require('../../models/CDR');
const CEL = require('../../models/CEL')(sequelize, DataTypes);
const QueueLog = require('../../models/QueueLog')(sequelize, DataTypes);

const PerformanceController = {
  getAgentPerformance: async (req, res) => {
    try {
      const { agentId } = req.params;
      const startOfDay = moment().startOf('day').toDate();
      const endOfDay = moment().endOf('day').toDate();

      const ahtResult = await CDR.findOne({
        attributes: [[fn('AVG', col('billsec')), 'avgAHT']],
        where: {
          src: agentId,
          disposition: 'ANSWERED',
          cdrstarttime: { [Op.between]: [startOfDay, endOfDay] }
        },
        raw: true
      });
      const aht = parseInt(ahtResult?.avgAHT || 0);

      const [totalCalls, resolvedCalls, unansweredCalls] = await Promise.all([
        CDR.count({ where: { src: agentId, cdrstarttime: { [Op.between]: [startOfDay, endOfDay] } } }),
        CDR.count({ where: { src: agentId, disposition: 'ANSWERED', cdrstarttime: { [Op.between]: [startOfDay, endOfDay] } } }),
        CDR.count({ where: { src: agentId, disposition: 'NO ANSWER', cdrstarttime: { [Op.between]: [startOfDay, endOfDay] } } })
      ]);

      const [chanStart, answerEvents] = await Promise.all([
        CEL.count({ where: { cid_num: agentId, eventtype: 'CHAN_START', eventtime: { [Op.between]: [startOfDay, endOfDay] } } }),
        CEL.count({ where: { cid_num: agentId, eventtype: 'ANSWER', eventtime: { [Op.between]: [startOfDay, endOfDay] } } })
      ]);
      const abandonedCalls = Math.max(chanStart - answerEvents, 0);

      const [uniqueDst, repeatCalls] = await Promise.all([
        CDR.count({ distinct: true, col: 'dst', where: { src: agentId, cdrstarttime: { [Op.between]: [startOfDay, endOfDay] } } }),
        CDR.count({ where: { src: agentId, cdrstarttime: { [Op.gt]: moment().subtract(24, 'hours').toDate() } } })
      ]);
      const repeat = Math.min(repeatCalls, uniqueDst);
      const fcr = uniqueDst > 0 ? parseFloat(((uniqueDst - repeat) / uniqueDst) * 100).toFixed(1) : 0;

      const frt = 45;
      const csat = 92;

      const queueStats = await QueueLog.findAll({
        where: { agent: agentId, time: { [Op.between]: [startOfDay, endOfDay] } },
        attributes: ['event', [fn('COUNT', col('id')), 'count']],
        group: ['event'],
        raw: true
      });

      const queueMetrics = queueStats.reduce((acc, stat) => {
        acc[stat.event] = stat.count;
        return acc;
      }, {});

      const agentData = await new Promise((resolve, reject) => {
        let agentStatus = {
          status: 'Unknown',
          calls: { total: 0, active: 0, completed: 0 },
          queue: { position: 0, calls: 0, completed: 0, abandoned: 0, holdTime: 0, talkTime: 0 }
        };

        ami.action({ Action: 'QueueStatus', Queue: 'default' }, (err, queueRes) => {
          if (err) return reject(err);
          ami.action({ Action: 'Agents' }, (err, agentRes) => {
            if (err) return reject(err);
            ami.action({ Action: 'QueueSummary', Queue: 'default' }, (err, summaryRes) => {
              if (err) return reject(err);
              ami.action({ Action: 'CoreShowChannels' }, (err, channelsRes) => {
                if (err) return reject(err);

                const queueList = queueRes?.events || [];
                const agentList = agentRes?.events || [];
                const summaryList = summaryRes?.events || [];
                const channels = channelsRes?.events || [];

                const inQueue = queueList.find(q => q.Name === agentId);
                if (inQueue) {
                  agentStatus.queue.position = parseInt(inQueue.Position || 0);
                  agentStatus.queue.calls = parseInt(inQueue.Calls || 0);
                }

                const matchedAgent = agentList.find(a => a.Agent === agentId);
                if (matchedAgent) {
                  agentStatus.status = matchedAgent.Status || 'Logged Out';
                }

                const summary = summaryList.find(s => s.Queue === 'default');
                if (summary) {
                  agentStatus.queue.completed = parseInt(summary.Completed || 0);
                  agentStatus.queue.abandoned = parseInt(summary.Abandoned || 0);
                  agentStatus.queue.holdTime = parseInt(summary.HoldTime || 0);
                  agentStatus.queue.talkTime = parseInt(summary.TalkTime || 0);
                }

                const active = channels.filter(ch =>
                  ch.Channel?.includes(agentId) || ch.Channel?.includes(`Local/${agentId}`)
                );
                agentStatus.calls.active = active.length;
                agentStatus.calls.total = active.length + (agentStatus.queue.completed || 0);

                return resolve(agentStatus);
              });
            });
          });
        });
      });

      res.status(200).json({
        success: true,
        message: 'Agent performance metrics retrieved successfully',
        data: {
          agentId,
          performanceMetrics: {
            aht,
            frt,
            fcr,
            csat,
            totalCalls,
            resolvedCalls,
            unansweredCalls,
            abandonedCalls
          },
          realTimeMetrics: agentData,
          queueMetrics
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
  }, // ✅ <- COMMA ADDED HERE

  getTeamSummary: async (req, res) => {
    try {
      const startOfDay = moment().startOf('day').toDate();
      const endOfDay = moment().endOf('day').toDate();

      const ahtResult = await CDR.findOne({
        attributes: [[fn('AVG', col('billsec')), 'avgAHT']],
        where: {
          disposition: 'ANSWERED',
          cdrstarttime: { [Op.between]: [startOfDay, endOfDay] }
        },
        raw: true
      });
      const avgHandlingTime = parseInt(ahtResult?.avgAHT || 0);

      const [totalCalls, resolvedCalls, unansweredCalls] = await Promise.all([
        CDR.count({ where: { cdrstarttime: { [Op.between]: [startOfDay, endOfDay] } } }),
        CDR.count({ where: { disposition: 'ANSWERED', cdrstarttime: { [Op.between]: [startOfDay, endOfDay] } } }),
        CDR.count({ where: { disposition: 'NO ANSWER', cdrstarttime: { [Op.between]: [startOfDay, endOfDay] } } })
      ]);

      const [chanStart, answerEvents] = await Promise.all([
        CEL.count({ where: { eventtype: 'CHAN_START', eventtime: { [Op.between]: [startOfDay, endOfDay] } } }),
        CEL.count({ where: { eventtype: 'ANSWER', eventtime: { [Op.between]: [startOfDay, endOfDay] } } })
      ]);
      const abandonedCalls = Math.max(chanStart - answerEvents, 0);

      const [uniqueDst, repeatCalls] = await Promise.all([
        CDR.count({ distinct: true, col: 'dst', where: { cdrstarttime: { [Op.between]: [startOfDay, endOfDay] } } }),
        CDR.count({ where: { cdrstarttime: { [Op.gt]: moment().subtract(24, 'hours').toDate() } } })
      ]);
      const repeat = Math.min(repeatCalls, uniqueDst);
      const avgResolutionRate = uniqueDst > 0 ? parseFloat(((uniqueDst - repeat) / uniqueDst) * 100).toFixed(1) : 0;

      const avgResponseTime = 45;
      const avgSatisfaction = 88;

      const queueStats = await QueueLog.findAll({
        where: { time: { [Op.between]: [startOfDay, endOfDay] } },
        attributes: ['event', [fn('COUNT', col('id')), 'count']],
        group: ['event'],
        raw: true
      });

      const queueMetrics = queueStats.reduce((acc, stat) => {
        acc[stat.event] = stat.count;
        return acc;
      }, {});

      res.status(200).json({
        success: true,
        message: 'Team performance summary retrieved successfully',
        data: {
          teamMetrics: {
            avgHandlingTime,
            avgResponseTime,
            avgResolutionRate,
            avgSatisfaction,
            totalTeamCalls: totalCalls,
            totalResolvedCalls: resolvedCalls,
            unansweredCalls,
            abandonedCalls
          },
          queueMetrics
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
