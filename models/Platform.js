const { DataTypes } = require('sequelize');
const db = require('../utils/db');

const schema = {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false
    },
    priority: {
        type: DataTypes.INTEGER,
        defaultValue: 1 // Default priority 1 (High)
    },
    // Row-by-Row Max Earn Limit ($)
    max_earn: {
        type: DataTypes.FLOAT,
        defaultValue: 2.00
    },
    status: {
        type: DataTypes.ENUM('enabled', 'disabled'),
        defaultValue: 'enabled'
    },
    category: {
        type: DataTypes.ENUM('ads', 'tasks', 'surveys', 'cpm', 'installs'),
        allowNull: false
    },
    notes: {
        type: DataTypes.TEXT,
        allowNull: true
    },

    // Config for internal platform specific settings (API keys, etc)
    config: {
        type: DataTypes.JSON,
        defaultValue: {}
    },

    // Legacy fields
    risk_level: { type: DataTypes.ENUM('low', 'medium', 'high', 'critical'), defaultValue: 'low' },
    rotation_enabled: { type: DataTypes.BOOLEAN, defaultValue: false },
    rotation_mode: { type: DataTypes.ENUM('priority', 'round_robin'), defaultValue: 'priority' },
    cooldown_hours: { type: DataTypes.INTEGER, defaultValue: 24 }
};

const Platform = db.defineModel('Platform', schema, { timestamps: true });

module.exports = Platform;
