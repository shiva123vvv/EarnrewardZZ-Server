const { pool } = require('../config/db');

// GET Wallet
exports.getWallet = async (req, res) => {
    try {
        const userId = req.user.id;
        const resWallet = await pool.query("SELECT * FROM coin_wallets WHERE user_id = $1", [userId]);

        if (resWallet.rows.length === 0) {
            // Auto-create if missing (failsafe)
            await pool.query("INSERT INTO coin_wallets (user_id) VALUES ($1) ON CONFLICT DO NOTHING", [userId]);
            return res.json({ balance: 0, pending: 0, lifetime: 0 });
        }

        const wallet = resWallet.rows[0];

        // Get Today Stats
        const statsRes = await pool.query(`
            SELECT 
                COUNT(*) as ads_watched,
                COALESCE(SUM(amount), 0) as today_earned
            FROM coin_earnings 
            WHERE user_id = $1 AND created_at >= CURRENT_DATE
        `, [userId]);

        const stats = statsRes.rows[0];

        res.json({
            balance: parseInt(wallet.balance || 0),
            pending: parseInt(wallet.pending || 0),
            lifetime: parseInt(wallet.lifetime || 0),
            adsWatchedToday: parseInt(stats.ads_watched || 0),
            todayEarnedCoins: parseInt(stats.today_earned || 0)
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Coin wallet error" });
    }
};

// POST Earn (Ad Watch)
exports.earnFromAd = async (req, res) => {
    const { source } = req.body; // 'unity', 'admob'
    const userId = req.user.id;
    const amount = 1; // 1 Coin per ad

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 0. Check Limits
        const limitRes = await client.query("SELECT COUNT(*) FROM coin_earnings WHERE user_id = $1 AND created_at >= CURRENT_DATE", [userId]);
        const count = parseInt(limitRes.rows[0].count);
        if (count >= 20) {
            client.release();
            return res.status(400).json({ success: false, message: "Daily limit reached" });
        }

        // 1. Add to Wallet
        await client.query(`
            UPDATE coin_wallets 
            SET balance = balance + $1, lifetime = lifetime + $1, updated_at = NOW()
            WHERE user_id = $2
        `, [amount, userId]);

        // 2. Log Earning
        await client.query(`
            INSERT INTO coin_earnings (user_id, source, amount, status)
            VALUES ($1, $2, $3, 'approved')
        `, [userId, source || 'ad_watch', amount]);

        await client.query('COMMIT');

        // Return new balance
        const newBal = await client.query("SELECT balance FROM coin_wallets WHERE user_id = $1", [userId]);
        res.json({ success: true, newBalance: newBal.rows[0].balance });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Ad Earn Error:", err);
        res.status(500).json({ success: false, message: "Failed to credit coins" });
    } finally {
        client.release();
    }
};

// GET History
exports.getHistory = async (req, res) => {
    try {
        const userId = req.user.id;
        const earnings = await pool.query("SELECT *, 'earning' as type FROM coin_earnings WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50", [userId]);
        const withdrawals = await pool.query("SELECT *, 'withdrawal' as type FROM withdrawals WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50", [userId]);

        const history = [...earnings.rows, ...withdrawals.rows].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        res.json({ success: true, history });
    } catch (err) {
        res.status(500).json({ success: false, message: "History error" });
    }
};

// POST Withdraw Request
exports.requestWithdrawal = async (req, res) => {
    const { amountUSD, method, address } = req.body;
    const userId = req.user.id;
    const COINS_PER_USD = 500;

    if (!amountUSD || amountUSD < 1) return res.status(400).json({ success: false, message: "Min withdrawal $1.00" });

    const coinsNeeded = Math.ceil(amountUSD * COINS_PER_USD);

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Check Balance
        const wRes = await client.query("SELECT balance FROM coin_wallets WHERE user_id = $1 FOR UPDATE", [userId]);
        if (wRes.rows.length === 0) throw new Error("Wallet not found");

        const balance = parseInt(wRes.rows[0].balance);
        if (balance < coinsNeeded) {
            client.release();
            return res.status(400).json({ success: false, message: "Insufficient coins" });
        }

        // 2. Deduct Coins
        await client.query("UPDATE coin_wallets SET balance = balance - $1 WHERE user_id = $2", [coinsNeeded, userId]);

        // 3. Create Withdrawal Record
        const secretCode = Math.random().toString(36).substring(7).toUpperCase();
        await client.query(`
            INSERT INTO withdrawals (user_id, coins_requested, amount_usd, payment_method, payment_address, status, secret_code)
            VALUES ($1, $2, $3, $4, $5, 'pending', $6)
        `, [userId, coinsNeeded, amountUSD, method, address, secretCode]);

        await client.query('COMMIT');

        res.json({ success: true, secretCode, message: "Withdrawal requested" });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Withdraw Error:", err);
        res.status(500).json({ success: false, message: "Withdrawal failed" });
    } finally {
        client.release();
    }
};

// POST Gift Coins
exports.giftCoins = async (req, res) => {
    const { recipientEmail, amountCoins } = req.body;
    const senderId = req.user.id;

    if (!amountCoins || amountCoins <= 0) return res.status(400).json({ success: false, message: "Invalid amount" });
    if (!recipientEmail) return res.status(400).json({ success: false, message: "Recipient email required" });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Check Sender Balance
        const senderWallet = await client.query("SELECT balance FROM coin_wallets WHERE user_id = $1 FOR UPDATE", [senderId]);
        if (senderWallet.rows.length === 0 || parseInt(senderWallet.rows[0].balance) < amountCoins) {
            await client.query('ROLLBACK');
            client.release();
            return res.status(400).json({ success: false, message: "Insufficient coins" });
        }

        // 2. Find Recipient
        const recipientRes = await client.query("SELECT id FROM users WHERE email = $1", [recipientEmail]);
        if (recipientRes.rows.length === 0) {
            await client.query('ROLLBACK');
            client.release();
            return res.status(404).json({ success: false, message: "Recipient user not found" });
        }
        const recipientId = recipientRes.rows[0].id;

        if (senderId === recipientId) {
            await client.query('ROLLBACK');
            client.release();
            return res.status(400).json({ success: false, message: "Cannot gift to yourself" });
        }

        // 3. Deduct from Sender
        await client.query("UPDATE coin_wallets SET balance = balance - $1 WHERE user_id = $2", [amountCoins, senderId]);

        // 4. Add to Recipient
        await client.query("INSERT INTO coin_wallets (user_id) VALUES ($1) ON CONFLICT DO NOTHING", [recipientId]);
        await client.query("UPDATE coin_wallets SET balance = balance + $1, lifetime = lifetime + $1 WHERE user_id = $2", [amountCoins, recipientId]);

        // 5. Log Transaction (Sender) - as Withdrawal
        const secretCode = Math.random().toString(36).substring(7).toUpperCase();
        await client.query(`
            INSERT INTO withdrawals (user_id, coins_requested, amount_usd, payment_method, payment_address, status, secret_code)
            VALUES ($1, $2, 0, 'gift_sent', $3, 'completed', $4)
        `, [senderId, amountCoins, recipientEmail, secretCode]);

        // 6. Log Transaction (Recipient) - as Earning
        await client.query(`
            INSERT INTO coin_earnings (user_id, source, amount, status)
            VALUES ($1, 'gift_received', $2, 'approved')
        `, [recipientId, amountCoins]);

        await client.query('COMMIT');
        res.json({ success: true, message: "Gift sent successfully!" });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Gift Error:", err);
        res.status(500).json({ success: false, message: "Gift failed" });
    } finally {
        if (client) client.release();
    }
};
