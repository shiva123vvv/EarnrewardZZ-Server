const db = require('../utils/db');
const { DataTypes } = require('sequelize');

const Task = db.defineModel('Task', {
    title: {
        type: DataTypes.STRING,
        allowNull: false
    },
    provider: {
        type: DataTypes.STRING,
        allowNull: false
    },
    type: {
        type: DataTypes.STRING, // ad, task, survey, premium
        allowNull: false
    },
    reward: {
        type: DataTypes.FLOAT,
        defaultValue: 0.00
    },
    difficulty: {
        type: DataTypes.STRING, // Easy, Medium, Hard, Pro
        defaultValue: 'Easy'
    },
    instructions: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    url: {
        type: DataTypes.STRING,
        allowNull: true
    },
    is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    }
}, {});

module.exports = Task;
