const db = require('./utils/db');
require('dotenv').config();

// Initialize ALL Models to ensure they are registered with Sequelize
const models = [
    'User', 'DailyUsage', 'WalletTransaction', 'Platform',
    'AdminLog', 'Referral', 'Withdrawal', 'SystemSetting',
    'UserTask', 'EarningsLog', 'RevenueLog', 'Giveaway', 'GiveawayTicket'
];

models.forEach(m => {
    try {
        require(`./models/${m}`);
    } catch (e) {
        console.warn(`Warning: Could not load model ${m}: ${e.message}`);
    }
});

const reset = async () => {
    try {
        console.log("Connecting to Database...");
        await db.checkConnection();

        console.log("⚠️  DELETING ALL DATA (force: true)...");

        if (!db.isJson()) {
            // SQL Mode: Drop and Recreate All Tables
            await db.sequelize.sync({ force: true });
            console.log("✅ SQL Tables Dropped and Recreated.");
        } else {
            // JSON Mode: Delete file
            const fs = require('fs');
            const path = require('path');
            const dbFile = path.join(__dirname, '../data/database.json');
            if (fs.existsSync(dbFile)) {
                fs.unlinkSync(dbFile);
                console.log("✅ JSON Database File Deleted.");
            }
        }

        console.log("✅ Database Reset Complete. Restart your server to re-seed initial data.");
        process.exit(0);
    } catch (err) {
        console.error("❌ Error resetting database:", err);
        process.exit(1);
    }
};

reset();
