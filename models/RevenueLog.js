const { DataTypes } = require('sequelize');
const db = require('../utils/db');

const schema = {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    user_id: { type: DataTypes.INTEGER, allowNull: false },
    source: { type: DataTypes.STRING, allowNull: false }, // ads | survey | cpa | task | referral
    platform_name: { type: DataTypes.STRING, allowNull: true }, // Store specific provider name
    gross_amount: { type: DataTypes.FLOAT, defaultValue: 0 },
    user_earning: { type: DataTypes.FLOAT, defaultValue: 0 },
    platform_commission: { type: DataTypes.FLOAT, defaultValue: 0 },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
};

const RevenueLog = db.defineModel('RevenueLog', schema, { timestamps: false });

module.exports = RevenueLog;
