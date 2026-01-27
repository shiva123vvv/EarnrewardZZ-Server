const { DataTypes } = require('sequelize');
const db = require('../utils/db');

const schema = {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    user_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    amount: {
        type: DataTypes.FLOAT,
        allowNull: false,
        validate: { min: 0 }
    },
    payment_method: {
        type: DataTypes.ENUM('UPI', 'PAYPAL'),
        allowNull: false
    },
    upi_id: {
        type: DataTypes.STRING,
        allowNull: true
    },
    paypal_email: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: { isEmail: true }
    },
    status: {
        type: DataTypes.ENUM('PENDING', 'APPROVED', 'REJECTED'),
        defaultValue: 'PENDING'
    },
    admin_note: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    processed_at: {
        type: DataTypes.DATE,
        allowNull: true
    }
};

const Withdrawal = db.defineModel('Withdrawal', schema, { timestamps: true });

// Association (User)
const User = require('./User');
Withdrawal.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

module.exports = Withdrawal;
