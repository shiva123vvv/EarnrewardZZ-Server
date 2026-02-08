const db = require('../utils/db');
const { DataTypes } = require('sequelize');

const AdminExpense = db.defineModel('AdminExpense', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    amount: {
        type: DataTypes.FLOAT,
        defaultValue: 0
    },
    description: {
        type: DataTypes.STRING,
        allowNull: true
    },
    created_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    }
}, {
    tableName: 'admin_expenses',
    timestamps: false
});

module.exports = AdminExpense;
