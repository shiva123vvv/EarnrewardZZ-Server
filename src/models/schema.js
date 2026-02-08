const { pool } = require('../config/db');

const initSchema = async () => {
    const client = await pool.connect();
    try {
        console.log("⚙️  Syncing Database Schema...");

        // Start transaction
        await client.query('BEGIN');

        // Use PostgreSQL advisory lock to prevent multiple instances from running schema init simultaneously
        // pg_advisory_xact_lock is automatically released when the transaction commits or rolls back
        await client.query('SELECT pg_advisory_xact_lock(123456)');

        // 0. Core Tables (Users & OTPs)
        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                phone_number TEXT,
                username TEXT UNIQUE,
                password TEXT,
                phone_locked BOOLEAN DEFAULT FALSE,
                referral_code TEXT UNIQUE,
                referred_by TEXT,
                is_referred BOOLEAN DEFAULT FALSE,
                coins INTEGER DEFAULT 0, -- Legacy/fallback
                tokens INTEGER DEFAULT 0, -- Legacy/fallback
                total_earned_coins INTEGER DEFAULT 0, -- Legacy
                total_earned_tokens INTEGER DEFAULT 0, -- Legacy
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS otps (
                email TEXT PRIMARY KEY,
                otp_hash TEXT NOT NULL,
                expiry BIGINT NOT NULL,
                phone_number TEXT,
                is_signup BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 1. Wallets
        await client.query(`
            CREATE TABLE IF NOT EXISTS coin_wallets (
                user_id INTEGER PRIMARY KEY,
                balance INTEGER DEFAULT 0,
                pending INTEGER DEFAULT 0,
                lifetime INTEGER DEFAULT 0,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            
            CREATE TABLE IF NOT EXISTS token_wallets (
                user_id INTEGER PRIMARY KEY,
                balance INTEGER DEFAULT 0,
                lifetime INTEGER DEFAULT 0,
                spins_left INTEGER DEFAULT 0,
                last_spin_date DATE DEFAULT CURRENT_DATE,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

        `);

        // Check columns for existing tables
        await client.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='token_wallets' AND column_name='spins_left') THEN
                    ALTER TABLE token_wallets ADD COLUMN spins_left INTEGER DEFAULT 0;
                    ALTER TABLE token_wallets ADD COLUMN last_spin_date DATE DEFAULT CURRENT_DATE;
                END IF;

            END $$;
        `);

        // 2. Earnings Logs
        await client.query(`
            CREATE TABLE IF NOT EXISTS coin_earnings (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                source TEXT NOT NULL,
                amount INTEGER NOT NULL,
                status TEXT DEFAULT 'approved',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS token_earnings (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                source TEXT NOT NULL,
                amount INTEGER NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // 3. Transactions / Withdrawals / Giveaways / Referrals
        await client.query(`
            CREATE TABLE IF NOT EXISTS withdrawals (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                coins_requested INTEGER NOT NULL,
                amount_usd NUMERIC(10,2),
                payment_method TEXT,
                payment_address TEXT,
                status TEXT DEFAULT 'pending',
                secret_code TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS giveaway_tickets (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                giveaway_id INTEGER NOT NULL,
                tickets_purchased INTEGER DEFAULT 1,
                tokens_used INTEGER DEFAULT 0,
                purchase_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS referrals (
                id SERIAL PRIMARY KEY,
                referrer_user_id INTEGER NOT NULL,
                referred_user_id INTEGER NOT NULL UNIQUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // Check columns for referrals table
        await client.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='referrals' AND column_name='referrer_user_id') THEN
                    ALTER TABLE referrals ADD COLUMN referrer_user_id INTEGER NOT NULL;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='referrals' AND column_name='referred_user_id') THEN
                    ALTER TABLE referrals ADD COLUMN referred_user_id INTEGER NOT NULL UNIQUE;
                END IF;
            END $$;
        `);


        // 4. Platform Settings
        await client.query(`
            CREATE TABLE IF NOT EXISTS platform_settings (
                setting_key TEXT PRIMARY KEY,
                setting_value TEXT NOT NULL,
                description TEXT,
                updated_by TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            -- Seed platform settings if empty
            INSERT INTO platform_settings (setting_key, setting_value, description)
            VALUES 
                ('min_withdrawal_usd', '5.00', 'Minimum withdrawal amount in USD'),
                ('coin_to_usd_rate', '500', 'Number of coins equal to 1 USD'),
                ('daily_ad_limit', '20', 'Maximum ads a user can watch per day')
            ON CONFLICT (setting_key) DO NOTHING;
        `);

        // 3.1 Ensure Users have referral_code
        await client.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='referral_code') THEN
                    ALTER TABLE users ADD COLUMN referral_code TEXT UNIQUE;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='referred_by') THEN
                    ALTER TABLE users ADD COLUMN referred_by TEXT;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='is_referred') THEN
                    ALTER TABLE users ADD COLUMN is_referred BOOLEAN DEFAULT FALSE;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='username') THEN
                    ALTER TABLE users ADD COLUMN username TEXT UNIQUE;
                END IF;
            END $$;
        `);

        // 3.2 Backfill Referral Codes for existing users
        await client.query(`
            DO $$
            BEGIN
                IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='username') THEN
                    UPDATE users 
                    SET referral_code = COALESCE(username, CONCAT(SPLIT_PART(email, '@', 1), FLOOR(RANDOM() * 9999)::TEXT))
                    WHERE referral_code IS NULL;
                ELSE
                    UPDATE users 
                    SET referral_code = CONCAT(SPLIT_PART(email, '@', 1), FLOOR(RANDOM() * 9999)::TEXT)
                    WHERE referral_code IS NULL;
                END IF;
            END $$;
        `);

        // 3.3 Migrate existing referrals to referrals table
        await client.query(`
            INSERT INTO referrals (referrer_user_id, referred_user_id, created_at)
            SELECT r.id, u.id, u.created_at
            FROM users u
            JOIN users r ON u.referred_by = r.referral_code
            ON CONFLICT (referred_user_id) DO NOTHING;
        `);

        // 5. MIGRATION LOGIC
        const walletCheck = await client.query("SELECT COUNT(*) FROM coin_wallets");
        if (parseInt(walletCheck.rows[0].count) === 0) {
            const userCols = await client.query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name='users' AND column_name IN ('coins', 'tokens')
            `);

            if (userCols.rows.length > 0) {
                console.log("⚠️  Migrating Data from Legacy Tables...");
                await client.query(`
                    INSERT INTO coin_wallets (user_id, balance, lifetime)
                    SELECT id, coins, total_earned_coins FROM users
                    ON CONFLICT (user_id) DO NOTHING
                `);

                await client.query(`
                    INSERT INTO token_wallets (user_id, balance, lifetime)
                    SELECT id, tokens, total_earned_tokens FROM users
                    ON CONFLICT (user_id) DO NOTHING
                `);
                console.log("✅ Migration Complete.");
            }
        }

        // 6. Performance Indexes
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
            CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);
            CREATE INDEX IF NOT EXISTS idx_coin_earnings_created_at ON coin_earnings(created_at);
            CREATE INDEX IF NOT EXISTS idx_token_earnings_created_at ON token_earnings(created_at);
            CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON withdrawals(status);
            CREATE INDEX IF NOT EXISTS idx_withdrawals_created_at ON withdrawals(created_at);
            CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_user_id);
            CREATE INDEX IF NOT EXISTS idx_referrals_created_at ON referrals(created_at);
        `);

        // Commit transaction
        await client.query('COMMIT');

        console.log("✅ Schema Synced & Ready.");
    } catch (err) {
        // Rollback on error
        await client.query('ROLLBACK');
        console.error("❌ Schema Init Failed:", err);
    } finally {
        client.release();
    }
};

module.exports = { initSchema };
