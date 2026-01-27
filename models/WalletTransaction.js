const { DataTypes } = require('sequelize');
const db = require('../utils/db');
const User = require('./User');

const schema = {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    amount: { type: DataTypes.FLOAT, allowNull: false },
    type: { type: DataTypes.ENUM('debit', 'credit'), allowNull: false },
    reason: { type: DataTypes.STRING, allowNull: false }
};

const WalletTransaction = db.defineModel('WalletTransaction', schema, {
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false
});

if (WalletTransaction._sqlModel && User._sqlModel) {
    WalletTransaction._sqlModel.belongsTo(User._sqlModel, { foreignKey: 'user_id' });
    User._sqlModel.hasMany(WalletTransaction._sqlModel, { foreignKey: 'user_id' });
}

module.exports = WalletTransaction;
