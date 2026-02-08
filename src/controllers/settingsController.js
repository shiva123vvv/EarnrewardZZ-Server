const { pool } = require('../config/db');
const { clearAdminCache } = require('../middleware/adminCache');


// Get all platform settings
exports.getSettings = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT setting_key, setting_value, description, updated_at
            FROM platform_settings
            ORDER BY setting_key
        `);

        // Convert to key-value object
        const settings = {};
        result.rows.forEach(row => {
            settings[row.setting_key] = {
                value: row.setting_value,
                description: row.description,
                updated_at: row.updated_at
            };
        });

        res.json({
            success: true,
            settings
        });
    } catch (err) {
        console.error('Get Settings Error:', err);
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

// Update platform settings
exports.updateSettings = async (req, res) => {
    try {
        const { min_withdrawal_usd, coin_to_usd_rate, daily_ad_limit } = req.body;
        const updatedBy = req.user?.email || 'admin';

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Update minimum withdrawal
            if (min_withdrawal_usd !== undefined) {
                await client.query(`
                    UPDATE platform_settings 
                    SET setting_value = $1, updated_by = $2
                    WHERE setting_key = 'min_withdrawal_usd'
                `, [min_withdrawal_usd.toString(), updatedBy]);
            }

            // Update coin to USD rate
            if (coin_to_usd_rate !== undefined) {
                await client.query(`
                    UPDATE platform_settings 
                    SET setting_value = $1, updated_by = $2
                    WHERE setting_key = 'coin_to_usd_rate'
                `, [coin_to_usd_rate.toString(), updatedBy]);
            }

            // Update daily ad limit
            if (daily_ad_limit !== undefined) {
                await client.query(`
                    UPDATE platform_settings 
                    SET setting_value = $1, updated_by = $2
                    WHERE setting_key = 'daily_ad_limit'
                `, [daily_ad_limit.toString(), updatedBy]);
            }

            await client.query('COMMIT');
            clearAdminCache();

            console.log('✅ Platform settings updated:', {

                min_withdrawal_usd,
                coin_to_usd_rate,
                daily_ad_limit,
                updatedBy
            });

            res.json({
                success: true,
                message: 'Settings updated successfully'
            });
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('Update Settings Error:', err);
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

// Get a specific setting value
exports.getSetting = async (req, res) => {
    try {
        const { key } = req.params;

        const result = await pool.query(`
            SELECT setting_value
            FROM platform_settings
            WHERE setting_key = $1
        `, [key]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Setting not found'
            });
        }

        res.json({
            success: true,
            value: result.rows[0].setting_value
        });
    } catch (err) {
        console.error('Get Setting Error:', err);
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

module.exports = exports;
