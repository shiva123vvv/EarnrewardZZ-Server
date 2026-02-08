const db = require('../utils/db');
const { DataTypes } = require('sequelize');

const UserTask = db.defineModel('UserTask', {
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    task_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    provider: {
        type: DataTypes.STRING,
        allowNull: false
    },
    status: {
        type: DataTypes.STRING, // clicked, in_progress, pending_approval, completed
        defaultValue: 'clicked'
    },
    reward_snapshot: {
        type: DataTypes.FLOAT,
        defaultValue: 0.00
    },
    started_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    },
    completed_at: {
        type: DataTypes.DATE,
        allowNull: true
    }
}, {});

module.exports = UserTask;
