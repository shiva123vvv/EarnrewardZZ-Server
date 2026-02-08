const { pool } = require('../config/db');

async function run() {
    try {
        const res = await pool.query("SELECT column_name, is_nullable, column_default FROM information_schema.columns WHERE table_name = 'users'");
        console.table(res.rows);
    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}
run();
