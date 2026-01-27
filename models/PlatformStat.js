const { DataTypes } = require('sequelize');
const db = require('../utils/db');

const schema = {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    platform_name: {
        type: DataTypes.STRING,
        allowNull: false
    },
    revenue: {
        type: DataTypes.FLOAT,
        defaultValue: 0
    },
    actions_completed: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    date: {
        type: DataTypes.DATEONLY, // Store YYYY-MM-DD
        allowNull: false
    }
};

const PlatformStat = db.defineModel('PlatformStat', schema, { timestamps: true });

module.exports = PlatformStat;
