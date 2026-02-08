const { pool } = require('./src/config/db');

async function checkCost() {
    try {
        const res = await pool.query("SELECT id, title, ticket_token_cost FROM giveaways");
        console.log("DATA:", JSON.stringify(res.rows, null, 2));
        process.exit();
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}
checkCost();
