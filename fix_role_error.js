const db = require('./utils/db');

async function fix() {
    try {
        console.log("Connecting...");
        await db.sequelize.authenticate();
        console.log("Connected. fixing schema...");

        try {
            // Drop the problematic columns and types so they can be recreated cleanly
            await db.sequelize.query('ALTER TABLE "Users" DROP COLUMN IF EXISTS "role" CASCADE;');
            await db.sequelize.query('ALTER TABLE "Users" DROP COLUMN IF EXISTS "status" CASCADE;');
            await db.sequelize.query('ALTER TABLE "Users" DROP COLUMN IF EXISTS "plan_type" CASCADE;');

            // Drop the ENUM types explicitly 
            await db.sequelize.query('DROP TYPE IF EXISTS "enum_Users_role" CASCADE;');
            await db.sequelize.query('DROP TYPE IF EXISTS "enum_Users_status" CASCADE;');
            await db.sequelize.query('DROP TYPE IF EXISTS "enum_Users_plan_type" CASCADE;');

            console.log("Dropped 'role', 'status', 'plan_type' columns and types from 'Users' table.");
        } catch (e) {
            console.log("Error dropping column (might not exist):", e.message);
        }

        console.log("Done.");
        process.exit(0);
    } catch (err) {
        console.error("Fatal Error:", err);
        process.exit(1);
    }
}

fix();
