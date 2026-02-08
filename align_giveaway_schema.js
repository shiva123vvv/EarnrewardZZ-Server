const { pool } = require('./src/config/db');

async function alignSchema() {
    console.log("🔧 Aligning schema to Business Rules...");
    try {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            console.log("Checking Giveaways table...");
            // 1. Giveaways - rename ticket_cost to ticket_token_cost
            await client.query(`
                DO $$
                BEGIN
                    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='giveaways' AND column_name='ticket_cost') THEN
                        ALTER TABLE giveaways RENAME COLUMN ticket_cost TO ticket_token_cost;
                        RAISE NOTICE 'Renamed ticket_cost to ticket_token_cost';
                    END IF;
                END $$;
            `);

            console.log("Checking Giveaway Tickets table...");
            // 2. Giveaway Tickets - rename purchase_date to created_at
            await client.query(`
                DO $$
                BEGIN
                    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='giveaway_tickets' AND column_name='purchase_date') THEN
                        ALTER TABLE giveaway_tickets RENAME COLUMN purchase_date TO created_at;
                        RAISE NOTICE 'Renamed purchase_date to created_at';
                    END IF;
                END $$;
            `);

            console.log("Creating Indexes...");
            // 3. Indexes
            await client.query(`CREATE INDEX IF NOT EXISTS idx_gt_user ON giveaway_tickets(user_id)`);
            await client.query(`CREATE INDEX IF NOT EXISTS idx_gt_giveaway ON giveaway_tickets(giveaway_id)`);

            await client.query('COMMIT');
            console.log("✅ Schema aligned successfully.");
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    } catch (e) {
        console.error("❌ Schema alignment failed:", e);
    } finally {
        setTimeout(() => process.exit(0), 1000);
    }
}

alignSchema();
