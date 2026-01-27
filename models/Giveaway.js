const { DataTypes } = require('sequelize');
const db = require('../utils/db');

const schema = {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    title: {
        type: DataTypes.STRING,
        allowNull: false
    },
    prize_name: {
        type: DataTypes.STRING,
        allowNull: false
    },
    cost_points: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    image_url: {
        type: DataTypes.STRING,
        allowNull: true
    },
    status: {
        type: DataTypes.ENUM('active', 'ended', 'drawn', 'pending_delivery', 'delivered'),
        defaultValue: 'active'
    },
    winner_user_id: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    notes: {
        type: DataTypes.TEXT, // Admin notes for delivery
        allowNull: true
    },
    draw_time: {
        type: DataTypes.DATE, // When the draw happened
        allowNull: true
    }
};

const Giveaway = db.defineModel('Giveaway', schema, { timestamps: true });

module.exports = Giveaway;
