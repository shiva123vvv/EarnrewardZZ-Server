const { pool } = require('../config/db');
const { clearAdminCache } = require('../middleware/adminCache');


// Comprehensive Dashboard Stats
exports.getDashboardStats = async (req, res) => {
    try {
        // User Stats
        const userStats = await pool.query(`
            SELECT 
                COUNT(*) as total_users,
                COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) as new_today,
                COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '7 days') as new_this_week,
                COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE - INTERVAL '30 days') as new_this_month
            FROM users
        `);

        // Coin Stats
        const coinStats = await pool.query(`
            SELECT 
                COALESCE(SUM(balance), 0) as total_circulating,
                COALESCE(SUM(pending), 0) as total_pending,
                COALESCE(SUM(lifetime), 0) as total_generated
            FROM coin_wallets
        `);

        // Token Stats
        const tokenStats = await pool.query(`
            SELECT 
                COALESCE(SUM(balance), 0) as total_circulating,
                COALESCE(SUM(lifetime), 0) as total_generated,
                COALESCE(SUM(spins_left), 0) as total_spins_available
            FROM token_wallets
        `);

        // Withdrawal Stats
        const withdrawalStats = await pool.query(`
            SELECT 
                COUNT(*) FILTER (WHERE status = 'pending' AND amount_usd >= 1.00) as pending_count,
                COUNT(*) FILTER (WHERE status = 'paid' AND amount_usd >= 1.00) as paid_count,
                COUNT(*) FILTER (WHERE status = 'rejected' AND amount_usd >= 1.00) as rejected_count,
                COALESCE(SUM(amount_usd) FILTER (WHERE status = 'paid'), 0) as total_paid_usd,
                COALESCE(SUM(amount_usd) FILTER (WHERE status = 'pending'), 0) as pending_usd
            FROM withdrawals
            WHERE amount_usd >= 1.00 OR status IS NOT NULL
        `);

        // Today's Earnings
        const todayEarnings = await pool.query(`
            SELECT 
                COALESCE(SUM(amount), 0) as coins_today
            FROM coin_earnings 
            WHERE created_at >= CURRENT_DATE
        `);

        const todayTokens = await pool.query(`
            SELECT 
                COALESCE(SUM(amount), 0) as tokens_today
            FROM token_earnings 
            WHERE created_at >= CURRENT_DATE
        `);

        // Referral Stats
        const referralStats = await pool.query(`
            SELECT 
                COUNT(*) FILTER (WHERE is_referred = TRUE) as total_referred_users,
                COUNT(DISTINCT referred_by) as active_referrers
            FROM users
        `);

        res.json({
            success: true,
            users: userStats.rows[0],
            coins: coinStats.rows[0],
            tokens: tokenStats.rows[0],
            withdrawals: withdrawalStats.rows[0],
            todayEarnings: {
                coins: parseInt(todayEarnings.rows[0].coins_today),
                tokens: parseInt(todayTokens.rows[0].tokens_today)
            },
            referrals: referralStats.rows[0]
        });
    } catch (err) {
        console.error('Dashboard Stats Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

// Get All Users with Wallet Info
exports.getUsers = async (req, res) => {
    try {
        const { page = 1, limit = 50, search = '' } = req.query;
        const offset = (page - 1) * limit;

        let query = `
            SELECT 
                u.id, u.email, u.phone_number, u.created_at, u.referral_code, u.is_referred,
                COALESCE(cw.balance, 0) as coin_balance,
                COALESCE(cw.lifetime, 0) as coin_lifetime,
                COALESCE(tw.balance, 0) as token_balance,
                COALESCE(tw.lifetime, 0) as token_lifetime,
                COALESCE(tw.spins_left, 0) as spins_left,
                (SELECT COUNT(*) FROM users r WHERE r.referred_by = u.referral_code) as referral_count
            FROM users u
            LEFT JOIN coin_wallets cw ON u.id = cw.user_id
            LEFT JOIN token_wallets tw ON u.id = tw.user_id
        `;

        const params = [];
        if (search) {
            query += ` WHERE (u.email ILIKE $1 OR u.phone_number ILIKE $1 OR CAST(u.id AS TEXT) = $2)`;
            params.push(`%${search}%`, search);
        }

        query += ` ORDER BY u.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, offset);

        const users = await pool.query(query, params);

        const countQuery = search
            ? `SELECT COUNT(*) FROM users WHERE email ILIKE $1 OR phone_number ILIKE $1 OR CAST(id AS TEXT) = $2`
            : `SELECT COUNT(*) FROM users`;
        const countParams = search ? [`%${search}%`, search] : [];
        const totalCount = await pool.query(countQuery, countParams);

        res.json({
            success: true,
            users: users.rows,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: parseInt(totalCount.rows[0].count),
                pages: Math.ceil(totalCount.rows[0].count / limit)
            }
        });
    } catch (err) {
        console.error('Get Users Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

// Get All Withdrawals
exports.getWithdrawals = async (req, res) => {
    try {
        const { status = 'all', page = 1, limit = 50 } = req.query;
        const offset = (page - 1) * limit;

        let query = `
            SELECT w.id, w.user_id, w.coins_requested, w.amount_usd, w.payment_method, w.payment_address, w.status, w.created_at, u.email, u.phone_number
            FROM withdrawals w 
            JOIN users u ON w.user_id = u.id
            WHERE (w.amount_usd >= 1.00 OR w.status IS NOT NULL)
        `;

        const params = [];
        if (status !== 'all') {
            query += ` AND w.status = $1`;
            params.push(status);
        }

        query += ` ORDER BY w.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, offset);

        const result = await pool.query(query, params);

        res.json({ success: true, withdrawals: result.rows });
    } catch (err) {
        console.error('Get Withdrawals Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

// Process Withdrawal
exports.processWithdrawal = async (req, res) => {
    const { id, status } = req.body; // status: 'paid', 'rejected'
    if (!['paid', 'rejected'].includes(status)) return res.status(400).json({ message: "Invalid status" });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const wRes = await client.query("SELECT * FROM withdrawals WHERE id = $1", [id]);
        if (wRes.rows.length === 0) throw new Error("Withdrawal not found");
        const withdrawal = wRes.rows[0];

        if (withdrawal.status !== 'pending') throw new Error("Already processed");

        if (status === 'rejected') {
            // Refund Coins
            await client.query("UPDATE coin_wallets SET balance = balance + $1 WHERE user_id = $2", [withdrawal.coins_requested, withdrawal.user_id]);
        }

        await client.query("UPDATE withdrawals SET status = $1 WHERE id = $2", [status, id]);

        await client.query('COMMIT');
        clearAdminCache();
        res.json({ success: true, message: `Withdrawal ${status}` });


    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Process Withdrawal Error:', err);
        res.status(500).json({ success: false, message: err.message });
    } finally {
        client.release();
    }
};

// Get Earnings Analytics
exports.getEarningsAnalytics = async (req, res) => {
    try {
        const { days = 30 } = req.query;

        // Coin Earnings by Source
        const coinsBySource = await pool.query(`
            SELECT 
                source,
                COUNT(*) as count,
                SUM(amount) as total
            FROM coin_earnings
            WHERE created_at >= CURRENT_DATE - INTERVAL '${parseInt(days)} days'
            GROUP BY source
            ORDER BY total DESC
        `);

        // Token Earnings by Source
        const tokensBySource = await pool.query(`
            SELECT 
                source,
                COUNT(*) as count,
                SUM(amount) as total
            FROM token_earnings
            WHERE created_at >= CURRENT_DATE - INTERVAL '${parseInt(days)} days'
            GROUP BY source
            ORDER BY total DESC
        `);

        // Daily Earnings Trend
        const dailyTrend = await pool.query(`
            SELECT 
                DATE(created_at) as date,
                COALESCE(SUM(amount), 0) as coins
            FROM coin_earnings
            WHERE created_at >= CURRENT_DATE - INTERVAL '${parseInt(days)} days'
            GROUP BY DATE(created_at)
            ORDER BY date DESC
        `);

        res.json({
            success: true,
            coinsBySource: coinsBySource.rows,
            tokensBySource: tokensBySource.rows,
            dailyTrend: dailyTrend.rows
        });
    } catch (err) {
        console.error('Earnings Analytics Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

// Get Recent Activity
exports.getRecentActivity = async (req, res) => {
    try {
        const limit = parseInt(req.query.limit || 100);

        const activities = await pool.query(`
            (SELECT 
                'coin_earning' as type,
                ce.user_id,
                u.email,
                ce.source,
                ce.amount,
                ce.created_at
            FROM coin_earnings ce
            JOIN users u ON ce.user_id = u.id
            ORDER BY ce.created_at DESC
            LIMIT $1)
            UNION ALL
            (SELECT 
                'token_earning' as type,
                te.user_id,
                u.email,
                te.source,
                te.amount,
                te.created_at
            FROM token_earnings te
            JOIN users u ON te.user_id = u.id
            ORDER BY te.created_at DESC
            LIMIT $1)
            UNION ALL
            (SELECT 
                'withdrawal' as type,
                w.user_id,
                u.email,
                w.status as source,
                w.coins_requested as amount,
                w.created_at

            FROM withdrawals w
            JOIN users u ON w.user_id = u.id
            ORDER BY w.created_at DESC
            LIMIT $1)
            ORDER BY created_at DESC
            LIMIT $1
        `, [limit]);

        res.json({ success: true, activities: activities.rows });
    } catch (err) {
        console.error('Recent Activity Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};
// Get Referral Stats and Detailed List
exports.getReferralStats = async (req, res) => {
    try {
        // Aggregated stats
        const aggregates = await pool.query(`
            SELECT 
                COUNT(*) FILTER (WHERE is_referred = TRUE) as total_referrals,
                COUNT(DISTINCT referred_by) FILTER (WHERE referred_by IS NOT NULL) as total_referrers,
                COUNT(*) FILTER (WHERE is_referred = TRUE AND created_at >= CURRENT_DATE) as referrals_today,
                COUNT(*) FILTER (WHERE is_referred = TRUE AND created_at >= CURRENT_DATE - INTERVAL '7 days') as referrals_this_week
            FROM users
        `);

        // Top Referrers
        const topReferrers = await pool.query(`
            SELECT 
                r.id as user_id,
                r.email,
                r.referral_code,
                COUNT(u.id) as referral_count
            FROM users r
            JOIN users u ON r.referral_code = u.referred_by
            GROUP BY r.id, r.email, r.referral_code
            ORDER BY referral_count DESC
            LIMIT 10
        `);

        res.json({
            success: true,
            stats: aggregates.rows[0],
            topReferrers: topReferrers.rows
        });
    } catch (err) {
        console.error('Referral Stats Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.getReferralList = async (req, res) => {
    try {
        const page = parseInt(req.query.page || 1);
        const limit = parseInt(req.query.limit || 20);
        const search = req.query.search || '';
        const offset = (page - 1) * limit;

        // Base query to get referrers with stats
        // USING USERS TABLE AS SOURCE OF TRUTH (r = referrer, u = referred)
        let query = `
            SELECT 
                r.id as user_id,
                r.email,
                COUNT(u.id) as referral_count,
                MAX(u.created_at) as last_referral_date,
                COALESCE(SUM(te.amount), 0) as referral_tokens_earned
            FROM users r
            JOIN users u ON r.referral_code = u.referred_by
            LEFT JOIN token_earnings te ON te.user_id = r.id AND te.source = 'referral_reward'
        `;

        const params = [];
        if (search) {
            query += ` WHERE (r.email ILIKE $1 OR CAST(r.id AS TEXT) = $2)`;
            params.push(`%${search}%`, search);
        }

        query += ` GROUP BY r.id, r.email`;
        query += ` ORDER BY referral_count DESC`;
        query += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, offset);

        const result = await pool.query(query, params);

        // Count for pagination
        // COUNT DISTINCT REFERRERS
        const countQuery = search
            ? `SELECT COUNT(DISTINCT r.id) FROM users r JOIN users u ON r.referral_code = u.referred_by WHERE r.email ILIKE $1 OR CAST(r.id AS TEXT) = $2`
            : `SELECT COUNT(DISTINCT referred_by) FROM users WHERE referred_by IS NOT NULL`;

        const countParams = search ? [`%${search}%`, search] : [];
        const countResult = await pool.query(countQuery, countParams);
        const totalRecords = parseInt(countResult.rows[0].count);

        res.json({
            success: true,
            data: result.rows,
            pagination: {
                page,
                limit,
                total_pages: Math.ceil(totalRecords / limit),
                total_records: totalRecords
            }
        });
    } catch (err) {
        console.error('Referral List Error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// Admin: Adjust Spins for User
exports.adjustSpins = async (req, res) => {
    const { userId, amount, action = 'add' } = req.body; // action: 'add', 'set'
    if (!userId) return res.status(400).json({ success: false, message: "User ID required" });

    try {
        if (action === 'set') {
            await pool.query("UPDATE token_wallets SET spins_left = $1 WHERE user_id = $2", [amount, userId]);
        } else {
            await pool.query("UPDATE token_wallets SET spins_left = spins_left + $1 WHERE user_id = $2", [amount, userId]);
        }

        res.json({ success: true, message: `Spins ${action === 'set' ? 'set' : 'added'} successfully` });
    } catch (err) {
        console.error('Adjust Spins Error:', err);
        res.status(500).json({ success: false, message: "Failed to adjust spins" });
    }
};

// Admin: Adjust Tokens for User
exports.adjustTokens = async (req, res) => {
    const { userId, amount, action = 'add' } = req.body; // action: 'add', 'set'
    if (!userId) return res.status(400).json({ success: false, message: "User ID required" });

    try {
        if (action === 'set') {
            await pool.query("UPDATE token_wallets SET balance = $1 WHERE user_id = $2", [amount, userId]);
        } else {
            // For add, update balance and lifetime if positive
            await pool.query("UPDATE token_wallets SET balance = balance + $1 WHERE user_id = $2", [amount, userId]);
            if (amount > 0) {
                await pool.query("UPDATE token_wallets SET lifetime = lifetime + $1 WHERE user_id = $2", [amount, userId]);
            }
        }

        res.json({ success: true, message: `Tokens ${action === 'set' ? 'set' : 'added'} successfully` });
    } catch (err) {
        console.error('Adjust Tokens Error:', err);
        res.status(500).json({ success: false, message: "Failed to adjust tokens" });
    }
};

// Get Giveaway Tickets
exports.getGiveawayTickets = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const offset = (page - 1) * limit;

        const tickets = await pool.query(`
            SELECT 
                gt.id,
                gt.user_id,
                u.email,
                gt.giveaway_id,
                gt.tickets_purchased,
                gt.tokens_used,
                gt.created_at
            FROM giveaway_tickets gt
            JOIN users u ON gt.user_id = u.id
            ORDER BY gt.created_at DESC
            LIMIT $1 OFFSET $2
        `, [limit, offset]);

        const countResult = await pool.query('SELECT COUNT(*) FROM giveaway_tickets');

        res.json({
            success: true,
            tickets: tickets.rows,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: parseInt(countResult.rows[0].count),
                pages: Math.ceil(parseInt(countResult.rows[0].count) / limit)
            }
        });
    } catch (err) {
        console.error('Get Giveaway Tickets Error:', err);
        res.status(500).json({ success: false, error: err.message });
    }
};

