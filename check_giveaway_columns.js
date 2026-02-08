const { pool } = require('./src/config/db');

async function checkColumns() {
    try {
        const res = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'giveaways'
        `);
        console.log("--- START COLUMNS ---");
        res.rows.forEach(r => console.log(r.column_name));
        console.log("--- END COLUMNS ---");
        process.exit();
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
checkColumns();
