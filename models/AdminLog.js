const { DataTypes } = require('sequelize');
const db = require('../utils/db');

const schema = {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    admin_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    action: {
        type: DataTypes.STRING,
        allowNull: false
    },
    target: {
        type: DataTypes.STRING, // e.g., "User: 123" or "Platform: CPAGrip"
        allowNull: true
    },
    details: {
        type: DataTypes.TEXT,
        allowNull: true
    }
};

const AdminLog = db.defineModel('AdminLog', schema, { timestamps: true, updatedAt: false });

module.exports = AdminLog;
