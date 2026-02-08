const { DataTypes } = require('sequelize');
const db = require('../utils/db');

const GlobalLimit = db.defineModel('GlobalLimit', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

    // --- CATEGORY A: Ads (Rewarded) ---
    limit_ads_free: { type: DataTypes.INTEGER, defaultValue: 10 },
    limit_ads_paid: { type: DataTypes.INTEGER, defaultValue: 50 },

    // --- CATEGORY B: Tasks (CPA/CPI) ---
    limit_tasks_free: { type: DataTypes.INTEGER, defaultValue: 8 },
    limit_tasks_paid: { type: DataTypes.INTEGER, defaultValue: 8 },

    // --- CATEGORY C: App Installs ---
    limit_installs_free: { type: DataTypes.INTEGER, defaultValue: 5 },
    limit_installs_paid: { type: DataTypes.INTEGER, defaultValue: 20 },

    // --- CATEGORY D: CPM / Display / Push ---
    limit_cpm_free: { type: DataTypes.INTEGER, defaultValue: 20 },
    limit_cpm_paid: { type: DataTypes.INTEGER, defaultValue: 100 },

    // --- CATEGORY E: Surveys ---
    limit_surveys_free: { type: DataTypes.INTEGER, defaultValue: 2 },
    limit_surveys_paid: { type: DataTypes.INTEGER, defaultValue: 10 },

    // Reset Configuration
    reset_time_utc: { type: DataTypes.STRING, defaultValue: "00:00" } // Format: HH:MM
}, {
    tableName: 'global_limits',
    timestamps: true
});

module.exports = GlobalLimit;
