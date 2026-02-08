const { pool } = require('./src/config/db');

async function addColumns() {
    console.log("🔧 Adding missing columns to giveaways...");
    try {
        await pool.query('BEGIN');

        // Add prize_details if missing
        await pool.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='giveaways' AND column_name='prize_details') THEN
                    ALTER TABLE giveaways ADD COLUMN prize_details TEXT DEFAULT 'Check description for details';
                END IF;
            END $$;
        `);

        // Check columns again
        const res = await pool.query("SELECT * FROM giveaways LIMIT 1");
        console.log("Updated Row Keys:", Object.keys(res.rows[0] || {}));

        await pool.query('COMMIT');
        console.log("✅ Columns added.");
    } catch (e) {
        await pool.query('ROLLBACK');
        console.error("❌ Failed:", e);
    } finally {
        process.exit();
    }
}
addColumns();
