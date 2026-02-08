const { DataTypes } = require('sequelize');
const db = require('../utils/db');
const User = require('./User'); // IMPORTANT: Require User first since we need it for definition

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
    incentive_tasks_today: { type: DataTypes.INTEGER, defaultValue: 0 },
    rewarded_ads_today: { type: DataTypes.INTEGER, defaultValue: 0 },
    surveys_today: { type: DataTypes.INTEGER, defaultValue: 0 },
    premium_cpa_today: { type: DataTypes.INTEGER, defaultValue: 0 },
    earnings_today: { type: DataTypes.FLOAT, defaultValue: 0 },
    last_reset_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    last_incentive_at: { type: DataTypes.DATE, allowNull: true } // For cooldown tracking
};

// Pass User._sqlModel if available for association, but here we just manage via ID
const DailyUsage = db.defineModel('DailyUsage', schema);

// Associations need raw Sequelize models if in SQL mode
if (DailyUsage._sqlModel && User._sqlModel) {
    DailyUsage._sqlModel.belongsTo(User._sqlModel, { foreignKey: 'user_id' });
    User._sqlModel.hasOne(DailyUsage._sqlModel, { foreignKey: 'user_id' });
}

module.exports = DailyUsage;
