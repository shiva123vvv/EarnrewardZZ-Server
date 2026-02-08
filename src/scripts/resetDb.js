const { pool } = require('../config/db');

const resetDb = async () => {
    const client = await pool.connect();
    try {
        console.log("🗑️  Deleting all user data...");

        // Truncate tables with CASCADE to handle foreign keys
        // valid tables based on our schema
        await client.query(`
            TRUNCATE TABLE 
                users, 
                otps, 
                coin_wallets, 
                token_wallets, 
                coin_earnings, 
                token_earnings, 
                withdrawals, 
                giveaway_tickets 
            RESTART IDENTITY CASCADE;
        `);

        console.log("✅ All user data deleted successfully.");
    } catch (err) {
        console.error("❌ Error deleting data:", err);
    } finally {
        client.release();
        process.exit();
    }
};

resetDb();
