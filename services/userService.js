const User = require('../models/User');
const DailyUsage = require('../models/DailyUsage');
const WalletTransaction = require('../models/WalletTransaction');
const { LIMITS, PLAN_DETAILS } = require('../utils/constants');

// Helper to check if today is a new day compared to last_reset
const isNewDay = (lastResetDate) => {
    const now = new Date();
    const last = new Date(lastResetDate);
    return now.getDate() !== last.getDate() ||
        now.getMonth() !== last.getMonth() ||
        now.getFullYear() !== last.getFullYear();
};

const getOrUpdateUserStatus = async (userId) => {
    let user = await User.findByPk(userId);
    if (!user) throw new Error('User not found');

    let usage = await DailyUsage.findOne({ where: { user_id: userId } });
    if (!usage) {
        usage = await DailyUsage.create({ user_id: userId });
    }

    const now = new Date();
    let statusChanged = false;
    let resetDaily = false;

    // 1. Check Plan Expiry
    if (user.plan_type === 'pro' && user.plan_expiry && new Date(user.plan_expiry) < now) {
        user.plan_type = 'free';
        user.plan_expiry = null;
        statusChanged = true;
        resetDaily = true;
    }

    // 2. Check Daily Reset (New Day)
    if (isNewDay(usage.last_reset_at) || resetDaily) {
        usage.incentive_tasks_today = 0;
        usage.rewarded_ads_today = 0;
        usage.surveys_today = 0;
        usage.premium_cpa_today = 0;
        usage.earnings_today = 0;
        usage.last_reset_at = now;
        await usage.save();
    }

    if (statusChanged) await user.save();

    return { user, usage };
};

const upgradeToPro = async (userId) => {
    // Transaction recommended for atomic operations
    const { user, usage } = await getOrUpdateUserStatus(userId);

    if (user.plan_type === 'pro') {
        throw new Error('Already on Pro plan');
    }

    if (user.wallet_balance < PLAN_DETAILS.pro.price) {
        throw new Error('Insufficient wallet balance');
    }

    // Deduct Balance
    user.wallet_balance -= PLAN_DETAILS.pro.price;

    // Set Plan
    user.plan_type = 'pro';
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + PLAN_DETAILS.pro.duration_days);
    user.plan_expiry = expiry;

    await user.save();

    // Create Transaction
    await WalletTransaction.create({
        user_id: user.id,
        amount: PLAN_DETAILS.pro.price,
        type: 'debit',
        reason: 'Pro Plan Upgrade (30 Days)'
    });

    // Reset Daily Counters
    usage.incentive_tasks_today = 0;
    usage.rewarded_ads_today = 0;
    usage.surveys_today = 0;
    usage.premium_cpa_today = 0;
    usage.earnings_today = 0;
    usage.last_reset_at = new Date();
    await usage.save();

    return { user, usage };
};

const checkAndRecordEarning = async (userId, actionType, earningAmount, platformId = null, taskId = null) => {
    const { user, usage } = await getOrUpdateUserStatus(userId);
    const plan = user.plan_type;
    const globalLimits = LIMITS[plan];

    // 1. Check Global Daily Earning Cap
    if (usage.earnings_today + earningAmount > globalLimits.daily_earning_cap) {
        throw new Error(`Daily earning cap of $${globalLimits.daily_earning_cap} reached.`);
    }

    // 2. Resolve Platform details
    let platformName = 'Unknown';
    let platformCategory = actionType; // Default to actionType if no platform
    let platform = null; // Declare platform here for broader scope

    if (platformId) {
        platform = await Platform.findByPk(platformId); // Fetch platform once
        if (platform) {
            platformName = platform.name;
            platformCategory = platform.category;
        }
    }

    // 2. Check Action Limit (Platform Specific OR Global Fallback)
    let usageField;
    let limitValue;
    let limitSource = 'Global Limit';

    // Map actionType to usage field in DailyUsage
    if (actionType === 'task') { usageField = 'incentive_tasks_today'; }
    else if (actionType === 'ad') { usageField = 'rewarded_ads_today'; }
    else if (actionType === 'survey') { usageField = 'surveys_today'; }
    else if (actionType === 'premium') { usageField = 'premium_cpa_today'; }
    else { throw new Error('Invalid action type'); }

    // Resolve Limit
    if (platformId && platform && platform.status === 'enabled') { // Use the already fetched platform
        const config = platform.config || {};

        if (['ads', 'tasks', 'surveys', 'installs', 'cpm'].includes(platform.category)) {

            // TASKS
            if (platform.category === 'tasks') {
                const { Op } = require('sequelize');
                let riskMultiplier = 1.0;
                let cooldownHours = platform.cooldown_hours || 24;

                if (platform.risk_level === 'medium') riskMultiplier = 0.8;
                else if (platform.risk_level === 'high' || platform.risk_level === 'critical') {
                    riskMultiplier = 0.5;
                    cooldownHours = 24;
                }

                let dailyLimitBase = plan === 'pro' ? (config.paid_limit || 0) : (config.free_limit || 0);
                const effectiveLimit = Math.floor(dailyLimitBase * riskMultiplier);

                limitValue = effectiveLimit;
                limitSource = `${platform.name} (Risk: ${platform.risk_level}) Limit`;
                usageField = 'incentive_tasks_today';

                if (usage[usageField] >= limitValue) {
                    throw new Error(`Daily limit reached for ${platform.name} (Risk Adjusted: ${limitValue}).`);
                }

                // User Cap
                const userCap = plan === 'pro' ? platform.user_cap_paid : platform.user_cap_free;
                if (userCap > 0) {
                    const totalEarned = await WalletTransaction.sum('amount', {
                        where: { user_id: userId, type: 'credit', reason: { [Op.like]: `%Platform #${platformId})%` } }
                    }) || 0;
                    if ((totalEarned + earningAmount) > userCap) throw new Error(`Historical earning limit exceeded for ${platform.name}.`);
                }

                // Cooldown
                const lastTx = await WalletTransaction.findOne({
                    where: { user_id: userId, reason: { [Op.like]: `%Platform #${platformId})%` } },
                    order: [['createdAt', 'DESC']]
                });
                if (lastTx) {
                    const hoursSince = (new Date() - new Date(lastTx.createdAt)) / (1000 * 60 * 60);
                    if (hoursSince < cooldownHours) throw new Error(`Cooldown active for ${platform.name}.`);
                }

                // Rotation
                if (platform.rotation_enabled) {
                    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
                    const tasksToday = await WalletTransaction.count({
                        where: { user_id: userId, reason: { [Op.like]: `%Platform #${platformId})%` }, createdAt: { [Op.gte]: startOfDay } }
                    });
                    if (tasksToday >= 1) throw new Error(`Rotation Active: One task per day limit.`);
                }

            } else if (platform.category === 'ads') {
                // Ads Logic
                if (platform.per_user_payout_limit > 0) {
                    const { Op } = require('sequelize');
                    const totalEarned = await WalletTransaction.sum('amount', {
                        where: { user_id: userId, type: 'credit', reason: { [Op.like]: `%Platform #${platformId})%` } }
                    }) || 0;
                    if ((totalEarned + earningAmount) > platform.per_user_payout_limit) throw new Error(`Limit reached for this platform.`);
                }
                const specificLimit = plan === 'pro' ? config.paid_limit : config.free_limit;
                if (specificLimit !== undefined && specificLimit !== null) {
                    limitValue = specificLimit;
                    limitSource = `${platform.name} Limit`;
                }
            } else if (platform.category === 'installs') {
                // Installs Logic
                const { Op } = require('sequelize');
                const cooldownHours = platform.config.cooldown_hours || 48;
                const lastTx = await WalletTransaction.findOne({
                    where: { user_id: userId, reason: { [Op.like]: `%Platform #${platformId})%` } },
                    order: [['createdAt', 'DESC']]
                });
                if (lastTx) {
                    const hoursSince = (new Date() - new Date(lastTx.createdAt)) / (1000 * 60 * 60);
                    if (hoursSince < cooldownHours) throw new Error(`App Install Cooldown: Wait ${Math.ceil(cooldownHours - hoursSince)}h.`);
                }
                const userCap = plan === 'pro' ? platform.user_cap_paid : platform.user_cap_free;
                if (userCap > 0) {
                    const totalEarned = await WalletTransaction.sum('amount', {
                        where: { user_id: userId, type: 'credit', reason: { [Op.like]: `%Platform #${platformId})%` } }
                    }) || 0;
                    if ((totalEarned + earningAmount) > userCap) throw new Error(`Limit reached ($${userCap}).`);
                }
                const specificLimit = plan === 'pro' ? config.paid_limit : config.free_limit;
                if (specificLimit !== undefined && specificLimit !== null) {
                    limitValue = specificLimit;
                    limitSource = `${platform.name} Limit`;
                }
            } else if (platform.category === 'cpm') {
                // CPM Logic
                const { Op } = require('sequelize');
                // Simplistic CPM check
                limitValue = 999999;
                const userCap = plan === 'pro' ? platform.user_cap_paid : platform.user_cap_free;
                if (userCap > 0) {
                    const totalEarned = await WalletTransaction.sum('amount', {
                        where: { user_id: userId, type: 'credit', reason: { [Op.like]: `%Platform #${platformId})%` } }
                    }) || 0;
                    if ((totalEarned + earningAmount) > userCap) throw new Error(`Limit reached ($${userCap}).`);
                }
            }
        } else {
            limitValue = 999999;
            limitSource = 'Unlimited';
        }
    }

    // Fallback Limit
    if (limitValue === undefined) {
        const limitKeyMap = { 'task': 'incentive_tasks', 'ad': 'rewarded_ads', 'survey': 'surveys', 'premium': 'premium_cpa' };
        limitValue = globalLimits[limitKeyMap[actionType]];
    }

    // Check Usage vs Limit
    if (usage[usageField] >= limitValue) {
        throw new Error(`Daily limit reached for this activity (${limitSource}: ${limitValue}).`);
    }

    // 3. UPDATE TASK STATUS (If taskId provided)
    if (taskId) {
        const userTask = await UserTask.findOne({ where: { id: taskId, user_id: userId } });
        if (userTask) {
            if (userTask.status === 'completed') throw new Error("Task already completed.");
            userTask.status = 'completed'; // Or pending_approval depending on flow, assume instant for now
            userTask.completed_at = new Date();
            await userTask.save();
        }
    } else if (platformId && actionType === 'task') {
        // Try to find open task for this platform if id not explicit
        const task = await UserTask.findOne({
            where: { user_id: userId, platform_id: platformId, status: 'in_progress' },
            order: [['started_at', 'DESC']]
        });
        if (task) {
            task.status = 'completed';
            task.completed_at = new Date();
            await task.save();
        }
    }

    // 4. Increment and Save Usage
    usage[usageField] += 1;
    usage.earnings_today += earningAmount;
    await usage.save();

    // 5. Update Wallet
    user.wallet_balance += earningAmount;
    await user.save();

    // 6. Create Wallet Transaction
    await WalletTransaction.create({
        user_id: user.id,
        amount: earningAmount,
        type: 'credit',
        reason: `Earning: ${actionType}${platformId ? ` (Platform #${platformId})` : ''}`
    });

    // 7. Create Earnings Log (for immutable history)
    await EarningsLog.create({
        user_id: user.id,
        amount: earningAmount,
        createdAt: new Date()
    });

    // 8. Create Revenue Log (For Admin Stats & Limits)
    // Simulate Gross Revenue (e.g. 50% profit margin)
    const grossAmount = earningAmount * 2;
    const commission = grossAmount - earningAmount;

    await RevenueLog.create({
        user_id: user.id,
        source: actionType, // Use actionType 'task', 'ad' etc as category/source
        platform_name: platformName,
        gross_amount: grossAmount,
        user_earning: earningAmount,
        platform_commission: commission,
        created_at: new Date()
    });

    return { user, usage, earned: earningAmount };
};

module.exports = {
    getOrUpdateUserStatus,
    upgradeToPro,
    checkAndRecordEarning
};
