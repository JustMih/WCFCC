const { DataTypes } = require('sequelize');
const sequelize = require('../config/mysql_connection');

const CDR = sequelize.define('CDR', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
    },
    clid: {
        type: DataTypes.STRING(80),
        allowNull: true,
        comment: 'Caller ID'
    },
    src: {
        type: DataTypes.STRING(80),
        allowNull: true,
        comment: 'Source (agent extension)'
    },
    dst: {
        type: DataTypes.STRING(80),
        allowNull: true,
        comment: 'Destination'
    },
    dcontext: {
        type: DataTypes.STRING(80),
        allowNull: true,
        comment: 'Destination context'
    },
    channel: {
        type: DataTypes.STRING(80),
        allowNull: true,
        comment: 'Channel name'
    },
    dstchannel: {
        type: DataTypes.STRING(80),
        allowNull: true,
        comment: 'Destination channel'
    },
    lastapp: {
        type: DataTypes.STRING(80),
        allowNull: true,
        comment: 'Last application'
    },
    lastdata: {
        type: DataTypes.STRING(80),
        allowNull: true,
        comment: 'Last application data'
    },
    duration: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'Total call duration in seconds'
    },
    billsec: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'Billed duration in seconds'
    },
    disposition: {
        type: DataTypes.STRING(45),
        allowNull: true,
        comment: 'Call disposition (ANSWERED, NO ANSWER, BUSY, FAILED)'
    },
    amaflags: {
        type: DataTypes.INTEGER,
        allowNull: true,
        comment: 'AMA flags'
    },
    accountcode: {
        type: DataTypes.STRING(20),
        allowNull: true,
        comment: 'Account code'
    },
    uniqueid: {
        type: DataTypes.STRING(150),
        allowNull: true,
        comment: 'Unique call ID'
    },
    userfield: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: 'User defined field'
    },
    did: {
        type: DataTypes.STRING(80),
        allowNull: true,
        comment: 'DID number'
    },
    recordingfile: {
        type: DataTypes.STRING(255),
        allowNull: true,
        comment: 'Path to recording file'
    },
    cdrstarttime: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Call start time',
        defaultValue: DataTypes.NOW
    }
}, {
    tableName: 'cdr',
    timestamps: false,
    indexes: [
        {
            name: 'idx_cdr_src',
            fields: ['src']
        },
        {
            name: 'idx_cdr_starttime',
            fields: ['cdrstarttime']
        },
        {
            name: 'idx_cdr_disposition',
            fields: ['disposition']
        }
    ]
});

// Static methods for performance metrics
CDR.getAgentMetrics = async function(agentId, startDate, endDate) {
    const whereClause = {
        src: agentId
    };

    if (startDate && endDate) {
        whereClause.cdrstarttime = {
            [sequelize.Op.between]: [startDate, endDate]
        };
    } else if (startDate) {
        whereClause.cdrstarttime = {
            [sequelize.Op.gte]: startDate
        };
    } else if (endDate) {
        whereClause.cdrstarttime = {
            [sequelize.Op.lte]: endDate
        };
    }

    const metrics = await this.findAll({
        attributes: [
            [sequelize.fn('AVG', sequelize.col('billsec')), 'aht'],
            [sequelize.fn('COUNT', sequelize.col('id')), 'total_calls'],
            [
                sequelize.literal(`COUNT(CASE WHEN disposition = 'ANSWERED' AND billsec > 0 THEN 1 END) * 100.0 / 
                COUNT(CASE WHEN disposition = 'ANSWERED' THEN 1 END)`),
                'fcr'
            ],
            [
                sequelize.literal(`COUNT(CASE WHEN disposition = 'NO ANSWER' THEN 1 END) * 100.0 / 
                COUNT(*)`),
                'unanswered'
            ]
        ],
        where: whereClause
    });

    return metrics[0];
};

CDR.getTeamMetrics = async function(startDate, endDate) {
    const whereClause = {};

    if (startDate && endDate) {
        whereClause.cdrstarttime = {
            [sequelize.Op.between]: [startDate, endDate]
        };
    } else if (startDate) {
        whereClause.cdrstarttime = {
            [sequelize.Op.gte]: startDate
        };
    } else if (endDate) {
        whereClause.cdrstarttime = {
            [sequelize.Op.lte]: endDate
        };
    }

    const metrics = await this.findAll({
        attributes: [
            [sequelize.fn('AVG', sequelize.col('billsec')), 'aht'],
            [sequelize.fn('COUNT', sequelize.col('id')), 'total_calls'],
            [
                sequelize.literal(`COUNT(CASE WHEN disposition = 'ANSWERED' AND billsec > 0 THEN 1 END) * 100.0 / 
                COUNT(CASE WHEN disposition = 'ANSWERED' THEN 1 END)`),
                'fcr'
            ],
            [
                sequelize.literal(`COUNT(CASE WHEN disposition = 'NO ANSWER' THEN 1 END) * 100.0 / 
                COUNT(*)`),
                'unanswered'
            ]
        ],
        where: whereClause
    });

    return metrics[0];
};

module.exports = CDR; 