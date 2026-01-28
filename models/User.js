const { DataTypes } = require('sequelize');
const db = require('../utils/db');

// Schema definition (Sequelize style)
const schema = {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    firebase_uid: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
    },
    email: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: { isEmail: true }
    },
    name: {
        type: DataTypes.STRING,
        allowNull: true
    },
    role: {
        type: DataTypes.ENUM('user', 'admin', 'super_admin'),
        defaultValue: 'user'
    },
    wallet_balance: {
        type: DataTypes.FLOAT,
        defaultValue: 0,
        validate: { min: 0 }
    },
    plan_type: {
        type: DataTypes.ENUM('free', 'pro'),
        defaultValue: 'free'
    },
    plan_expiry: {
        type: DataTypes.DATE,
        allowNull: true
    },
    status: {
        type: DataTypes.ENUM('active', 'banned', 'suspended'),
        defaultValue: 'active'
    },
    spins_available: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    points_balance: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    referral_code: {
        type: DataTypes.STRING,
        unique: true,
        allowNull: true
    },
    stored_password: {
        type: DataTypes.STRING,
        allowNull: true
    }
};

// Define via wrapper
const User = db.defineModel('User', schema, { timestamps: true });

module.exports = User;
