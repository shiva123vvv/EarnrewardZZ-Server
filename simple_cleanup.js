const { pool } = require('./src/config/db');

async function cleanup() {
    console.log("🧹 Starting Simple Truncate & Spin Reset...");
    try {
        await pool.query('TRUNCATE TABLE withdrawals, giveaway_tickets, referrals, token_earnings, coin_earnings, token_wallets, coin_wallets, otps, users RESTART IDENTITY CASCADE');
        await pool.query('UPDATE token_wallets SET spins_left = 0');
        console.log("✅ Database Truncated & Spins Reset Successfully.");
    } catch (err) {

        console.error("❌ Truncate Failed:", err);
    } finally {
        process.exit(0);
    }
}

cleanup();
