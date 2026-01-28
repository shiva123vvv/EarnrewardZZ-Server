const db = require('../utils/db');
const User = require('../models/User');
const GlobalLimit = require('../models/GlobalLimit');
const DailyUsage = require('../models/DailyUsage');
const WalletTransaction = require('../models/WalletTransaction');
const RevenueLog = require('../models/RevenueLog');
const { LIMITS } = require('../utils/constants');

async function resetAll() {
    await db.authenticate();
    console.log('Resetting all System Data...');

    // 1. Reset Global Limits to Constants
    let gl = await GlobalLimit.findOne();
    if (!gl) gl = await GlobalLimit.create({});

    await gl.update({
        daily_limit_free: LIMITS.free.daily_earning_cap,
        daily_limit_paid: LIMITS.pro.daily_earning_cap,
        limit_ads_free: LIMITS.free.rewarded_ads,
        limit_ads_paid: LIMITS.pro.rewarded_ads,
        limit_tasks_free: LIMITS.free.incentive_tasks,
        limit_tasks_paid: LIMITS.pro.incentive_tasks,
        limit_surveys_free: LIMITS.free.surveys,
        limit_surveys_paid: LIMITS.pro.surveys,
        limit_installs_free: LIMITS.free.premium_cpa,
        limit_installs_paid: LIMITS.pro.premium_cpa,
        limit_cpm_free: 0, // Explicit 0
        limit_cpm_paid: 0
    });
    console.log('Global Limits Reset to Default.');

    // 2. Reset Users (Balance 0)
    // We update ALL users to clean state
    const users = await User.findAll();
    for (const u of users) {
        await u.update({
            wallet_balance: 0.00,
            points_balance: 0
        });
    }
    console.log(`Reset ${users.length} Users to $0.00.`);

    // 3. Reset Daily Usage
    const usages = await DailyUsage.findAll();
    for (const d of usages) {
        await d.update({
            incentive_tasks_today: 0,
            rewarded_ads_today: 0,
            surveys_today: 0,
            premium_cpa_today: 0,
            earnings_today: 0
        });
    }
    console.log(`Reset ${usages.length} Daily Usage records.`);

    // 4. Clear Activity Logs (Simulate fresh start)
    // In JSON DB we can't easily truncate without iterating destroy or wiping file.
    // Iterating destroy is safe.
    const logs = await RevenueLog.findAll();
    for (const l of logs) await l.destroy();

    const txs = await WalletTransaction.findAll();
    for (const t of txs) await t.destroy();

    console.log('Cleared Activity Logs.');
    process.exit(0);
}

resetAll().catch(e => {
    console.error(e);
    process.exit(1);
});
