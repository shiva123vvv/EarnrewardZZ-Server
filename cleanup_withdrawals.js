const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const db = require('./utils/db');
const User = require('./models/User');
const Withdrawal = require('./models/Withdrawal');
const { Op } = require('sequelize');

const cleanup = async () => {
    try {
        await db.checkConnection();
        console.log("🧹 Starting Cleanup...");

        // 1. Identify Demo Users
        // In local JSON DB, Op.like might not be fully supported by my custom db.js find logic 
        // if it delegates to array.filter, but let's try to use standard logic first.
        // If db.js falls back to JSON, findAll returns all, so we filter manually.

        const allUsers = await User.findAll();
        const demoUsers = allUsers.filter(u =>
            u.email && (
                u.email.includes('demo_user') ||
                u.email.includes('test@') ||
                u.email.includes('fake@') ||
                u.firebase_uid === 'demo_uid_12345'
            )
        );

        const demoUserIds = demoUsers.map(u => u.id);
        console.log(`Found ${demoUserIds.length} demo users to remove:`, demoUserIds);

        // 2. Remove Withdrawals linked to these users
        const allWithdrawals = await Withdrawal.findAll();
        const withdrawalsToRemove = allWithdrawals.filter(w =>
            demoUserIds.includes(w.user_id) ||
            (w.paypal_email && w.paypal_email.includes('demo')) ||
            (w.upi_id && w.upi_id.includes('demo')) ||
            (w.admin_note && w.admin_note.includes('Mock'))
        );

        console.log(`Found ${withdrawalsToRemove.length} withdrawals to remove.`);

        // 3. Execute Deletion
        // Deleting withdrawals
        for (const w of withdrawalsToRemove) {
            // Check if destroy exists on the instance (sequelize) or use static destroy
            if (w.destroy) {
                await w.destroy();
            } else {
                // If JSON mode, we might need a different approach or the db.js 'destroy' method handles querying
                await Withdrawal.destroy({ where: { id: w.id } });
            }
        }

        // Deleting users
        for (const u of demoUsers) {
            if (u.destroy) {
                await u.destroy();
            } else {
                await User.destroy({ where: { id: u.id } });
            }
        }

        console.log("✅ Cleanup Complete. All demo data removed.");

    } catch (err) {
        console.error("Cleanup Error:", err);
    }
    process.exit();
};

cleanup();
