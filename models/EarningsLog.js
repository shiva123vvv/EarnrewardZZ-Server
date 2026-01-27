const { DataTypes } = require('sequelize');
const db = require('../utils/db');

const schema = {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    user_id: { type: DataTypes.INTEGER, allowNull: false },
    type: { type: DataTypes.STRING, allowNull: false }, // 'cpa', 'survey', 'video', 'spin'
    amount: { type: DataTypes.FLOAT, defaultValue: 0 },
    points: { type: DataTypes.INTEGER, defaultValue: 0 },
    source: { type: DataTypes.STRING, allowNull: true }, // 'CPAGrip', 'AdMob', etc.
};

const EarningsLog = db.defineModel('EarningsLog', schema, { timestamps: true, updatedAt: false });

module.exports = EarningsLog;
