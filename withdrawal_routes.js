
// --- WITHDRAWAL SYSTEM ---

// 9. Init Withdrawal Tables
const initWithdrawalSystem = async () => {
    try {
        const client = await pool.connect();
        await client.query(`
            CREATE TABLE IF NOT EXISTS withdrawals (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id),
                amount_usd NUMERIC(10, 2) NOT NULL,
                coins_deducted INTEGER NOT NULL,
                paypal_email TEXT NOT NULL,
                status TEXT DEFAULT 'pending', -- pending, paid, rejected
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        client.release();
        console.log("✅ WITHDRAWAL SYSTEM: Tables Ready.");
    } catch (err) {
        console.error("❌ WITHDRAWAL TABLES:", err.message);
    }
};
initWithdrawalSystem();

// 10. Withdrawal Routes

// Request Withdrawal
app.post('/api/withdrawals/request', auth, async (req, res) => {
    const { amount, email } = req.body; // Amount in USD

    if (!amount || amount < 1) return res.status(400).json({ success: false, message: "Minimum $1.00" });
    if (!email) return res.status(400).json({ success: false, message: "Email required" });

    const COINS_PER_USD = 500;
    const coinsRequired = Math.ceil(amount * COINS_PER_USD);

    let client;
    try {
        client = await pool.connect();

        // 1. Check Balance
        const resUser = await client.query("SELECT tokens FROM users WHERE id = $1", [req.user.id]);
        const balance = resUser.rows[0].tokens;

        if (balance < coinsRequired) {
            return res.status(400).json({ success: false, message: "Insufficient coins" });
        }

        await client.query('BEGIN');

        // 2. Deduct
        await client.query("UPDATE users SET tokens = tokens - $1 WHERE id = $2", [coinsRequired, req.user.id]);

        // 3. Record
        await client.query(
            "INSERT INTO withdrawals (user_id, amount_usd, coins_deducted, paypal_email) VALUES ($1, $2, $3, $4)",
            [req.user.id, amount, coinsRequired, email]
        );

        await client.query('COMMIT');

        // 4. Get New Balance
        const finalRes = await client.query("SELECT tokens FROM users WHERE id = $1", [req.user.id]);

        res.json({ success: true, message: "Withdrawal requested!", newBalance: finalRes.rows[0].tokens });

    } catch (err) {
        if (client) await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ success: false, message: "Transaction failed" });
    } finally {
        if (client) client.release();
    }
});
