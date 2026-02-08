const { pool } = require('./src/config/db');

async function cleanup() {
    const client = await pool.connect();
    try {
        console.log("🧹 Starting Database Cleanup...");
        await client.query('BEGIN');

        // Truncate tables and reset identities
        const tables = [
            'withdrawals',
            'giveaway_tickets',
            'referrals',
            'token_earnings',
            'coin_earnings',
            'token_wallets',
            'coin_wallets',
            'otps',
            'users'
        ];

        for (const table of tables) {
            console.log(`🗑️ Truncating table: ${table}`);
            await client.query(`TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE`);
        }

        await client.query('COMMIT');
        console.log("✅ Database Cleaned Successfully.");
    } catch (err) {
        await client.query('ROLLBACK');
        console.error("❌ Cleanup Failed:", err);
    } finally {
        client.release();
        process.exit(0);
    }
}

cleanup();
