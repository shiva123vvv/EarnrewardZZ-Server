const { DataTypes } = require('sequelize');
const db = require('../utils/db');

const schema = {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    referrer_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    referred_user_id: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    status: {
        type: DataTypes.ENUM('pending', 'verified'),
        defaultValue: 'pending'
    },
    rewarded: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    }
};

const Referral = db.defineModel('Referral', schema, { timestamps: true });

module.exports = Referral;
