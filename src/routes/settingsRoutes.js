const express = require('express');
const router = express.Router();
const pool = require('../config/db');

// Public endpoint to get platform settings (for mobile app)
router.get('/settings', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT setting_key, setting_value
            FROM platform_settings
            WHERE setting_key IN ('min_withdrawal_usd', 'coin_to_usd_rate', 'daily_ad_limit')
        `);

        const settings = {};
        result.rows.forEach(row => {
            settings[row.setting_key] = row.setting_value;
        });

        res.json({
            success: true,
            settings: {
                minWithdrawalUSD: parseFloat(settings.min_withdrawal_usd || '5.00'),
                coinToUSDRate: parseInt(settings.coin_to_usd_rate || '500'),
                dailyAdLimit: parseInt(settings.daily_ad_limit || '20')
            }
        });
    } catch (err) {
        console.error('Get Public Settings Error:', err);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch settings'
        });
    }
});

module.exports = router;
