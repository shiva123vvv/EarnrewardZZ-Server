const db = require('../utils/db');
const User = require('../models/User');
const GlobalLimit = require('../models/GlobalLimit');
const { LIMITS } = require('../utils/constants');

async function seed() {
    await db.authenticate();
    console.log('Seeding Demo Data...');

    // 1. Ensure Global Limits exist
    let limits = await GlobalLimit.findOne();
    if (!limits) {
        limits = await GlobalLimit.create({
            daily_limit_free: 50,
            daily_limit_paid: 100,
            limit_ads_free: LIMITS.free.rewarded_ads,
            limit_ads_paid: LIMITS.pro.rewarded_ads,
            limit_tasks_free: LIMITS.free.incentive_tasks,
            limit_tasks_paid: LIMITS.pro.incentive_tasks,
            // ... add others if needed, using defaults
        });
        console.log('Global Limits Created');
    }

    // 2. Create Demo User
    // Note: We cannot restore the exact previous random ID.
    // We create a predictable one or just one.
    const email = 'demo@example.com';
    let user = await User.findOne({ where: { email } });

    if (!user) {
        user = await User.create({
            name: 'Demo User',
            email: email,
            password: 'password123', // Demo password
            role: 'user',
            wallet_balance: 0,
            points_balance: 0,
            plan_type: 'free',
            email_verified: true,
            status: 'active'
        });
        console.log(`Created Demo User: ${email} (ID: ${user.id})`);
    } else {
        console.log(`User ${email} already exists.`);
    }

    console.log('Done.');
    process.exit(0);
}

seed().catch(err => {
    console.error(err);
    process.exit(1);
});
